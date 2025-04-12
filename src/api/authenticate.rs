use rimplog::{debug, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use std::time::{Duration, SystemTime};
use crate::config::{get_server_config, get_auth_config};

#[derive(Deserialize)]
pub struct AuthenticateRequest {
    pub password: String,
    #[allow(dead_code)]
    pub client_ip: Option<String>, // 客户端IP地址
}

#[derive(Serialize)]
pub struct AuthenticateResponse {
    pub success: bool,
    pub message: String,
    pub token: Option<String>,
}

// Token详细状态信息，用于API返回和内部使用
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct TokenStatusInfo {
    pub token: String,         // 完整token
    pub ip_address: String,    // IP地址
    pub created_at: SystemTime, // 创建时间
    pub is_valid: bool,        // 是否有效
    pub is_expired: bool,      // 是否过期
    pub expired_time: Option<String>, // 过期了多长时间（如果已过期）
    pub expires_at: Option<SystemTime>, // 过期时间点
}

// Token状态枚举
#[derive(Debug, Clone, PartialEq)]
pub enum TokenStatus {
    Active,
    Expired(Duration), // 存储过期了多长时间
}

// Token数据结构，包含颁发时间和关联的IP
struct TokenData {
    ip_address: String,
    created_at: SystemTime,
    status: TokenStatus,
}

// 使用线程安全的全局变量存储有效的token
static VALID_TOKENS: Lazy<Arc<Mutex<HashMap<String, TokenData>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(HashMap::new()))
});

// 生成新token并存储到有效token集合中，与IP地址关联，返回token和过期时间
fn generate_and_store_token(ip_address: &str) -> (String, String) {
    let timestamp = chrono::Utc::now().timestamp();
    let token = format!("fake-token-{}", timestamp);
    let now = SystemTime::now();
    
    // 获取过期时间（秒）
    let token_expiration_seconds = match get_auth_config() {
        Some(auth_config) => auth_config.token_expiration_seconds,
        None => get_server_config().auth.token_expiration_seconds,
    };
    
    // 计算过期时间点
    let expires_at = chrono::DateTime::<chrono::Local>::from(now)
        .checked_add_signed(chrono::Duration::seconds(token_expiration_seconds as i64))
        .map(|time| time.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "计算错误".to_string());
    
    // 存储token和关联的IP地址
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        tokens.insert(token.clone(), TokenData {
            ip_address: ip_address.to_string(),
            created_at: now,
            status: TokenStatus::Active,
        });
        debug!("生成并存储新token: {}, IP: {}, 过期时间: {}", token, ip_address, expires_at);
    }
    
    (token, expires_at)
}

// 格式化持续时间为人类可读的形式
fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.as_secs();
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    
    if hours > 0 {
        format!("{}小时{}分{}秒", hours, minutes, seconds)
    } else if minutes > 0 {
        format!("{}分{}秒", minutes, seconds)
    } else {
        format!("{}秒", seconds)
    }
}

// 检查token并返回详细的状态信息
pub fn check_token(token: &str, client_ip: Option<&str>) -> Option<TokenStatusInfo> {
    if token.is_empty() {
        return None;
    }
    
    // 获取过期时间（秒）
    let token_expiration_seconds = match get_auth_config() {
        Some(auth_config) => auth_config.token_expiration_seconds,
        None => get_server_config().auth.token_expiration_seconds,
    };
    
    // 检查token是否在集合中
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        // 更新所有token的状态，但不删除它们
        update_tokens_status(&mut tokens);
        
        // 验证token是否存在
        if let Some(token_data) = tokens.get(token) {
            // 默认状态
            let mut status_info = TokenStatusInfo {
                token: token.to_string(),
                ip_address: token_data.ip_address.clone(),
                created_at: token_data.created_at,
                is_valid: false,
                is_expired: false,
                expired_time: None,
                expires_at: Some(token_data.created_at + Duration::from_secs(token_expiration_seconds)),
            };
            
            // 检查token是否已过期
            match &token_data.status {
                TokenStatus::Active => {
                    // 如果提供了客户端IP，还需要验证IP是否匹配
                    if let Some(ip) = client_ip {
                        if token_data.ip_address != ip {
                            debug!("Token IP不匹配: 期望 {}, 实际 {}", token_data.ip_address, ip);
                            return Some(status_info);
                        }
                    }
                    
                    // IP匹配或未提供IP，token有效
                    status_info.is_valid = true;
                    debug!("Token验证成功: {}, IP: {}", token, token_data.ip_address);
                },
                TokenStatus::Expired(duration) => {
                    // token已过期
                    status_info.is_expired = true;
                    status_info.expired_time = Some(format_duration(*duration));
                    debug!("Token已过期: {}, 过期时间: {}", token, format_duration(*duration));
                }
            };
            
            return Some(status_info);
        } else {
            debug!("未找到Token: {}", token);
        }
    } else {
        debug!("无法访问token存储");
    }
    
    None
}

// 验证token是否有效（检查是否存在于系统中、是否过期、是否来自颁发时的同一IP）
pub fn validate_token(token: &str, client_ip: Option<&str>) -> bool {
    // 使用check_token获取详细状态，然后只返回是否有效
    if let Some(status) = check_token(token, client_ip) {
        return status.is_valid;
    }
    false
}

// 获取token状态信息，用于API响应
#[allow(dead_code)]
pub fn get_token_status(token: &str) -> Option<TokenStatusInfo> {
    check_token(token, None)
}

