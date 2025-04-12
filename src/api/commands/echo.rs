use async_trait::async_trait;
use super::{Command, CommandContext, CommandResponse};

pub struct EchoCommand {}

impl EchoCommand {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Command for EchoCommand {
    fn name(&self) -> &'static str {
        "echo"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["e", "print", "输出"]
    }
    
    fn description(&self) -> &'static str {
        "回显输入的文本"
    }
    
    async fn execute(&self, ctx: CommandContext) -> CommandResponse {
        // 如果没有参数，返回使用说明
        if ctx.args.is_empty() {
            return CommandResponse {
                success: false,
                message: "用法: echo <文本>\n例如: echo 你好，世界".to_string(),
                action: None,
                token_status: None,
                request_password: None,
            };
        }
        
        // 连接所有参数作为回显内容
        let echo_text = ctx.args.join(" ");
        
        // 构造响应
        CommandResponse {
            success: true,
            message: format!("回显: {}", echo_text),
            action: None,
            token_status: None,
            request_password: None,
        }
    }
} 