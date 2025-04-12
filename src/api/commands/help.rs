use async_trait::async_trait;
use super::{Command, CommandContext, CommandResponse, get_all_commands};

pub struct HelpCommand {}

impl HelpCommand {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Command for HelpCommand {
    fn name(&self) -> &'static str {
        "help"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["h", "?"]
    }
    
    fn description(&self) -> &'static str {
        "显示帮助信息"
    }
    
    async fn execute(&self, ctx: CommandContext) -> CommandResponse {
        // 获取所有命令
        let all_commands = get_all_commands();
        
        // 生成命令帮助信息
        let mut help_text = "可用命令:\n".to_string();
        
        for cmd in all_commands {
            // 如果命令需要认证但用户未认证，则跳过显示该命令
            if cmd.needs_auth() && !ctx.is_authenticated {
                continue;
            }
            
            // 添加命令名称
            let auth_mark = if cmd.needs_auth() { "🔒" } else { "" };
            let aliases = cmd.aliases();
            
            let alias_text = if !aliases.is_empty() {
                let alias_str = aliases.join(", ");
                format!(" (别名: {})", alias_str)
            } else {
                String::new()
            };
            
            help_text.push_str(&format!("- {}{}{}: {}\n", 
                cmd.name(), 
                auth_mark,
                alias_text,
                cmd.description()
            ));
        }
        
        // 只有在有认证命令且用户已认证的情况下才显示认证标记说明
        if ctx.is_authenticated {
            help_text.push_str("\n🔒 表示需要认证才能执行");
        }
        
        CommandResponse {
            success: true,
            message: help_text,
            action: None,
            token_status: None,
            request_password: None,
        }
    }
} 