// 更新所有token的状态，将过期的标记为过期
fn update_tokens_status(tokens: &mut HashMap<String, TokenData>) {
    // 使用下划线前缀表示有意不使用的变量
    let _now = SystemTime::now();
    // 从配置中获取令牌过期时间，优先使用最新配置
    let token_expiration_seconds = match get_auth_config() {
        Some(auth_config) => auth_config.token_expiration_seconds,
        None => get_server_config().auth.token_expiration_seconds,
    };
    
    for (_, data) in tokens.iter_mut() {
        if let TokenStatus::Active = data.status {
            if let Ok(elapsed) = data.created_at.elapsed() {
                if elapsed > Duration::from_secs(token_expiration_seconds) {
                    // 标记为过期并计算过期了多长时间
                    let expired_for = elapsed - Duration::from_secs(token_expiration_seconds);
                    data.status = TokenStatus::Expired(expired_for);
                    debug!("标记Token为过期状态，过期时间: {}", format_duration(expired_for));
                }
            }
        }
    }
}

// 撤销token
#[allow(dead_code)]
pub fn revoke_token(token: &str) -> bool {
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        if tokens.remove(token).is_some() {
            debug!("已撤销token: {}", token);
            return true;
        } else {
            debug!("token不存在，无法撤销: {}", token);
            return false;
        }
    }
    false
}

// 列出所有token及其状态（包括过期的）
pub fn list_valid_tokens() -> Vec<(String, String, String, bool)> {
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        update_tokens_status(&mut tokens);
        
        tokens
            .iter()
            .map(|(token, data)| {
                let expired = match &data.status {
                    TokenStatus::Active => (false, "活跃".to_string()),
                    TokenStatus::Expired(duration) => (true, format!("已过期 {}", format_duration(*duration)))
                };
                
                (token.clone(), data.ip_address.clone(), expired.1, expired.0)
            })
            .collect()
    } else {
        Vec::new()
    }
}

pub async fn authenticate_password(password: &str, client_ip: Option<&str>) -> AuthenticateResponse {
    // 如果没有提供客户端IP，记录错误但继续处理
    let ip = client_ip.unwrap_or("unknown");
    debug!("处理密码验证，IP: {}", ip);
    
    // 从配置中获取系统密码，优先使用最新配置
    let system_password = match get_auth_config() {
        Some(auth_config) => {
            debug!("使用最新认证配置: 密码={}, 令牌过期时间={}秒", 
                   auth_config.password, auth_config.token_expiration_seconds);
            auth_config.password
        },
        None => {
            debug!("无法获取最新认证配置，使用静态配置");
            get_server_config().auth.password.clone()
        },
    };
    
    debug!("用户输入密码: {}, 系统密码: {}", password, system_password);
    
    // 简单验证密码是否匹配
    if password == system_password {
        // 验证成功，生成令牌并与IP关联
        let (token, expires_at) = generate_and_store_token(ip);
        
        debug!("密码验证成功，生成令牌: {}", token);
        
        // 掩盖token中间部分用于显示
        let masked_token = mask_token(&token);
        
        AuthenticateResponse {
            success: true,
            message: format!("密码验证成功\n令牌: {}\n过期时间: {}", masked_token, expires_at),
            token: Some(token),
        }
    } else {
        // 验证失败，不返回令牌
        info!("密码验证失败，IP: {}, 输入: {}, 期望: {}", ip, password, system_password);
        AuthenticateResponse {
            success: false,
            message: "密码错误".to_string(),
            token: None,
        }
    }
}

// 获取所有token的详细信息，包括创建时间和过期时间
pub fn get_token_details() -> Vec<TokenDisplayInfo> {
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        update_tokens_status(&mut tokens);
        
        let token_expiration_seconds = match get_auth_config() {
            Some(auth_config) => auth_config.token_expiration_seconds,
            None => get_server_config().auth.token_expiration_seconds,
        };
        
        tokens
            .iter()
            .map(|(token, data)| {
                // 创建时间格式化
                let created_at = chrono::DateTime::<chrono::Local>::from(data.created_at)
                    .format("%Y-%m-%d %H:%M:%S").to_string();
                
                // 计算过期时间
                let expires_at = match chrono::DateTime::<chrono::Local>::from(data.created_at)
                    .checked_add_signed(chrono::Duration::seconds(token_expiration_seconds as i64)) {
                    Some(time) => time.format("%Y-%m-%d %H:%M:%S").to_string(),
                    None => "计算错误".to_string(),
                };
                
                // 掩盖token中间部分
                let masked_token = mask_token(token);
                
                // 状态信息
                let (status_text, is_expired) = match &data.status {
                    TokenStatus::Active => ("有效".to_string(), false),
                    TokenStatus::Expired(duration) => (format!("已过期 {}", format_duration(*duration)), true),
                };
                
                TokenDisplayInfo {
                    token: token.clone(),
                    token_masked: masked_token,
                    ip_address: data.ip_address.clone(),
                    created_at,
                    expires_at,
                    status: status_text,
                    is_expired,
                }
            })
            .collect()
    } else {
        Vec::new()
    }
}

// 用于显示的token信息
#[derive(Debug, Clone)]
pub struct TokenDisplayInfo {
    pub token: String,        // 完整token (内部使用)
    pub token_masked: String, // 掩码后的token (显示用)
    pub ip_address: String,   // IP地址
    pub created_at: String,   // 创建时间（格式化）
    pub expires_at: String,   // 过期时间（格式化）
    pub status: String,       // 状态描述
    pub is_expired: bool,     // 是否已过期
}

// 将token中间部分用***掩盖
fn mask_token(token: &str) -> String {
    if token.len() <= 10 {
        return token.to_string();
    }
    
    let prefix = &token[0..5];
    let suffix = &token[token.len() - 5..];
    format!("{}***{}", prefix, suffix)
}
