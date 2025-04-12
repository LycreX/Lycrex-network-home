use async_trait::async_trait;
use super::{Command, CommandContext, CommandResponse, CommandAction, unauthorized_response};

// 定义所有可跳转的目标 (目标名, 描述, URL, 是否需要认证)
const TARGETS: [(&str, &str, &str, bool); 3] = [
    // (目标名, 描述, URL, 是否需要认证)
    ("home", "首页", "https://lycrex.com", false),
    ("git", "Git仓库", "https://git.lycrex.com", false),
    ("tv", "TV平台", "https://tv.lycrex.com", false),
];

pub struct EnterCommand {}

impl EnterCommand {
    pub fn new() -> Self {
        Self {}
    }
    
    // 获取所有可用目标
    fn get_targets(&self, is_authenticated: bool) -> String {
        let mut targets = "可用目标:\n".to_string();
        for (name, desc, _, need_auth) in TARGETS.iter() {
            // 如果目标需要认证但用户未认证，则跳过显示
            if *need_auth && !is_authenticated {
                continue;
            }
            
            let auth_mark = if *need_auth { "🔒" } else { "" };
            targets.push_str(&format!("- {}{}: {}\n", name, auth_mark, desc));
        }
        
        // 添加认证标记说明
        if is_authenticated {
            targets.push_str("\n🔒 表示需要认证才能执行");
        }
        
        targets
    }
    
    // 处理目标跳转，根据命令名或参数确定目标
    fn process_target(&self, cmd: &str, args: &[String]) -> Option<(&'static str, &'static str, bool)> {
        // 如果命令名是一个有效的目标（例如"home"、"git"、"tv"），则直接使用它
        if let Some(&(name, _, url, need_auth)) = TARGETS.iter().find(|&&(n, _, _, _)| n == cmd) {
            return Some((name, url, need_auth));
        }
        
        // 如果参数存在，则尝试使用第一个参数作为目标
        if !args.is_empty() {
            let target = &args[0].to_lowercase();
            if let Some(&(name, _, url, need_auth)) = TARGETS.iter().find(|&&(n, _, _, _)| n == target) {
                return Some((name, url, need_auth));
            }
        }
        
        None
    }
}

#[async_trait]
impl Command for EnterCommand {
    fn name(&self) -> &'static str {
        "enter"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["goto", "open", "访问"]
    }
    
    fn description(&self) -> &'static str {
        "跳转到指定目标 (enter <目标>)"
    }
    
    async fn execute(&self, ctx: CommandContext) -> CommandResponse {
        // 先根据命令名和参数直接查找目标
        let cmd_parts: Vec<&str> = ctx.command_text.trim().split_whitespace().collect();
        let cmd_name = if !cmd_parts.is_empty() { cmd_parts[0].to_lowercase() } else { String::new() };
        
        // 处理目标跳转
        if let Some((name, url, need_auth)) = self.process_target(&cmd_name, &ctx.args) {
            // 检查认证权限
            if need_auth && !ctx.is_authenticated {
                return unauthorized_response();
            }
            
            return CommandResponse {
                success: true,
                message: format!("正在跳转到{}...", name),
                action: Some(CommandAction {
                    action_type: "redirect".to_string(),
                    target: url.to_string(),
                }),
                token_status: None,
                request_password: None,
            };
        }
        
        // 如果是enter命令但没有提供有效目标
        if cmd_name == "enter" || 
           cmd_name == "goto" ||
           cmd_name == "open" ||
           cmd_name == "访问" {
            return CommandResponse {
                success: false,
                message: format!("用法: enter <目标>\n{}", self.get_targets(ctx.is_authenticated)),
                action: None,
                token_status: None,
                request_password: None,
            };
        }
        
        // 不是有效的目标名或enter命令
        CommandResponse {
            success: false,
            message: format!("未知的目标: {}\n{}", cmd_name, self.get_targets(ctx.is_authenticated)),
            action: None,
            token_status: None,
            request_password: None,
        }
    }
} 