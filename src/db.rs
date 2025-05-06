use std::sync::{Arc, Mutex, OnceLock};
use rusqlite::{Connection, Result as SqliteResult};
use std::path::Path;
use rimplog::info;
use std::time::{SystemTime, UNIX_EPOCH};

// IP访问记录结构体
#[derive(Debug, Clone)]
pub struct IpVisitRecord {
    pub ip: String,
    pub visit_count: u64,
    pub continent_code: Option<String>,
    pub continent_name: Option<String>,
    pub country_code: Option<String>,
    pub country_name: Option<String>,
    pub state_prov: Option<String>,
    pub city: Option<String>,
    pub last_visit: u64,
}

// 数据库连接单例
static DB_CONN: OnceLock<Arc<Mutex<Connection>>> = OnceLock::new();

// 用户备忘录结构体
#[derive(Debug, Clone)]
pub struct UserNote {
    #[allow(dead_code)]
    pub user_id: String,
    pub content: String,
    pub last_updated: u64,
}

// 公共便利贴结构体
#[derive(Debug, Clone)]
pub struct PublicNote {
    #[allow(dead_code)]
    pub channel_id: u32,
    pub content: String,
    pub last_updated: u64,
}

// 用户频道设置结构体
#[derive(Debug, Clone)]
pub struct UserChannelSetting {
    #[allow(dead_code)]
    pub user_id: String,
    pub channel_id: u32,
    pub last_updated: u64,
}

// 初始化数据库
pub fn init_db(db_path: &str) -> SqliteResult<()> {
    // 确保数据库目录存在
    if let Some(parent) = Path::new(db_path).parent() {
        if !parent.exists() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return Err(rusqlite::Error::SqliteFailure(
                    rusqlite::ffi::Error {
                        code: rusqlite::ffi::ErrorCode::CannotOpen,
                        extended_code: 0,
                    },
                    Some(format!("无法创建数据库目录: {}", e)),
                ));
            }
        }
    }
    
    // 创建数据库连接
    let conn = Connection::open(db_path)?;
    
    // 创建访问者统计表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS visitor_stats (
            id INTEGER PRIMARY KEY,
            total_visits INTEGER NOT NULL DEFAULT 0
        )",
        [],
    )?;
    
    // 创建IP访问表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ip_visits (
            ip TEXT PRIMARY KEY,
            visit_count INTEGER NOT NULL DEFAULT 0,
            continent_code TEXT,
            continent_name TEXT,
            country_code TEXT,
            country_name TEXT,
            state_prov TEXT,
            city TEXT,
            last_visit INTEGER
        )",
        [],
    )?;
    
    // 创建用户备忘录表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_notes (
            user_id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            last_updated INTEGER NOT NULL
        )",
        [],
    )?;
    
    // 创建公共便利贴表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS public_notes (
            channel_id INTEGER PRIMARY KEY,
            content TEXT NOT NULL,
            last_updated INTEGER NOT NULL
        )",
        [],
    )?;
    
    // 创建用户频道设置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_channel_settings (
            user_id TEXT PRIMARY KEY,
            channel_id INTEGER NOT NULL DEFAULT 0,
            last_updated INTEGER NOT NULL
        )",
        [],
    )?;
    
    // 存储连接
    DB_CONN.get_or_init(|| Arc::new(Mutex::new(conn)));
    
    info!("数据库初始化完成: {}", db_path);
    
    Ok(())
}

// 获取数据库连接
pub fn get_db_conn() -> Arc<Mutex<Connection>> {
    DB_CONN.get()
        .expect("数据库未初始化")
        .clone()
}

// 递增总访问次数
pub fn increment_total_visits() -> SqliteResult<u64> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    // 首先获取当前值
    let mut stmt = conn.prepare("SELECT total_visits FROM visitor_stats WHERE id = 1")?;
    let total_visits: Result<u64, _> = stmt.query_row([], |row| row.get(0));
    
    let current_total = match total_visits {
        Ok(count) => count,
        Err(_) => {
            // 如果没有记录，创建一个初始记录
            conn.execute("INSERT INTO visitor_stats (id, total_visits) VALUES (1, 0)", [])?;
            0
        }
    };
    
    // 更新总访问次数
    let new_total = current_total + 1;
    conn.execute(
        "UPDATE visitor_stats SET total_visits = ? WHERE id = 1",
        [new_total],
    )?;
    
    Ok(new_total)
}

