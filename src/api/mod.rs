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