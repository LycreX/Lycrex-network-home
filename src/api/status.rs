use serde::{Serialize, Deserialize};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::System;
use std::sync::OnceLock;
use crate::config::get_server_config;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ServerConfig {
    name: String,
    status: String,
    message: String,
    title: String,
    subtitle: String,
}

static SERVER_CONFIG: OnceLock<ServerConfig> = OnceLock::new();

#[derive(Serialize, Deserialize)]
pub struct StatusResponse {
    server: ServerConfig,
    system: SystemStatus,
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

// 初始化服务器配置
pub fn init_server_config() {
    let config = get_server_config();
    let server_config = ServerConfig {
        name: config.name.clone(),
        status: config.status.clone(),
        message: config.message.clone(),
        title: config.title.clone(),
        subtitle: config.subtitle.clone(),
    };
    SERVER_CONFIG.set(server_config).expect("服务器配置已初始化");
}

// 更新服务器状态
pub fn update_server_status(status: String, message: String) {
    if let Some(config) = SERVER_CONFIG.get() {
        let new_config = ServerConfig {
            name: config.name.clone(),
            status,
            message,
            title: config.title.clone(),
            subtitle: config.subtitle.clone(),
        };
        SERVER_CONFIG.set(new_config).expect("无法更新服务器状态");
    }
}

// 修改 get_status 函数，确保每次都获取最新配置
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
    
    // 直接从配置模块获取最新配置，而不是使用缓存的 SERVER_CONFIG
    let config = get_server_config();
    
    StatusResponse {
        server: ServerConfig {
            name: config.name.clone(),
            status: config.status.clone(),
            message: config.message.clone(),
            title: config.title.clone(),
            subtitle: config.subtitle.clone(),
        },
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
    }
}