// 递增指定IP的访问次数
pub fn increment_ip_visit(
    ip: &str,
    continent_code: Option<&str>,
    continent_name: Option<&str>,
    country_code: Option<&str>,
    country_name: Option<&str>,
    state_prov: Option<&str>,
    city: Option<&str>
) -> SqliteResult<u64> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    // 获取当前时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // 查询是否已存在记录
    let exists: bool = conn.query_row(
        "SELECT 1 FROM ip_visits WHERE ip = ?",
        [ip],
        |_| Ok(true)
    ).unwrap_or(false);
    
    if exists {
        // 如果存在记录，更新访问次数和地理位置信息（如果提供）
        let mut query = String::from(
            "UPDATE ip_visits SET 
             visit_count = visit_count + 1,
             last_visit = ?"
        );
        
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now)];
        
        if let Some(code) = continent_code {
            query.push_str(", continent_code = ?");
            params.push(Box::new(code));
        }
        
        if let Some(name) = continent_name {
            query.push_str(", continent_name = ?");
            params.push(Box::new(name));
        }
        
        if let Some(code) = country_code {
            query.push_str(", country_code = ?");
            params.push(Box::new(code));
        }
        
        if let Some(name) = country_name {
            query.push_str(", country_name = ?");
            params.push(Box::new(name));
        }
        
        if let Some(state) = state_prov {
            query.push_str(", state_prov = ?");
            params.push(Box::new(state));
        }
        
        if let Some(c) = city {
            query.push_str(", city = ?");
            params.push(Box::new(c));
        }
        
        query.push_str(" WHERE ip = ?");
        params.push(Box::new(ip));
        
        let mut stmt = conn.prepare(&query)?;
        stmt.execute(rusqlite::params_from_iter(params.iter()))?;
    } else {
        // 如果不存在记录，插入新记录
        conn.execute(
            "INSERT INTO ip_visits 
             (ip, visit_count, continent_code, continent_name, country_code, country_name, state_prov, city, last_visit) 
             VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![
                ip, 
                continent_code, 
                continent_name, 
                country_code, 
                country_name, 
                state_prov, 
                city,
                now
            ],
        )?;
    }
    
    // 获取更新后的访问次数
    let visit_count: u64 = conn.query_row(
        "SELECT visit_count FROM ip_visits WHERE ip = ?",
        [ip],
        |row| row.get(0),
    )?;
    
    Ok(visit_count)
}

// 获取总访问次数
pub fn get_total_visits() -> SqliteResult<u64> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let total_visits: Result<u64, _> = conn.query_row(
        "SELECT total_visits FROM visitor_stats WHERE id = 1",
        [],
        |row| row.get(0),
    );
    
    match total_visits {
        Ok(count) => Ok(count),
        Err(_) => Ok(0), // 如果没有记录，返回0
    }
}

// 获取唯一IP数量
pub fn get_unique_ip_count() -> SqliteResult<usize> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM ip_visits",
        [],
        |row| row.get(0),
    )?;
    
    Ok(count as usize)
}

// 获取指定IP的访问次数
pub fn get_ip_visit_count(ip: &str) -> SqliteResult<u64> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let visit_count = conn.query_row(
        "SELECT visit_count FROM ip_visits WHERE ip = ?",
        [ip],
        |row| row.get(0),
    );
    
    match visit_count {
        Ok(count) => Ok(count),
        Err(_) => Ok(0), // 如果没有记录，返回0
    }
}

// 获取所有IP访问记录
#[allow(unused)]
pub fn get_all_ip_visits() -> SqliteResult<Vec<(String, u64)>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let mut stmt = conn.prepare("SELECT ip, visit_count FROM ip_visits")?;
    let rows = stmt.query_map([], |row| {
        let ip: String = row.get(0)?;
        let count: u64 = row.get(1)?;
        Ok((ip, count))
    })?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

