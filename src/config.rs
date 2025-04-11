use serde::{Deserialize, Serialize};
use std::sync::{OnceLock, Arc, Mutex};
use std::fs;
use std::path::Path;
use notify::{Watcher, RecursiveMode, Event, EventKind};
use rimplog::info;
use crate::api::status::update_server_status;

#[derive(Debug, Deserialize, Serialize)]
pub struct ServerConfig {
    pub name: String,
    pub status: String,
    pub message: String,
    pub title: String,
    pub subtitle: String,
    pub port: u16,
    pub show_visitor_stats: VisitorStatsConfig,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct VisitorStatsConfig {
    pub enabled: bool,
    pub show_total_visits: bool,
    pub show_unique_ips: bool,
    pub show_personal_visits: bool,
}

impl Default for VisitorStatsConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            show_total_visits: true,
            show_unique_ips: true,
            show_personal_visits: true,
        }
    }
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            name: "LycreX".to_string(),
            status: "running".to_string(),
            message: "Server is running".to_string(),
            title: "LycreX".to_string(),
            subtitle: "> programming for acg".to_string(),
            port: 1111,
            show_visitor_stats: VisitorStatsConfig::default(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Config {
    pub server: ServerConfig,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig::default(),
        }
    }
}

static CONFIG: OnceLock<Config> = OnceLock::new();

pub fn init_config() -> Result<(), config::ConfigError> {
    let config_path = "config.toml";
    
    // 尝试读取配置文件
    let result = config::Config::builder()
        .add_source(config::File::with_name("config"))
        .build()
        .and_then(|settings| settings.try_deserialize());

    match result {
        Ok(config) => {
            CONFIG.set(config).expect("配置已初始化");
            Ok(())
        }
        Err(_) => {
            // 如果配置文件不存在或读取失败，创建默认配置
            if !Path::new(config_path).exists() {
                let default_config = Config::default();
                let toml = toml::to_string_pretty(&default_config)
                    .expect("无法序列化默认配置");
                fs::write(config_path, toml)
                    .expect("无法写入默认配置文件");
                
                CONFIG.set(default_config).expect("配置已初始化");
            }
            Ok(())
        }
    }
}

pub fn get_config() -> &'static Config {
    CONFIG.get().expect("配置未初始化")
}

pub fn get_server_config() -> &'static ServerConfig {
    &get_config().server
}

// 开始监听配置文件变更
pub fn start_config_watcher() -> notify::Result<()> {
    let config_path = "config.toml";
    
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                if matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    info!("检测到配置文件变更，正在重新加载...");
                    
                    // 重新加载配置文件
                    match reload_config() {
                        Ok(new_config) => {
                            // 转换并更新服务器配置
                            let server_config = crate::api::status::ServerConfig {
                                name: new_config.server.name.clone(),
                                status: new_config.server.status.clone(),
                                message: new_config.server.message.clone(),
                                title: new_config.server.title.clone(),
                                subtitle: new_config.server.subtitle.clone(),
                                show_visitor_stats: crate::api::status::VisitorStatsConfig {
                                    enabled: new_config.server.show_visitor_stats.enabled,
                                    show_total_visits: new_config.server.show_visitor_stats.show_total_visits,
                                    show_unique_ips: new_config.server.show_visitor_stats.show_unique_ips,
                                    show_personal_visits: new_config.server.show_visitor_stats.show_personal_visits,
                                },
                            };
                            
                            // 更新服务器状态
                            update_server_status(server_config);
                            info!("已成功更新服务器配置");
                        },
                        Err(e) => {
                            info!("重新加载配置失败: {}", e);
                        }
                    }
                }
            },
            Err(e) => info!("监听配置文件错误: {:?}", e),
        }
    })?;
    
    // 开始监听配置文件
    watcher.watch(Path::new(config_path), RecursiveMode::NonRecursive)?;
    
    static WATCHER: OnceLock<Arc<Mutex<Box<dyn notify::Watcher + Send>>>> = OnceLock::new();
    WATCHER.set(Arc::new(Mutex::new(Box::new(watcher)))).unwrap_or(());
    
    info!("配置文件监听已启动");
    Ok(())
}

// 重新加载配置文件
fn reload_config() -> Result<Config, config::ConfigError> {
    // 解析配置文件
    let new_config = config::Config::builder()
        .add_source(config::File::with_name("config"))
        .build()
        .and_then(|settings| settings.try_deserialize::<Config>())?;

    // 转换并更新服务器配置
    let server_config = crate::api::status::ServerConfig {
        name: new_config.server.name.clone(),
        status: new_config.server.status.clone(),
        message: new_config.server.message.clone(),
        title: new_config.server.title.clone(),
        subtitle: new_config.server.subtitle.clone(),
        show_visitor_stats: crate::api::status::VisitorStatsConfig {
            enabled: new_config.server.show_visitor_stats.enabled,
            show_total_visits: new_config.server.show_visitor_stats.show_total_visits,
            show_unique_ips: new_config.server.show_visitor_stats.show_unique_ips,
            show_personal_visits: new_config.server.show_visitor_stats.show_personal_visits,
        },
    };
    
    // 更新服务器状态
    update_server_status(server_config);

    Ok(new_config)
} 