use std::sync::{Arc, Mutex, OnceLock};
use std::collections::{HashSet, HashMap};
use axum::http::Request;
use axum::extract::ConnectInfo;
use std::net::SocketAddr;
use serde::{Serialize, Deserialize};
use std::fs;
use rimplog::info;
use regex;
use tokio::time::{interval, Duration};
use std::sync::atomic::{AtomicBool, Ordering};

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

// 定时保存任务状态
static TIMER_RUNNING: AtomicBool = AtomicBool::new(false);

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

// 启动定时保存功能
pub fn start_periodic_save(interval_secs: u64) {
    // 防止重复启动
    if TIMER_RUNNING.swap(true, Ordering::SeqCst) {
        info!("定时保存任务已在运行中");
        return;
    }
    
    info!("启动定时保存访问者统计数据，间隔：{}秒", interval_secs);
    
    // 创建一个新的异步任务来定时保存数据
    tokio::spawn(async move {
        let mut interval_timer = interval(Duration::from_secs(interval_secs));
        
        loop {
            // 等待下一个间隔
            interval_timer.tick().await;
            
            // 保存访问者统计数据
            save_visitor_stats();
            info!("已定时保存访问者统计数据");
        }
    });
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

// 创建一个新的端点，让客户端上报自己的IP
pub async fn report_visitor_ip(req: axum::Json<VisitorReportRequest>) -> axum::Json<VisitorReportResponse> {
    let ip = req.ip.clone();
    
    // 验证IP格式（简单验证）
    if !is_valid_ip(&ip) {
        return axum::Json(VisitorReportResponse {
            success: false,
            message: "无效的IP地址格式".to_string(),
            visits: 0,
        });
    }
    
    // 更新访问统计
    if let Some(stats_lock) = VISITOR_STATS.get() {
        if let Ok(mut stats) = stats_lock.lock() {
            stats.total_visits += 1;
            
            stats.unique_ips.insert(ip.clone());
            
            // 增加IP访问计数
            let count = stats.ip_visits.entry(ip.clone()).or_insert(0);
            *count += 1;
            
            // 保存当前访问次数
            let visit_count = *count;
            
            // 每10次访问保存一次数据
            if stats.total_visits % 10 == 0 {
                drop(stats); // 释放锁后保存
                save_visitor_stats();
            }
            
            axum::Json(VisitorReportResponse {
                success: true,
                message: "访问已记录".to_string(),
                visits: visit_count,
            })
        } else {
            axum::Json(VisitorReportResponse {
                success: false,
                message: "无法获取访问统计锁".to_string(),
                visits: 0,
            })
        }
    } else {
        axum::Json(VisitorReportResponse {
            success: false,
            message: "访问统计未初始化".to_string(),
            visits: 0,
        })
    }
}

// 验证IP地址格式
fn is_valid_ip(ip: &str) -> bool {
    // IPv4格式验证 (简单实现)
    if let Some(captures) = regex::Regex::new(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$").ok().and_then(|re| re.captures(ip)) {
        for i in 1..=4 {
            if let Some(octet) = captures.get(i) {
                if let Ok(num) = octet.as_str().parse::<u32>() {
                    if num > 255 {
                        return false;
                    }
                } else {
                    return false;
                }
            }
        }
        return true;
    }
    
    // IPv6格式验证 (简化实现)
    regex::Regex::new(r"^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$").ok()
        .map_or(false, |re| re.is_match(ip))
}

#[derive(Deserialize)]
pub struct VisitorReportRequest {
    ip: String,
}

#[derive(Serialize)]
pub struct VisitorReportResponse {
    pub success: bool,
    pub message: String,
    pub visits: u64,
}
