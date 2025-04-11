use axum::{
    routing::{get, post},
    Router,
    Json,
    extract::ConnectInfo,
    http::HeaderMap,
};
use rimplog::debug;
use serde_json::json;
use std::net::SocketAddr;

pub mod status;
pub mod visitor;
pub mod command;
pub mod authenticate;

pub fn api_routes() -> Router {
    Router::new()
        .route("/status", get(status_handler))
        .route("/visitor", get(visitor_handler))
        .route("/current-ip", get(current_ip_handler))
        .route("/version", get(version_handler))
        .route("/report-visitor", post(report_visitor_handler))
        .route("/command", post(command_handler))
        .route("/authenticate", post(authenticate_handler))
        .route("/debug/tokens", get(list_tokens_handler))
}

async fn status_handler() -> Json<serde_json::Value> {
    let status = status::get_status().await;
    Json(json!(status))
}

async fn visitor_handler() -> Json<serde_json::Value> {
    let stats = visitor::get_visitor_stats();
    Json(json!({
        "total_visits": stats.total_visits(),
        "unique_ips": stats.unique_ip_count()
    }))
}

async fn current_ip_handler(ConnectInfo(addr): ConnectInfo<SocketAddr>) -> Json<serde_json::Value> {
    let ip = addr.ip().to_string();
    let stats = visitor::get_visitor_stats();
    
    Json(json!({
        "ip": ip,
        "visits": stats.get_ip_visit_count(&ip)
    }))
}

// 处理客户端上报的访问者IP
async fn report_visitor_handler(payload: Json<visitor::VisitorReportRequest>) -> Json<serde_json::Value> {
    let response = visitor::report_visitor_ip(payload).await;
    Json(json!({
        "success": response.success,
        "message": response.message,
        "visits": response.visits
    }))
}

// 获取服务器版本信息
async fn version_handler() -> Json<serde_json::Value> {
    let version = env!("CARGO_PKG_VERSION");
    
    // 获取Git提交版本
    let git_commit = {
        // 首先尝试从环境变量获取（如果在构建时设置了）
        if let Some(commit) = option_env!("GIT_COMMIT_HASH") {
            commit.to_string()
        } else {
            // 如果环境变量不存在，则尝试执行git命令获取
            let output = std::process::Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .output();
            
            match output {
                Ok(out) if out.status.success() => {
                    String::from_utf8_lossy(&out.stdout).trim().to_string()
                },
                _ => "unknown".to_string()
            }
        }
    };
    
    Json(json!({
        "name": "LycreX Network",
        "version": version,
        "git_commit": format!("({})", git_commit)
    }))
}

// 从请求中提取客户端IP地址
fn extract_client_ip(conn_info: Option<&ConnectInfo<SocketAddr>>, headers: &HeaderMap) -> Option<String> {
    // 优先从连接信息获取
    if let Some(ConnectInfo(addr)) = conn_info {
        return Some(addr.ip().to_string());
    }
    
    // 尝试从X-Forwarded-For头获取
    if let Some(forwarded) = headers.get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded.to_str() {
            if let Some(ip) = forwarded_str.split(',').next() {
                return Some(ip.trim().to_string());
            }
        }
    }
    
    // 尝试从X-Real-IP头获取
    if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(ip) = real_ip.to_str() {
            return Some(ip.trim().to_string());
        }
    }
    
    None
}

// 从请求头中提取Bearer令牌
fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers.get("authorization").and_then(|value| {
        let value_str = value.to_str().ok()?;
        if value_str.starts_with("Bearer ") {
            Some(value_str[7..].to_string())
        } else {
            None
        }
    })
}

// 处理命令输入
async fn command_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>, 
    headers: HeaderMap, 
    Json(payload): Json<command::CommandRequest>
) -> Json<serde_json::Value> {
    // 获取客户端IP
    let client_ip = extract_client_ip(Some(&ConnectInfo(addr)), &headers);
    let ip_str = client_ip.as_deref().unwrap_or("unknown");
    
    // 从Authorization头提取token
    let header_token = extract_bearer_token(&headers);
    
    // 优先使用Authorization头中的token，其次使用请求体中的token
    let token = header_token.as_deref().or(payload.token.as_deref());
    
    // 输出调试信息
    debug!("收到命令请求: command={}, 来自IP={}, 有Authorization头: {}, 有效token: {}", 
            payload.command,
            ip_str,
            header_token.is_some(),
            token.is_some()
    );
    
    // 存储token状态信息
    let mut token_status = None;
    
    // 检查token并获取状态信息
    let is_valid_token = if let Some(t) = token {
        // 获取详细token状态
        if let Some(status_info) = authenticate::check_token(t, client_ip.as_deref()) {
            // 构建token状态结构
            let valid = status_info.is_valid;
            token_status = Some(command::TokenStatus {
                valid,
                expired: status_info.is_expired,
                expired_for: status_info.expired_time,
            });
            valid
        } else {
            // token不存在
            token_status = Some(command::TokenStatus {
                valid: false,
                expired: false,
                expired_for: None,
            });
            false
        }
    } else {
        false
    };
    
    debug!("Token验证结果: {}", is_valid_token);
    
    // 检查是否伪造了token - 如果提供了无效token但发送了密码，拒绝使用密码
    let password = if token.is_some() && !is_valid_token {
        debug!("检测到无效token，禁止使用密码认证");
        None // 无效token的情况下强制忽略密码
    } else {
        payload.password.as_deref()
    };
    
    // 只有token有效时才使用token
    let valid_token = if is_valid_token { token } else { None };
    
    // 处理命令
    let mut response = command::process_command_with_auth(
        &payload.command, 
        password,
        valid_token
    ).await;
    
    // 添加token状态到响应
    response.token_status = token_status;
    
    Json(json!(response))
}

// 处理密码验证
async fn authenticate_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>, 
    headers: HeaderMap, 
    Json(payload): Json<authenticate::AuthenticateRequest>
) -> Json<serde_json::Value> {
    // 获取客户端IP
    let client_ip = extract_client_ip(Some(&ConnectInfo(addr)), &headers);
    let ip_str = client_ip.as_deref().unwrap_or("unknown");
    
    debug!("处理认证请求，来自IP: {}", ip_str);
    
    let response = authenticate::authenticate_password(&payload.password, client_ip.as_deref()).await;
    Json(json!(response))
}

// 用于调试的接口，列出所有有效token
async fn list_tokens_handler() -> Json<serde_json::Value> {
    let tokens = authenticate::list_valid_tokens();
    
    // 将token信息转换为更详细的JSON结构
    let token_objects: Vec<serde_json::Value> = tokens.iter()
        .map(|(token, ip, status, expired)| {
            json!({
                "token": token,
                "ip": ip,
                "status": status,
                "expired": expired
            })
        })
        .collect();
    
    Json(json!({
        "total_tokens": tokens.len(),
        "tokens": token_objects
    }))
}