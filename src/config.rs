use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize, Serialize)]
pub struct ServerConfig {
    pub name: String,
    pub status: String,
    pub message: String,
    pub title: String,
    pub subtitle: String,
    pub port: u16,
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