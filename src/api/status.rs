use serde::{Serialize, Deserialize};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::System;
use std::sync::{OnceLock, Mutex};
use crate::config::get_server_config;
use crate::api::visitor::get_visitor_stats;
use rimplog::info;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServerConfig {
    pub name: String,
    pub status: String,
    pub message: String,
    pub title: String,
    pub subtitle: String,
    pub show_visitor_stats: VisitorStatsConfig,
    pub auth: AuthConfig,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VisitorStatsConfig {
    pub enabled: bool,
    pub show_total_visits: bool,
    pub show_unique_ips: bool,
    pub show_personal_visits: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AuthConfig {
    pub password: String,
    pub token_expiration_seconds: u64,
}

// 导出SERVER_CONFIG以便在config模块中可以访问
pub static SERVER_CONFIG: OnceLock<Mutex<ServerConfig>> = OnceLock::new();

#[derive(Serialize, Deserialize)]
pub struct StatusResponse {
    server: ServerConfig,
    system: SystemStatus,
    visitor_stats: Option<VisitorStats>,
}

#[derive(Serialize, Deserialize)]
pub struct SystemStatus {
    platform: String,
    uptime: u64,
    memory_usage: MemoryUsage,
    cpu_usage: f32,
    timestamp: u64,
}

#[derive(Serialize, Deserialize)]
pub struct MemoryUsage {
    total: u64,
    used: u64,
    free: u64,
}

#[derive(Serialize, Deserialize)]
pub struct VisitorStats {
    total_visits: u64,
    unique_ips: usize,
}

// 初始化服务器配置
pub fn init_server_config() {
    let config = get_server_config();
    let server_config = ServerConfig {
        name: config.name.clone(),
        status: config.status.clone(),
        message: config.message.clone(),
        title: config.title.clone(),
        subtitle: config.subtitle.clone(),
        show_visitor_stats: VisitorStatsConfig {
            enabled: config.show_visitor_stats.enabled,
            show_total_visits: config.show_visitor_stats.show_total_visits,
            show_unique_ips: config.show_visitor_stats.show_unique_ips,
            show_personal_visits: config.show_visitor_stats.show_personal_visits,
        },
        auth: AuthConfig {
            password: config.auth.password.clone(),
            token_expiration_seconds: config.auth.token_expiration_seconds,
        },
    };
    
    // 初始化为Mutex包装的ServerConfig
    SERVER_CONFIG.get_or_init(|| Mutex::new(server_config));
}

// 更新服务器状态
pub fn update_server_status(server_config: ServerConfig) {
    if let Some(mutex) = SERVER_CONFIG.get() {
        // 获取锁并更新内部值
        if let Ok(mut config) = mutex.lock() {
            // 记录关键配置信息的变更
            if config.auth.password != server_config.auth.password {
                info!("更新系统密码: {} -> {}", config.auth.password, server_config.auth.password);
            }
            if config.auth.token_expiration_seconds != server_config.auth.token_expiration_seconds {
                info!("更新令牌过期时间: {}秒 -> {}秒", 
                     config.auth.token_expiration_seconds, 
                     server_config.auth.token_expiration_seconds);
            }
            
            // 更新配置
            *config = server_config;
        } else {
            info!("无法获取服务器配置锁，更新失败");
        }
    } else {
        // 如果尚未初始化，则进行初始化
        SERVER_CONFIG.get_or_init(|| Mutex::new(server_config));
        info!("服务器配置已初始化");
    }
}

// 修改 get_status 函数，使用缓存的SERVER_CONFIG而不是每次从文件读取
pub async fn get_status() -> StatusResponse {
    // 获取系统状态
    let mut sys = System::new_all();
    sys.refresh_all();

    let memory = sys.used_memory();
    let total_memory = sys.total_memory();
    let free_memory = sys.free_memory();
    let cpu_usage = sys.global_cpu_info().cpu_usage();
    
    // 获取当前时间戳
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    // 获取系统启动时间
    let uptime = sysinfo::System::uptime();
    
    // 使用缓存的SERVER_CONFIG
    let server_config = if let Some(mutex) = SERVER_CONFIG.get() {
        if let Ok(config) = mutex.lock() {
            config.clone()
        } else {
            // 如果锁定失败，回退到从文件读取
            let config = get_server_config();
            ServerConfig {
                name: config.name.clone(),
                status: config.status.clone(),
                message: config.message.clone(),
                title: config.title.clone(),
                subtitle: config.subtitle.clone(),
                show_visitor_stats: VisitorStatsConfig {
                    enabled: config.show_visitor_stats.enabled,
                    show_total_visits: config.show_visitor_stats.show_total_visits,
                    show_unique_ips: config.show_visitor_stats.show_unique_ips,
                    show_personal_visits: config.show_visitor_stats.show_personal_visits,
                },
                auth: AuthConfig {
                    password: config.auth.password.clone(),
                    token_expiration_seconds: config.auth.token_expiration_seconds,
                },
            }
        }
    } else {
        // 如果SERVER_CONFIG未初始化，直接从文件读取
        let config = get_server_config();
        ServerConfig {
            name: config.name.clone(),
            status: config.status.clone(),
            message: config.message.clone(),
            title: config.title.clone(),
            subtitle: config.subtitle.clone(),
            show_visitor_stats: VisitorStatsConfig {
                enabled: config.show_visitor_stats.enabled,
                show_total_visits: config.show_visitor_stats.show_total_visits,
                show_unique_ips: config.show_visitor_stats.show_unique_ips,
                show_personal_visits: config.show_visitor_stats.show_personal_visits,
            },
            auth: AuthConfig {
                password: config.auth.password.clone(),
                token_expiration_seconds: config.auth.token_expiration_seconds,
            },
        }
    };
    
    // 获取访问者统计
    let visitor_stats = if get_server_config().show_visitor_stats.enabled {
        let stats = get_visitor_stats();
        let visitor_stats = VisitorStats {
            total_visits: stats.total_visits(),
            unique_ips: stats.unique_ip_count(),
        };
        Some(visitor_stats)
    } else {
        None
    };
    
    StatusResponse {
        server: server_config,
        system: SystemStatus {
            cpu_usage,
            memory_usage: MemoryUsage {
                used: memory,
                total: total_memory,
                free: free_memory,
            },
            platform: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
            timestamp,
            uptime,
        },
        visitor_stats,
    }
}