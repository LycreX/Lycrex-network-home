use rimplog::{debug, info};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;
use std::time::{Duration, SystemTime};

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

// Token详细状态信息，用于API返回
#[derive(Debug, Clone)]
pub struct TokenStatusInfo {
    pub is_valid: bool,
    pub is_expired: bool,
    pub expired_time: Option<String>,
    #[allow(dead_code)]
    pub ip_address: String,
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

// 定义预设的系统密码
const SYSTEM_PASSWORD: &str = "123"; // 实际应用中应使用环境变量或配置文件存储
// Token有效期，单位为秒
const TOKEN_EXPIRATION_SECONDS: u64 = 10; // 1小时

// 使用线程安全的全局变量存储有效的token
static VALID_TOKENS: Lazy<Arc<Mutex<HashMap<String, TokenData>>>> = Lazy::new(|| {
    Arc::new(Mutex::new(HashMap::new()))
});

// 生成新token并存储到有效token集合中，与IP地址关联
fn generate_and_store_token(ip_address: &str) -> String {
    let timestamp = chrono::Utc::now().timestamp();
    let token = format!("fake-token-{}", timestamp);
    
    // 存储token和关联的IP地址
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        tokens.insert(token.clone(), TokenData {
            ip_address: ip_address.to_string(),
            created_at: SystemTime::now(),
            status: TokenStatus::Active,
        });
        info!("生成并存储新token: {}, IP: {}", token, ip_address);
    }
    
    token
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
    
    // 检查token是否在集合中
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        // 更新所有token的状态，但不删除它们
        update_tokens_status(&mut tokens);
        
        // 验证token是否存在
        if let Some(token_data) = tokens.get(token) {
            let mut status_info = TokenStatusInfo {
                is_valid: false,
                is_expired: false,
                expired_time: None,
                ip_address: token_data.ip_address.clone(),
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
pub fn get_token_status(token: &str) -> Option<(TokenStatus, String)> {
    if let Ok(mut tokens) = VALID_TOKENS.lock() {
        update_tokens_status(&mut tokens);
        
        if let Some(token_data) = tokens.get(token) {
            let ip = token_data.ip_address.clone();
            let status = token_data.status.clone();
            return Some((status, ip));
        }
    }
    None
}

// 更新所有token的状态，将过期的标记为过期
fn update_tokens_status(tokens: &mut HashMap<String, TokenData>) {
    // 使用下划线前缀表示有意不使用的变量
    let _now = SystemTime::now();
    for (_, data) in tokens.iter_mut() {
        if let TokenStatus::Active = data.status {
            if let Ok(elapsed) = data.created_at.elapsed() {
                if elapsed > Duration::from_secs(TOKEN_EXPIRATION_SECONDS) {
                    // 标记为过期并计算过期了多长时间
                    let expired_for = elapsed - Duration::from_secs(TOKEN_EXPIRATION_SECONDS);
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
            info!("已撤销token: {}", token);
            return true;
        } else {
            info!("token不存在，无法撤销: {}", token);
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
    info!("处理密码验证，IP: {}", ip);
    
    // 简单验证密码是否匹配
    if password == SYSTEM_PASSWORD {
        // 验证成功，生成令牌并与IP关联
        let token = generate_and_store_token(ip);
        
        AuthenticateResponse {
            success: true,
            message: "密码验证成功".to_string(),
            token: Some(token),
        }
    } else {
        // 验证失败，不返回令牌
        info!("密码验证失败，IP: {}", ip);
        AuthenticateResponse {
            success: false,
            message: "密码错误".to_string(),
            token: None,
        }
    }
}
