use async_trait::async_trait;
use super::{Command, CommandContext, CommandResponse};

pub struct PasswordCommand {}

impl PasswordCommand {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Command for PasswordCommand {
    fn name(&self) -> &'static str {
        "password"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["pass", "p", "login"]
    }
    
    fn description(&self) -> &'static str {
        "输入密码认证"
    }
    
    async fn execute(&self, _ctx: CommandContext) -> CommandResponse {
        CommandResponse {
            success: true,
            message: "请输入密码进行认证".to_string(),
            action: None,
            token_status: None,
            request_password: Some("请输入密码进行认证".to_string()),
        }
    }
} 