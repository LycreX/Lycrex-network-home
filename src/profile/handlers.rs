use crate::config::get_oauth_config;
use super::models::ProcessedCodes;
use crate::profile::utils;
use axum::{
    extract::{Query, Multipart, State},
    response::{Redirect, Json, IntoResponse},
    http::StatusCode,
    Extension,
};
use std::collections::HashMap;
use rimplog::{error, info};
use serde_json::{self, json};
use std::sync::{Arc, Mutex};
use tower_cookies::{Cookie, Cookies};
use crate::db::{self, get_user_note, save_user_note};

type ClientState = Arc<reqwest::Client>;
type ProcessedCodesState = Arc<Mutex<ProcessedCodes>>;

/// 首页路由
pub async fn index(
    cookies: Cookies,
    Extension(_client): Extension<ClientState>,
) -> impl IntoResponse {
    // 检查是否已经登录（通过access_token cookie判断）
    if cookies.get("access_token").is_some() {
        // 如果有token，重定向到profile页面
        return Redirect::to("/profile").into_response();
    }

    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 构建OAuth登录URL用于前端js获取
    let oauth_url = format!(
        "{}/api/oauth/authorize?response_type=lycrex&client_id={}&redirect_uri={}",
        oauth_config.auth_server_url, oauth_config.client_id, oauth_config.redirect_uri
    );
    
    // 直接返回HTML内容
    const LOGIN_HTML: &str = include_str!("../../home/auth/index.html");
    
    // 替换HTML中的oauth_url占位符
    let html = LOGIN_HTML.replace("{{ oauth_url }}", &oauth_url);
    
    axum::response::Html(html).into_response()
}

/// 用户登录回调页面 - 显示等待验证的HTML页面
pub async fn oauth_callback_page() -> impl IntoResponse {
    const CALLBACK_HTML: &str = include_str!("../../home/auth/callback/index.html");
    axum::response::Html(CALLBACK_HTML)
}

/// 处理OAuth授权码并获取令牌 - 返回JSON响应
pub async fn oauth_callback_process(
    Query(params): Query<HashMap<String, String>>,
    Extension(client): Extension<ClientState>,
    Extension(processed_codes): Extension<ProcessedCodesState>,
    cookies: Cookies,
) -> impl IntoResponse {
    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 从查询参数中提取授权码
    let code = match params.get("code") {
        Some(code) => code.clone(),
        None => {
            error!("回调请求中没有授权码");
            return Json(json!({
                "status": "error",
                "error": "未收到授权码",
                "redirect": "/auth?error=no_code"
            })).into_response();
        }
    };

    // 检查授权码是否已经处理过，防止重复处理
    {
        let mut codes = processed_codes.lock().unwrap();
        if codes.codes.contains(&code) {
            info!("授权码已被处理，返回处理中状态");
            return Json(json!({
                "status": "processing",
                "redirect": "/profile"
            })).into_response();
        }
        
        // 记录此授权码已经开始处理
        codes.codes.insert(code.clone());
    }

    info!("收到授权码: {}", code);
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // 使用授权码获取访问令牌
    match utils::get_token_with_code(&client, &oauth_config, &code).await {
        Ok(token) => {
            info!("成功获取访问令牌");
            
            // 使用访问令牌获取用户信息
            match utils::get_user_info(&client, &oauth_config, &token.access_token).await {
                Ok(user) => {
                    info!("成功获取用户信息: {}", user.username);
                    
                    // 创建访问令牌cookie
                    let mut token_cookie = Cookie::new("access_token", token.access_token);
                    token_cookie.set_path("/");
                    token_cookie.set_http_only(true);
                    token_cookie.set_max_age(time::Duration::seconds(token.expires_in));
                    
                    // 创建用户信息cookie
                    let mut user_cookie = Cookie::new("user_info", serde_json::to_string(&user).unwrap());
                    user_cookie.set_path("/");
                    user_cookie.set_http_only(true);
                    user_cookie.set_max_age(time::Duration::seconds(token.expires_in));
                    
                    cookies.add(token_cookie);
                    cookies.add(user_cookie);
                    
                    // 返回成功状态和重定向信息
                    Json(json!({
                        "status": "success",
                        "redirect": "/profile",
                        "user": user
                    })).into_response()
                },
                Err(e) => {
                    error!("获取用户信息失败: {}", e);
                    Json(json!({
                        "status": "error",
                        "error": "获取用户信息失败",
                        "redirect": "/auth?error=userinfo_error"
                    })).into_response()
                }
            }
        },
        Err(e) => {
            error!("获取令牌失败: {}", e);
            Json(json!({
                "status": "error",
                "error": "获取授权令牌失败",
                "redirect": "/auth?error=token_error"
            })).into_response()
        }
    }
}

