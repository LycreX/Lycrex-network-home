use axum::{
    routing::get,
    Router,
    Json,
};
use serde_json::json;

pub mod status;

pub fn api_routes() -> Router {
    Router::new()
        .route("/status", get(status_handler))
}

async fn status_handler() -> Json<serde_json::Value> {
    let status = status::get_status().await;
    Json(json!(status))
} 