use std::sync::atomic::{AtomicBool, Ordering};
use axum::http::Request;
use axum::extract::ConnectInfo;
use std::net::SocketAddr;
use serde::{Serialize, Deserialize};
use rimplog::info;
use regex;
use tokio::time::{interval, Duration};
use crate::db;

// 定时保存任务状态
static TIMER_RUNNING: AtomicBool = AtomicBool::new(false);

// 初始化访问者统计
pub fn init_visitor_stats() {
    info!("访问者统计已初始化（使用数据库存储）");
}

// 启动定时保存功能
#[allow(dead_code)]
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
            info!("数据库已自动持久化访问者统计数据");
        }
    });
}

// 访问者统计API
#[allow(dead_code)]
pub async fn get_visitor_stats_handler() -> axum::Json<VisitorStatsResponse> {
    let total_visits = db::get_total_visits().unwrap_or(0);
    let unique_ips = db::get_unique_ip_count().unwrap_or(0);
    
    axum::Json(VisitorStatsResponse {
        total_visits,
        unique_ips,
    })
}

#[derive(Serialize)]
pub struct VisitorStatsResponse {
    total_visits: u64,
    unique_ips: usize,
}

// 保存访问者统计
pub fn save_stats() {
    info!("数据库已保存访问者统计数据");
}

// 获取单个IP访问次数API
#[allow(dead_code)]
pub async fn get_current_ip_visits(
    req: Request<axum::body::Body>
) -> axum::Json<CurrentIpVisitResponse> {
    // 获取客户端IP
    let ip = extract_ip_from_request(&req);
    
    // 获取IP访问次数
    let visit_count = db::get_ip_visit_count(&ip).unwrap_or(0);
    
    axum::Json(CurrentIpVisitResponse {
        ip,
        visits: visit_count,
    })
}

// 获取IP详细访问信息API
#[allow(dead_code)]
pub async fn get_ip_visit_detail_handler(
    req: Request<axum::body::Body>
) -> axum::Json<IpVisitDetailResponse> {
    // 获取客户端IP
    let ip = extract_ip_from_request(&req);
    
    // 获取IP详细信息
    match db::get_ip_visit_detail(&ip) {
        Ok(Some(detail)) => {
            axum::Json(IpVisitDetailResponse {
                success: true,
                ip: detail.ip,
                visits: detail.visit_count,
                continent_code: detail.continent_code,
                continent_name: detail.continent_name,
                country_code: detail.country_code,
                country_name: detail.country_name,
                state_prov: detail.state_prov,
                city: detail.city,
                last_visit: detail.last_visit,
                message: None,
            })
        },
        Ok(None) => {
            axum::Json(IpVisitDetailResponse {
                success: false,
                ip,
                visits: 0,
                continent_code: None,
                continent_name: None,
                country_code: None,
                country_name: None,
                state_prov: None,
                city: None,
                last_visit: 0,
                message: Some("IP记录不存在".to_string()),
            })
        },
        Err(e) => {
            axum::Json(IpVisitDetailResponse {
                success: false,
                ip,
                visits: 0,
                continent_code: None,
                continent_name: None,
                country_code: None,
                country_name: None,
                state_prov: None,
                city: None,
                last_visit: 0,
                message: Some(format!("获取IP详细信息失败: {}", e)),
            })
        }
    }
}

// 从请求中提取IP
fn extract_ip_from_request(req: &Request<axum::body::Body>) -> String {
    if let Some(x_forwarded_for) = req.headers().get("x-forwarded-for") {
        if let Ok(ip_str) = x_forwarded_for.to_str() {
            ip_str.split(',').next().unwrap_or("unknown").trim().to_string()
        } else {
            "unknown".to_string()
        }
    } else if let Some(socket_addr) = req.extensions().get::<ConnectInfo<SocketAddr>>() {
        socket_addr.0.ip().to_string()
    } else {
        "unknown".to_string()
    }
}

#[derive(Serialize)]
pub struct CurrentIpVisitResponse {
    ip: String,
    visits: u64,
}

#[derive(Serialize)]
pub struct IpVisitDetailResponse {
    success: bool,
    ip: String,
    visits: u64,
    continent_code: Option<String>,
    continent_name: Option<String>,
    country_code: Option<String>,
    country_name: Option<String>,
    state_prov: Option<String>,
    city: Option<String>,
    last_visit: u64,
    message: Option<String>,
}

// 创建一个新的端点，让客户端上报自己的IP
pub async fn report_visitor_ip(req: axum::Json<VisitorReportRequest>) -> axum::Json<VisitorReportResponse> {
    let ip = req.ip.clone();
    
    // 验证IP格式
    if !is_valid_ip(&ip) {
        return axum::Json(VisitorReportResponse {
            success: false,
            message: "无效的IP地址格式".to_string(),
            visits: 0,
        });
    }
    
    // 更新访问统计
    match db::increment_total_visits() {
        Ok(_) => {
            // 增加IP访问计数并更新地理位置信息
            match db::increment_ip_visit(
                &ip,
                req.continent_code.as_deref(),
                req.continent_name.as_deref(),
                req.country_code.as_deref(),
                req.country_name.as_deref(),
                req.state_prov.as_deref(),
                req.city.as_deref()
            ) {
                Ok(visit_count) => {
                    axum::Json(VisitorReportResponse {
                        success: true,
                        message: "访问已记录".to_string(),
                        visits: visit_count,
                    })
                },
                Err(e) => {
                    axum::Json(VisitorReportResponse {
                        success: false,
                        message: format!("更新IP访问次数失败: {}", e),
                        visits: 0,
                    })
                }
            }
        },
        Err(e) => {
            axum::Json(VisitorReportResponse {
                success: false,
                message: format!("更新总访问次数失败: {}", e),
                visits: 0,
            })
        }
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
    continent_code: Option<String>,
    continent_name: Option<String>,
    country_code: Option<String>,
    country_name: Option<String>,
    state_prov: Option<String>,
    city: Option<String>,
}

#[derive(Serialize)]
pub struct VisitorReportResponse {
    pub success: bool,
    pub message: String,
    pub visits: u64,
}