/// 处理头像上传的API
pub async fn upload_avatar(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 获取用户ID
    let user_info_url = format!("{}/api/oauth/userinfo", oauth_config.auth_server_url);
    let user_response = match client
        .get(&user_info_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("请求用户信息失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "获取用户信息失败"
                }))).into_response();
            }
        };

    if !user_response.status().is_success() {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": "获取用户信息失败"
        }))).into_response();
    }

    // 解析用户ID
    let user_info = match user_response.json::<serde_json::Value>().await {
        Ok(json) => json,
        Err(e) => {
            error!("解析用户信息失败: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "解析用户信息失败"
            }))).into_response();
        }
    };

    let user_id = match user_info.get("id") {
        Some(id) => id.as_str().unwrap_or_default(),
        None => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "用户ID不存在"
            }))).into_response();
        }
    };

    // 处理文件上传
    let mut avatar_data = None;
    
    while let Some(field) = multipart.next_field().await.unwrap_or(None) {
        let field_name = field.name().unwrap_or_default().to_string();
        
        if field_name == "avatar" {
            // 读取文件数据
            match field.bytes().await {
                Ok(bytes) => {
                    // 检查文件大小
                    if bytes.len() > 4 * 1024 * 1024 {  // 4MB限制
                        return (StatusCode::BAD_REQUEST, Json(json!({
                            "error": "文件过大，限制为4MB"
                        }))).into_response();
                    }
                    
                    avatar_data = Some(bytes.to_vec());
                },
                Err(e) => {
                    error!("读取文件块失败: {}", e);
                    return (StatusCode::BAD_REQUEST, Json(json!({
                        "error": "读取文件数据失败"
                    }))).into_response();
                }
            }
            break;
        }
    }

    // 如果没有上传文件
    let avatar_bytes = match avatar_data {
        Some(bytes) => bytes,
        None => {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "error": "没有找到头像文件"
            }))).into_response();
        }
    };

    // 将文件发送到授权服务器
    let avatar_url = format!("{}/api/users/{}/avatar", oauth_config.auth_server_url, user_id);
    
    // 创建multipart表单
    let form = reqwest::multipart::Form::new()
        .part("avatar", reqwest::multipart::Part::bytes(avatar_bytes)
            .file_name("avatar.png")
            .mime_str("image/png").unwrap());
    
    // 发送请求
    let response = match client
        .post(&avatar_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .multipart(form)
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("上传头像失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "上传头像失败"
                }))).into_response();
            }
        };

    // 检查响应状态
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        error!("上传头像失败，状态码: {}, 错误: {}", status, error_text);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": format!("上传头像失败: {}", error_text)
        }))).into_response();
    }

    // 返回成功响应
    Json(json!({
        "success": true,
        "message": "头像上传成功"
    })).into_response()
}

/// 获取用户信息API
pub async fn get_user_info_api(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
) -> impl IntoResponse {
    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 获取用户信息
    let user_info_url = format!("{}/api/oauth/userinfo", oauth_config.auth_server_url);

    let response = match client
        .get(&user_info_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("请求用户信息失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "获取用户信息失败"
                }))).into_response();
            }
        };

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        error!("获取用户信息响应错误: {}", error_text);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": "获取用户信息失败"
        }))).into_response();
    }

    // 获取原始JSON响应
    match response.text().await {
        Ok(text) => {
            // 尝试解析为JSON以确保是有效的JSON
            match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(json_value) => Json(json_value).into_response(),
                Err(e) => {
                    error!("解析响应JSON失败: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                        "error": "无效的JSON响应"
                    }))).into_response()
                }
            }
        },
        Err(e) => {
            error!("读取响应内容失败: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "读取响应失败"
            }))).into_response()
        }
    }
}

