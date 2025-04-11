mod log;
mod api;
mod static_files;
mod config;
use log::init_log;
use config::{init_config, get_server_config, start_config_watcher};
use api::status::init_server_config;
use api::visitor::{init_visitor_stats, save_stats};

use rimplog::info;
use std::sync::Arc;
use tokio::signal;

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
    
    // 初始化访问统计
    init_visitor_stats();
    
    // 启动配置文件监听
    if let Err(e) = start_config_watcher() {
        info!("启动配置文件监听失败: {}", e);
    }
    
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
        .layer(cors);

    let port = get_server_config().port;
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("服务器运行在: http://{}", addr);

    // 注册关闭信号处理
    let (tx, rx) = tokio::sync::oneshot::channel::<()>();
    let tx = Arc::new(std::sync::Mutex::new(Some(tx)));
    
    // CTRL+C信号处理
    let tx_clone = tx.clone();
    tokio::spawn(async move {
        match signal::ctrl_c().await {
            Ok(()) => {
                info!("接收到关闭信号，即将停止服务...");
                if let Some(tx) = tx_clone.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            }
            Err(err) => {
                eprintln!("无法监听Ctrl+C信号: {}", err);
            }
        }
    });
    
    // 创建服务器并运行，直到收到关闭信号
    let server = axum::serve(
        TcpListener::bind(addr).await.unwrap(), 
        app.into_make_service_with_connect_info::<SocketAddr>()
    );
    
    tokio::select! {
        _ = server => info!("服务器停止"),
        _ = rx => {
            info!("正在关闭服务器...");
            // 保存访问者统计数据
            save_stats();
            info!("服务器已安全关闭");
        }
    }
}

// 处理首页请求
async fn handler() -> Html<&'static str> {
    Html(INDEX_HTML)
}