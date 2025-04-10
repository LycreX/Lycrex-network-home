mod log;
mod api;
mod static_files;
mod config;
use log::init_log;
use config::{init_config, get_server_config};
use api::status::init_server_config;

use rimplog::info;

use axum::{
    routing::get,
    Router,
    response::Html,
};
use tokio::net::TcpListener;
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};

// 在编译时嵌入 HTML 文件
const INDEX_HTML: &str = include_str!("../home/index.html");

#[tokio::main]
async fn main() {
    init_log();
    
    // 初始化配置
    if let Err(e) = init_config() {
        panic!("配置初始化失败: {}", e);
    }

    // 初始化服务器配置
    init_server_config();
    
    // 配置 CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // 创建路由
    let app = Router::new()
        .route("/", get(handler))
        .route("/static/*path", get(static_files::serve_static_file))
        .nest("/api", api::api_routes())
        // 添加 CORS 中间件
        .layer(cors);

    let port = get_server_config().port;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("服务器运行在: http://{}", addr);

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// 处理首页请求
async fn handler() -> Html<&'static str> {
    Html(INDEX_HTML)
}