/// 获取用户登录统计API
pub async fn get_login_stats_api(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
) -> impl IntoResponse {
    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 从userinfo接口获取用户ID
    let user_info_url = format!("{}/api/oauth/userinfo", oauth_config.auth_server_url);
    
    let user_response = match client
        .get(&user_info_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("请求用户信息失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "获取用户信息失败"
                }))).into_response();
            }
        };

    if !user_response.status().is_success() {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": "获取用户信息失败"
        }))).into_response();
    }

    // 解析用户ID
    let user_info = match user_response.json::<serde_json::Value>().await {
        Ok(json) => json,
        Err(e) => {
            error!("解析用户信息失败: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "解析用户信息失败"
            }))).into_response();
        }
    };

    let user_id = match user_info.get("id") {
        Some(id) => id.as_str().unwrap_or_default(),
        None => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "用户ID不存在"
            }))).into_response();
        }
    };

    // 请求登录统计数据
    let stats_url = format!("{}/api/users/{}/login-stats", oauth_config.auth_server_url, user_id);
    
    let stats_response = match client
        .get(&stats_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("请求登录统计失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "获取登录统计失败"
                }))).into_response();
            }
        };

    if !stats_response.status().is_success() {
        let error_text = stats_response.text().await.unwrap_or_default();
        error!("获取登录统计响应错误: {}", error_text);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
            "error": "获取登录统计失败"
        }))).into_response();
    }

    // 返回原始JSON响应
    match stats_response.text().await {
        Ok(text) => {
            match serde_json::from_str::<serde_json::Value>(&text) {
                Ok(json_value) => Json(json_value).into_response(),
                Err(e) => {
                    error!("解析响应JSON失败: {}", e);
                    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                        "error": "无效的JSON响应"
                    }))).into_response()
                }
            }
        },
        Err(e) => {
            error!("读取响应内容失败: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "读取响应失败"
            }))).into_response()
        }
    }
}

/// 个人资料页面路由 - 直接返回HTML内容
pub async fn profile() -> impl IntoResponse {
    const PROFILE_HTML: &str = include_str!("../../home/profile/index.html");
    axum::response::Html(PROFILE_HTML)
}

/// 登出路由
pub async fn logout(cookies: Cookies) -> impl IntoResponse {
    // 清除cookie并重定向到登录页面
    let mut access_token = Cookie::new("access_token", "");
    access_token.set_path("/");
    access_token.set_max_age(time::Duration::seconds(0));
    
    let mut user_info = Cookie::new("user_info", "");
    user_info.set_path("/");
    user_info.set_max_age(time::Duration::seconds(0));
    
    cookies.remove(access_token);
    cookies.remove(user_info);
    
    Redirect::to("/auth")
}

// 保存用户备忘录
pub async fn save_user_notes_api(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 获取用户信息
    let user_id = match utils::get_user_id_from_token(&client, &access_token).await {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "获取用户ID失败"
            }))).into_response();
        }
    };

    // 从请求体中获取备忘录内容
    let content = match payload.get("content") {
        Some(content) => match content.as_str() {
            Some(text) => text,
            None => {
                return (StatusCode::BAD_REQUEST, Json(json!({
                    "error": "备忘录内容必须是字符串"
                }))).into_response();
            }
        },
        None => {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "error": "请求中未包含备忘录内容"
            }))).into_response();
        }
    };

    // 获取当前时间戳，将用于返回给客户端
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 保存备忘录到数据库
    match save_user_note(&user_id, content) {
        Ok(_) => {
            // info!("用户 {} 的备忘录已保存", user_id);
            
            // 返回成功状态和最后更新时间
            (StatusCode::OK, Json(json!({
                "status": "success",
                "message": "备忘录已保存",
                "last_updated": now
            }))).into_response()
        },
        Err(e) => {
            error!("保存备忘录失败: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "保存备忘录失败"
            }))).into_response()
        }
    }
}