// 获取IP详细访问信息
pub fn get_ip_visit_detail(ip: &str) -> SqliteResult<Option<IpVisitRecord>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let result = conn.query_row(
        "SELECT ip, visit_count, continent_code, continent_name, country_code, country_name, state_prov, city, last_visit 
         FROM ip_visits WHERE ip = ?",
        [ip],
        |row| {
            Ok(IpVisitRecord {
                ip: row.get(0)?,
                visit_count: row.get(1)?,
                continent_code: row.get(2)?,
                continent_name: row.get(3)?,
                country_code: row.get(4)?,
                country_name: row.get(5)?,
                state_prov: row.get(6)?,
                city: row.get(7)?,
                last_visit: row.get(8)?,
            })
        }
    );
    
    match result {
        Ok(record) => Ok(Some(record)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// 获取所有IP访问详细记录
#[allow(unused)]
pub fn get_all_ip_visit_details() -> SqliteResult<Vec<IpVisitRecord>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let mut stmt = conn.prepare(
        "SELECT ip, visit_count, continent_code, continent_name, country_code, country_name, state_prov, city, last_visit 
         FROM ip_visits"
    )?;
    
    let rows = stmt.query_map([], |row| {
        Ok(IpVisitRecord {
            ip: row.get(0)?,
            visit_count: row.get(1)?,
            continent_code: row.get(2)?,
            continent_name: row.get(3)?,
            country_code: row.get(4)?,
            country_name: row.get(5)?,
            state_prov: row.get(6)?,
            city: row.get(7)?,
            last_visit: row.get(8)?,
        })
    })?;
    
    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    
    Ok(result)
}

// 保存用户备忘录内容
pub fn save_user_note(user_id: &str, content: &str) -> SqliteResult<()> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    // 获取当前时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // 使用 REPLACE 语法，如果用户已有备忘录则更新，否则插入新记录
    conn.execute(
        "REPLACE INTO user_notes (user_id, content, last_updated) VALUES (?, ?, ?)",
        [user_id, content, &now.to_string()],
    )?;
    
    Ok(())
}

// 获取用户备忘录内容
pub fn get_user_note(user_id: &str) -> SqliteResult<Option<UserNote>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let result = conn.query_row(
        "SELECT user_id, content, last_updated FROM user_notes WHERE user_id = ?",
        [user_id],
        |row| {
            Ok(UserNote {
                user_id: row.get(0)?,
                content: row.get(1)?,
                last_updated: row.get(2)?,
            })
        }
    );
    
    match result {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// 保存公共便利贴内容
pub fn save_public_note(channel_id: u32, content: &str) -> SqliteResult<()> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    // 获取当前时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // 使用 REPLACE 语法，如果已有记录则更新，否则插入新记录
    conn.execute(
        "REPLACE INTO public_notes (channel_id, content, last_updated) VALUES (?, ?, ?)",
        [&channel_id.to_string(), content, &now.to_string()],
    )?;
    
    Ok(())
}

// 获取公共便利贴内容
pub fn get_public_note(channel_id: u32) -> SqliteResult<Option<PublicNote>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let result = conn.query_row(
        "SELECT channel_id, content, last_updated FROM public_notes WHERE channel_id = ?",
        [channel_id],
        |row| {
            Ok(PublicNote {
                channel_id: row.get::<_, i64>(0)? as u32,
                content: row.get(1)?,
                last_updated: row.get(2)?,
            })
        }
    );
    
    match result {
        Ok(note) => Ok(Some(note)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

// 保存用户频道设置
pub fn save_user_channel_setting(user_id: &str, channel_id: u32) -> SqliteResult<()> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    // 获取当前时间戳
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // 使用 REPLACE 语法，如果已有记录则更新，否则插入新记录
    conn.execute(
        "REPLACE INTO user_channel_settings (user_id, channel_id, last_updated) VALUES (?, ?, ?)",
        [user_id, &channel_id.to_string(), &now.to_string()],
    )?;
    
    Ok(())
}

// 获取用户频道设置
pub fn get_user_channel_setting(user_id: &str) -> SqliteResult<Option<UserChannelSetting>> {
    let conn = get_db_conn();
    let conn = conn.lock().expect("无法获取数据库锁");
    
    let result = conn.query_row(
        "SELECT user_id, channel_id, last_updated FROM user_channel_settings WHERE user_id = ?",
        [user_id],
        |row| {
            Ok(UserChannelSetting {
                user_id: row.get(0)?,
                channel_id: row.get::<_, i64>(1)? as u32,
                last_updated: row.get(2)?,
            })
        }
    );
    
    match result {
        Ok(setting) => Ok(Some(setting)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
} 