use async_trait::async_trait;
use super::{Command, CommandContext, CommandResponse, unauthorized_response};
use crate::api::authenticate;

pub struct TokenCommand {}

impl TokenCommand {
    pub fn new() -> Self {
        Self {}
    }
}

#[async_trait]
impl Command for TokenCommand {
    fn name(&self) -> &'static str {
        "token"
    }
    
    fn aliases(&self) -> Vec<&'static str> {
        vec!["tokens", "t", "tokenlist"]
    }
    
    fn description(&self) -> &'static str {
        "显示或管理令牌信息 (需要认证)\n用法: token [revoke <令牌ID>]"
    }
    
    fn needs_auth(&self) -> bool {
        true
    }
    
    async fn execute(&self, ctx: CommandContext) -> CommandResponse {
        // 检查是否已认证
        if !ctx.is_authenticated {
            return unauthorized_response();
        }
        
        // 检查是否有子命令
        if !ctx.args.is_empty() {
            let subcommand = ctx.args[0].to_lowercase();
            
            // 处理撤销token子命令
            if subcommand == "revoke" && ctx.args.len() > 1 {
                let token_id = &ctx.args[1];
                
                // 获取所有token详细信息
                let tokens = authenticate::get_token_details();
                
                // 尝试根据索引查找token
                if let Ok(index) = token_id.parse::<usize>() {
                    if index > 0 && index <= tokens.len() {
                        let token = &tokens[index - 1].token;
                        if authenticate::revoke_token(token) {
                            return CommandResponse {
                                success: true,
                                message: format!("已成功撤销令牌 #{}", index),
                                action: None,
                                token_status: None,
                                request_password: None,
                            };
                        }
                    }
                }
                
                // 如果通过索引没找到，可能直接提供了令牌
                if authenticate::revoke_token(token_id) {
                    return CommandResponse {
                        success: true,
                        message: format!("已成功撤销令牌: {}***", token_id.chars().take(5).collect::<String>()),
                        action: None,
                        token_status: None,
                        request_password: None,
                    };
                }
                
                return CommandResponse {
                    success: false,
                    message: "未找到指定的令牌，无法撤销".to_string(),
                    action: None,
                    token_status: None,
                    request_password: None,
                };
            }
            
            // 返回使用说明
            return CommandResponse {
                success: false,
                message: "未知的token子命令，可用命令:\n- token - 显示所有令牌\n- token revoke <令牌ID> - 撤销指定令牌".to_string(),
                action: None,
                token_status: None,
                request_password: None,
            };
        }
        
        // 获取token详细信息
        let tokens = authenticate::get_token_details();
        
        if tokens.is_empty() {
            return CommandResponse {
                success: true,
                message: "当前没有活跃的令牌".to_string(),
                action: None,
                token_status: None,
                request_password: None,
            };
        }
        
        // 构建显示信息
        let mut message = format!("共有 {} 个令牌:\n\n", tokens.len());
        
        for (index, token) in tokens.iter().enumerate() {
            let status_marker = if token.is_expired { "❌" } else { "✅" };
            
            message.push_str(&format!(
                "{}. 令牌: {}\n   IP: {}\n   创建时间: {}\n   过期时间: {}\n   状态: {}{}\n   撤销命令: token revoke {}\n\n",
                index + 1,
                token.token_masked,
                token.ip_address,
                token.created_at,
                token.expires_at,
                status_marker,
                token.status,
                index + 1
            ));
        }
        
        message.push_str("\n✅ = 有效  ❌ = 已过期\n");
        message.push_str("提示: 使用 'token revoke <令牌ID>' 可撤销指定令牌");
        
        CommandResponse {
            success: true,
            message,
            action: None,
            token_status: None,
            request_password: None,
        }
    }
} 