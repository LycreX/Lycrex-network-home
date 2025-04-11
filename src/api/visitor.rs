use std::sync::{Arc, Mutex, OnceLock};
use std::collections::{HashSet, HashMap};
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;
use axum::extract::ConnectInfo;
use std::net::SocketAddr;
use serde::{Serialize, Deserialize};
use std::fs;
use rimplog::info;

// 访问者统计数据
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct VisitorStats {
    total_visits: u64,
    unique_ips: HashSet<String>,
    // 记录每个IP的访问次数
    ip_visits: HashMap<String, u64>,
}

impl VisitorStats {
    pub fn unique_ip_count(&self) -> usize {
        self.unique_ips.len()
    }
    
    pub fn total_visits(&self) -> u64 {
        self.total_visits
    }
    
    #[allow(dead_code)]
    pub fn ip_visits(&self) -> &HashMap<String, u64> {
        &self.ip_visits
    }
    
    // 获取指定IP的访问次数
    pub fn get_ip_visit_count(&self, ip: &str) -> u64 {
        *self.ip_visits.get(ip).unwrap_or(&0)
    }
}

// 访问者统计单例
static VISITOR_STATS: OnceLock<Arc<Mutex<VisitorStats>>> = OnceLock::new();

// 初始化访问者统计
pub fn init_visitor_stats() {
    let stats = if let Ok(content) = fs::read_to_string("visitor_stats.json") {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        VisitorStats::default()
    };
    
    VISITOR_STATS.get_or_init(|| Arc::new(Mutex::new(stats)));
    info!("访问者统计已初始化");
}

// 获取访问者统计
pub fn get_visitor_stats() -> VisitorStats {
    let stats = VISITOR_STATS.get()
        .expect("访问者统计未初始化")
        .lock()
        .expect("无法获取访问者统计锁");
    
    VisitorStats {
        total_visits: stats.total_visits,
        unique_ips: stats.unique_ips.clone(),
        ip_visits: stats.ip_visits.clone(),
    }
}

// 保存访问者统计到文件
fn save_visitor_stats() {
    if let Some(stats_lock) = VISITOR_STATS.get() {
        if let Ok(stats) = stats_lock.lock() {
            if let Ok(json) = serde_json::to_string_pretty(&*stats) {
                let _ = fs::write("visitor_stats.json", json);
            }
        }
    }
}

// 中间件: 记录访问者信息
pub async fn visitor_middleware(
    _state: (),
    req: Request<axum::body::Body>,
    next: Next,
) -> Response {
    // 获取请求路径
    let path = req.uri().path();
    
    // 只对主页请求计数，忽略静态资源和API请求
    let should_count = path == "/";
    
    if should_count {
        // 尝试从请求中获取客户端IP
        let ip = if let Some(x_forwarded_for) = req.headers().get("x-forwarded-for") {
            // 从X-Forwarded-For获取
            if let Ok(ip_str) = x_forwarded_for.to_str() {
                // 取第一个IP（如果有多个）
                ip_str.split(',').next().unwrap_or("unknown").trim().to_string()
            } else {
                "unknown".to_string()
            }
        } else if let Some(socket_addr) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
            // 从SocketAddr获取
            socket_addr.0.ip().to_string()
        } else {
            // 无法获取IP
            "unknown".to_string()
        };
        
        // 更新访问统计
        if let Some(stats_lock) = VISITOR_STATS.get() {
            if let Ok(mut stats) = stats_lock.lock() {
                stats.total_visits += 1;
                
                if ip != "unknown" {
                    stats.unique_ips.insert(ip.clone());
                    
                    // 增加IP访问计数
                    let count = stats.ip_visits.entry(ip).or_insert(0);
                    *count += 1;
                }
                
                // 每100次访问保存一次数据
                if stats.total_visits % 100 == 0 {
                    drop(stats); // 释放锁后保存
                    save_visitor_stats();
                }
            }
        }
    }
    
    // 继续处理请求
    next.run(req).await
}

// 获取访问者统计API
#[allow(dead_code)]
pub async fn get_visitor_stats_handler() -> axum::Json<VisitorStatsResponse> {
    let stats = get_visitor_stats();
    
    axum::Json(VisitorStatsResponse {
        total_visits: stats.total_visits,
        unique_ips: stats.unique_ip_count(),
    })
}

#[derive(Serialize)]
pub struct VisitorStatsResponse {
    total_visits: u64,
    unique_ips: usize,
}

// 导出保存访问者统计的函数
pub fn save_stats() {
    save_visitor_stats();
    info!("已保存访问者统计数据");
}

// 获取单个IP访问次数API
#[allow(dead_code)]
pub async fn get_current_ip_visits(
    req: Request<axum::body::Body>
) -> axum::Json<CurrentIpVisitResponse> {
    // 获取客户端IP
    let ip = if let Some(x_forwarded_for) = req.headers().get("x-forwarded-for") {
        if let Ok(ip_str) = x_forwarded_for.to_str() {
            ip_str.split(',').next().unwrap_or("unknown").trim().to_string()
        } else {
            "unknown".to_string()
        }
    } else if let Some(socket_addr) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
        socket_addr.0.ip().to_string()
    } else {
        "unknown".to_string()
    };
    
    // 获取IP访问次数
    let stats = get_visitor_stats();
    let visit_count = stats.get_ip_visit_count(&ip);
    
    axum::Json(CurrentIpVisitResponse {
        ip,
        visits: visit_count,
    })
}

#[derive(Serialize)]
pub struct CurrentIpVisitResponse {
    ip: String,
    visits: u64,
}
