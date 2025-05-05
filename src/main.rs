mod log;
mod api;
mod static_files;
mod config;
mod db;
mod profile;

use log::init_log;
use config::{init_config, get_server_config, start_config_watcher};
use api::status::init_server_config;
use api::visitor::{init_visitor_stats, save_stats, start_periodic_save};
use db::init_db;

use rimplog::info;
use std::sync::Arc;
use tokio::signal;

use axum::{
    routing::{get, post, put},
    Router,
    response::Html,
    extract::Extension,
};
use tokio::net::TcpListener;
use std::net::SocketAddr;
use tower_http::cors::{CorsLayer, Any};
use std::sync::Mutex;
use reqwest::Client;
use tower_cookies::CookieManagerLayer;
use profile::models::ProcessedCodes;

// 在编译时嵌入 HTML 文件
const INDEX_HTML: &str = include_str!("../home/index.html");

#[tokio::main]
async fn main() {
    // 初始化应用
    init_application().await;
    
    // 创建并运行服务器
    let app = create_router();
    let addr = SocketAddr::from(([0, 0, 0, 0], get_server_config().port));
    info!("服务器运行在: http://{}", addr);
    
    // 运行服务器直到接收到关闭信号
    run_server(app, addr).await;
}

// 初始化应用程序
async fn init_application() {
    init_log();
    
    // 初始化配置
    if let Err(e) = init_config() {
        panic!("配置初始化失败: {}", e);
    }

    // 初始化服务器配置
    init_server_config();
    
    // 初始化数据库
    if let Err(e) = init_db("data/app.db") {
        panic!("数据库初始化失败: {}", e);
    }
    
    // 初始化访问统计
    init_visitor_stats();
    
    // 启动定时保存功能 - 每5分钟保存一次
    start_periodic_save(300);
    
    // 启动配置文件监听
    if let Err(e) = start_config_watcher() {
        info!("启动配置文件监听失败: {}", e);
    }
}

// 创建应用路由
fn create_router() -> Router {
    // 配置 CORS
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // 创建HTTP客户端用于API请求
    let client = Client::new();
    let client_state = Arc::new(client);
    
    // 创建处理过的授权码存储
    let processed_codes = Arc::new(Mutex::new(ProcessedCodes::new()));
    
    // 创建路由
    Router::new()
        .route("/", get(handler))
        .route("/static/*path", get(static_files::serve_static_file))
        .nest("/api", api::api_routes())

        // Profile模块路由 - 按照原始结构嵌套
        .nest("/auth", Router::new()
            .route("/", get(profile::handlers::index))
            .route("/callback", get(profile::handlers::oauth_callback_page))
            .route("/callback/process", get(profile::handlers::oauth_callback_process))
        )
        .nest("/profile", Router::new()
            .route("/", get(profile::handlers::profile))
            .route("/logout", get(profile::handlers::logout))
            .route("/api/userinfo", get(profile::handlers::get_user_info_api))
            .route("/api/user/login-stats", get(profile::handlers::get_login_stats_api))
            .route("/api/upload-avatar", post(profile::handlers::upload_avatar))
            .route("/api/notes", get(profile::handlers::get_user_notes_api))
            .route("/api/notes", post(profile::handlers::save_user_notes_api))
            .route("/api/change-password", put(profile::handlers::change_password_api))
            .route("/api/change-username", put(profile::handlers::change_username_api))
        )
        // 全局状态
        .layer(Extension(client_state))
        .layer(Extension(processed_codes))
        .layer(CookieManagerLayer::new())
        .layer(cors)
}

// 运行服务器并处理关闭信号
async fn run_server(app: Router, addr: SocketAddr) {
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