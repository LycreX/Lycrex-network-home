use rimplog::debug;
use serde::Deserialize;
use crate::api::authenticate;
use crate::api::commands;

// 命令请求结构体
#[derive(Deserialize)]
pub struct CommandRequest {
    pub command: String,
    pub password: Option<String>,
    pub token: Option<String>,
}

// 处理命令（带认证）
pub async fn process_command_with_auth(
    command: &str, 
    password: Option<&str>, 
    token: Option<&str>,
    client_ip: Option<&str>
) -> commands::CommandResponse {
    let command_text = command.trim().to_lowercase();
    
    debug!("处理命令: '{}', 有密码: {}, 有token: {}", 
             command_text, 
             password.is_some(),
             token.is_some()
    );
    
    // 处理空命令
    if command_text.is_empty() {
        return commands::CommandResponse {
            success: false,
            message: "请输入命令".to_string(),
            action: None,
            token_status: None,
            request_password: None,
        };
    }
    
    // 检查是否已认证
    let mut is_authenticated = false;
    
    // 先检查token是否有效
    if let Some(t) = token {
        debug!("检查token: '{}'", t);
        if authenticate::validate_token(t, client_ip) {
            is_authenticated = true;
        } else {
            debug!("Token验证失败");
        }
    } else {
        debug!("没有提供token");
    }
    
    // 解析命令和参数
    let (command_name, args) = commands::parse_command(&command_text);
    
    // 寻找匹配的命令
    if let Some(cmd) = commands::COMMANDS.get(&command_name) {
        debug!("找到命令: '{}', 需要认证: {}", command_name, cmd.needs_auth());
        
        // 创建命令上下文
        let ctx = commands::CommandContext {
            command_text,
            args,
            is_authenticated,
            client_ip: client_ip.map(String::from),
        };
        
        // 执行命令
        return cmd.execute(ctx).await;
    }
    
    // 未知命令
    commands::unknown_command_response(&command_text)
} 