// 获取用户备忘录
pub async fn get_user_notes_api(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
) -> impl IntoResponse {
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 获取用户信息
    let user_id = match utils::get_user_id_from_token(&client, &access_token).await {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "获取用户ID失败"
            }))).into_response();
        }
    };

    // 从数据库获取备忘录
    match get_user_note(&user_id) {
        Ok(Some(note)) => {
            (StatusCode::OK, Json(json!({
                "content": note.content,
                "last_updated": note.last_updated
            }))).into_response()
        },
        Ok(None) => {
            // 如果用户没有备忘录
            (StatusCode::NOT_FOUND, Json(json!({
                "error": "未找到备忘录"
            }))).into_response()
        },
        Err(e) => {
            error!("获取备忘录失败: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "获取备忘录失败"
            }))).into_response()
        }
    }
}

// 修改用户密码
pub async fn change_password_api(
    cookies: Cookies,
    Extension(client): Extension<ClientState>,
    Json(payload): Json<serde_json::Value>,
) -> impl IntoResponse {
    // 使用全局配置
    let oauth_config = get_oauth_config();
    
    // 检查是否已登录
    let access_token = match cookies.get("access_token") {
        Some(cookie) => cookie.value().to_string(),
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "未登录或会话已过期"
            }))).into_response();
        }
    };

    // 获取用户ID
    let user_id = match utils::get_user_id_from_token(&client, &access_token).await {
        Ok(id) => id,
        Err(_) => {
            return (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "获取用户ID失败"
            }))).into_response();
        }
    };

    // 从请求体中获取旧密码和新密码
    let old_password = match payload.get("old_password") {
        Some(pwd) => match pwd.as_str() {
            Some(text) => text,
            None => {
                return (StatusCode::BAD_REQUEST, Json(json!({
                    "error": "旧密码必须是字符串"
                }))).into_response();
            }
        },
        None => {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "error": "请求中未包含旧密码"
            }))).into_response();
        }
    };

    let new_password = match payload.get("new_password") {
        Some(pwd) => match pwd.as_str() {
            Some(text) => text,
            None => {
                return (StatusCode::BAD_REQUEST, Json(json!({
                    "error": "新密码必须是字符串"
                }))).into_response();
            }
        },
        None => {
            return (StatusCode::BAD_REQUEST, Json(json!({
                "error": "请求中未包含新密码"
            }))).into_response();
        }
    };

    // 构建发送到授权服务器的请求
    let password_change_url = format!("{}/api/users/{}/password", oauth_config.auth_server_url, user_id);
    
    let password_data = json!({
        "old_password": old_password,
        "new_password": new_password
    });

    // 发送密码修改请求到授权服务器
    let response = match client
        .put(&password_change_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .json(&password_data)
        .send()
        .await {
            Ok(resp) => resp,
            Err(e) => {
                error!("请求密码修改失败: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                    "error": "请求密码修改失败"
                }))).into_response();
            }
        };

    // 处理响应
    let status = response.status();
    let response_body = match response.json::<serde_json::Value>().await {
        Ok(body) => body,
        Err(e) => {
            error!("解析密码修改响应失败: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "解析密码修改响应失败"
            }))).into_response();
        }
    };

    // 根据状态码返回对应响应
    match status.as_u16() {
        200 => {
            info!("用户 {} 密码修改成功", user_id);
            (StatusCode::OK, Json(json!({
                "status": "success",
                "message": "密码修改成功"
            }))).into_response()
        },
        400 => {
            let error_msg = response_body.get("error")
                .and_then(|e| e.as_str())
                .unwrap_or("旧密码验证失败");
            
            error!("密码修改失败: {}", error_msg);
            (StatusCode::BAD_REQUEST, Json(json!({
                "error": error_msg
            }))).into_response()
        },
        401 => {
            (StatusCode::UNAUTHORIZED, Json(json!({
                "error": "认证失败"
            }))).into_response()
        },
        403 => {
            (StatusCode::FORBIDDEN, Json(json!({
                "error": "无权修改此用户密码"
            }))).into_response()
        },
        _ => {
            error!("密码修改失败，状态码: {}", status);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({
                "error": "密码修改失败"
            }))).into_response()
        }
    }
} 