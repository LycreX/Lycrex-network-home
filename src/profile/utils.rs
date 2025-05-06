use crate::config::OAuthConfig;
use super::models::{TokenResponse, User};
use rimplog::{error, info};
use serde_json;
use std::time::Duration;
use crate::config::get_oauth_config;
use reqwest::Client;
use serde_json::json;

/// 使用授权码获取令牌
pub async fn get_token_with_code(
    client: &Client,
    oauth_config: &crate::config::OAuthConfig,
    code: &str,
) -> Result<TokenResponse, String> {
    let token_url = format!("{}/api/oauth/token", oauth_config.auth_server_url);
    
    let response = client
        .post(&token_url)
        .json(&json!({
            "grant_type": "authorization_code",
            "code": code,
            "client_id": oauth_config.client_id,
            "client_secret": oauth_config.client_secret,
            "redirect_uri": oauth_config.redirect_uri
        }))
        .send()
        .await
        .map_err(|e| format!("发送token请求失败: {}", e))?;
    
    // 检查状态码
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("token请求返回错误状态码: {}, {}", status, error_text));
    }
    
    // 解析响应JSON
    response.json::<TokenResponse>()
        .await
        .map_err(|e| format!("解析token响应失败: {}", e))
}

/// 获取用户信息
pub async fn get_user_info(
    client: &Client,
    oauth_config: &crate::config::OAuthConfig,
    access_token: &str,
) -> Result<User, String> {
    let user_info_url = format!("{}/api/oauth/userinfo", oauth_config.auth_server_url);
    
    let response = client
        .get(&user_info_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("发送用户信息请求失败: {}", e))?;
    
    // 检查状态码
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("用户信息请求返回错误状态码: {}, {}", status, error_text));
    }
    
    // 解析响应JSON
    response.json::<User>()
        .await
        .map_err(|e| format!("解析用户信息响应失败: {}", e))
}

/// 从访问令牌中获取用户ID
pub async fn get_user_id_from_token(
    client: &Client,
    access_token: &str,
) -> Result<String, String> {
    let oauth_config = get_oauth_config();
    let user_info_url = format!("{}/api/oauth/userinfo", oauth_config.auth_server_url);
    
    let response = client
        .get(&user_info_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("发送用户信息请求失败: {}", e))?;
    
    // 检查状态码
    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("用户信息请求返回错误状态码: {}, {}", status, error_text));
    }
    
    // 解析响应JSON并提取用户ID
    let user_info: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析用户信息响应失败: {}", e))?;
    
    user_info.get("id")
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "用户ID不存在".to_string())
} 