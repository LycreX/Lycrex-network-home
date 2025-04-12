use async_trait::async_trait;
use std::time::{SystemTime, UNIX_EPOCH};
use super::{Command, CommandContext, CommandResponse, unauthorized_response};

pub struct SystemCommand {}

impl SystemCommand {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Command for SystemCommand {
    fn name(&self) -> &'static str {
        "system"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["sys", "info", "status"]
    }
    
    fn description(&self) -> &'static str {
        "查看系统信息 (需要认证)"
    }
    
    fn needs_auth(&self) -> bool {
        true
    }
    
    async fn execute(&self, ctx: CommandContext) -> CommandResponse {
        // 检查是否已认证
        if !ctx.is_authenticated {
            return unauthorized_response();
        }
        
        // 获取系统信息
        let system_info = format!(
            "系统信息:\n- 操作系统: {}\n- CPU核心数: {}\n- 内存: {}MB\n- 运行时间: {}小时",
            std::env::consts::OS,
            num_cpus::get(),
            sys_info::mem_info().map(|m| m.total / 1024).unwrap_or(0),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() / 3600
        );
        
        CommandResponse {
            success: true,
            message: system_info,
            action: None,
            token_status: None,
            request_password: None,
        }
    }
} 