use axum::{
    routing::get,
    Router,
    Json,
    extract::ConnectInfo,
};
use serde_json::json;
use std::net::SocketAddr;

pub mod status;
pub mod visitor;

pub fn api_routes() -> Router {
    Router::new()
        .route("/status", get(status_handler))
        .route("/visitor", get(visitor_handler))
        .route("/current-ip", get(current_ip_handler))
        .route("/version", get(version_handler))
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

// 获取服务器版本信息
async fn version_handler() -> Json<serde_json::Value> {
    let version = env!("CARGO_PKG_VERSION");
    let name = env!("CARGO_PKG_NAME");
    
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