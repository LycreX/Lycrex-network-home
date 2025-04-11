use rimplog::debug;
use serde::{Deserialize, Serialize};
use crate::api::authenticate;

// 命令请求结构体
#[derive(Deserialize)]
pub struct CommandRequest {
    pub command: String,
    pub password: Option<String>,
    pub token: Option<String>,
}

// 命令响应结构体
#[derive(Serialize)]
pub struct CommandResponse {
    pub success: bool,
    pub message: String,
    pub action: Option<CommandAction>,
    pub token_status: Option<TokenStatus>,
}

// 命令操作结构体
#[derive(Serialize)]
pub struct CommandAction {
    pub action_type: String,
    pub target: String,
}

// Token状态信息结构体
#[derive(Serialize)]
pub struct TokenStatus {
    pub valid: bool,
    pub expired: bool,
    pub expired_for: Option<String>,
}

// 命令信息结构体
struct CommandInfo {
    needs_auth: bool,
    description: &'static str,
}

// 命令列表及其权限配置
const COMMANDS: [(&str, CommandInfo); 5] = [
    ("help", CommandInfo { 
        needs_auth: false, 
        description: "显示帮助信息"
    }),
    ("home", CommandInfo { 
        needs_auth: false, 
        description: "跳转到主页" 
    }),
    ("password", CommandInfo { 
        needs_auth: false, 
        description: "输入密码认证" 
    }),
    ("admin", CommandInfo { 
        needs_auth: true, 
        description: "进入管理面板 (需要认证)" 
    }),
    ("system", CommandInfo { 
        needs_auth: true, 
        description: "查看系统信息 (需要认证)" 
    }),
];

// 处理命令（不带认证）
#[deprecated(since = "0.0.4", note = "使用process_command_with_auth替代")]
#[allow(unused)]
pub async fn process_command(command: &str) -> CommandResponse {
    process_command_with_auth(command, None, None).await
}

// 验证token是否有效
fn validate_token(token: &str) -> bool {
    authenticate::validate_token(token, None)
}

// 处理命令（带密码）
#[deprecated(since = "0.0.4", note = "使用process_command_with_auth替代")]
#[allow(unused)]
pub async fn process_command_with_password(command: &str, password: Option<&str>) -> CommandResponse {
    process_command_with_auth(command, password, None).await
}

// 处理命令（带认证）
pub async fn process_command_with_auth(command: &str, password: Option<&str>, token: Option<&str>) -> CommandResponse {
    let command = command.trim().to_lowercase();
    
    debug!("处理命令: '{}', 有密码: {}, 有token: {}", 
             command, 
             password.is_some(),
             token.is_some()
    );
    
    // 处理空命令
    if command.is_empty() {
        return CommandResponse {
            success: false,
            message: "请输入命令".to_string(),
            action: None,
            token_status: None,
        };
    }
    
    // 检查命令是否存在并获取其权限设置
    let command_info = COMMANDS.iter().find(|&(cmd, _)| *cmd == command);
    
    // 处理help命令
    if command == "help" {
        // 检查用户是否已认证
        let is_authenticated = token.is_some() || password.is_some() && password.unwrap() == "secure123";
        
        // 生成命令帮助信息
        let mut help_text = "可用命令:\n".to_string();
        for (cmd, info) in COMMANDS.iter() {
            // 如果命令需要认证但用户未认证，则跳过显示该命令
            if info.needs_auth && !is_authenticated {
                continue;
            }
            
            let auth_mark = if info.needs_auth { "🔒" } else { "" };
            help_text.push_str(&format!("- {}{}: {}\n", cmd, auth_mark, info.description));
        }
        
        // 只有在有认证命令且用户已认证的情况下才显示认证标记说明
        if is_authenticated {
            help_text.push_str("\n🔒 表示需要认证才能执行");
        }
        
        return CommandResponse {
            success: true,
            message: help_text,
            action: None,
            token_status: None,
        };
    }
    
    // 处理 "home" 命令
    if command == "home" || command == "enter home" {
        return CommandResponse {
            success: true,
            message: "正在跳转到主页...".to_string(),
            action: Some(CommandAction {
                action_type: "redirect".to_string(),
                target: "https://lycrex.com".to_string(),
            }),
            token_status: None,
        };
    }
    
    // 对于其他命令，检查是否存在
    if let Some((cmd, info)) = command_info {
        debug!("找到命令: '{}', 需要认证: {}", cmd, info.needs_auth);
        
        // 检查命令是否需要认证
        if info.needs_auth {
            let mut authenticated = false;
            
            // 先检查token是否有效
            if let Some(t) = token {
                debug!("检查token: '{}'", t);
                if validate_token(t) {
                    authenticated = true;
                } else {
                    debug!("Token验证失败");
                }
            } else {
                debug!("没有提供token");
            }
            
            // // 再检查密码是否有效
            // if !authenticated && password.is_some() {
            //     let pwd = password.unwrap();
            //     debug!("检查密码: '{}'", if pwd.is_empty() { "空" } else { "非空" });
            //     if !pwd.is_empty() && pwd == "secure123" {
            //         authenticated = true;
            //         debug!("密码验证通过");
            //     } else {
            //         debug!("密码验证失败");
            //     }
            // } else if !authenticated {
            //     debug!("没有提供密码");
            // }
            
            if authenticated {
                debug!("认证成功，执行命令: '{}'", command);
                return execute_authenticated_command(&command).await;
            } else {
                debug!("认证失败，无法执行命令: '{}'", command);
                return CommandResponse {
                    success: false,
                    message: "您无权执行此命令".to_string(),
                    action: None,
                    token_status: None,
                };
            }
        } else {
            // 不需要认证的命令
            if command == "password" {
                return CommandResponse {
                    success: true,
                    message: "请输入密码进行认证".to_string(),
                    action: None,
                    token_status: None,
                };
            }
            
            // 其他不需要认证的命令
            return execute_unauthenticated_command(&command).await;
        }
    }
    
    // 未知命令
    CommandResponse {
        success: false,
        message: format!("未知命令: {}\n输入 help 查看可用命令", command),
        action: None,
        token_status: None,
    }
}

// 执行需要认证的命令
async fn execute_authenticated_command(command: &str) -> CommandResponse {
    match command {
        "admin" | "dashboard" => CommandResponse {
            success: true,
            message: "正在进入管理面板...".to_string(),
            action: Some(CommandAction {
                action_type: "redirect".to_string(),
                target: "/admin".to_string(),
            }),
            token_status: None,
        },
        "system" => {
            // 获取系统信息
            let system_info = format!(
                "系统信息:\n- 操作系统: {}\n- CPU核心数: {}\n- 内存: {}MB\n- 运行时间: {}小时",
                std::env::consts::OS,
                num_cpus::get(),
                sys_info::mem_info().map(|m| m.total / 1024).unwrap_or(0),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() / 3600
            );
            
            CommandResponse {
                success: true,
                message: system_info,
                action: None,
                token_status: None,
            }
        },
        _ => CommandResponse {
            success: false,
            message: "未实现的认证命令".to_string(),
            action: None,
            token_status: None,
        },
    }
}

// 执行不需要认证的命令
async fn execute_unauthenticated_command(command: &str) -> CommandResponse {
    match command {
        // 所有不需要认证的命令在此处理
        _ => CommandResponse {
            success: false,
            message: "未实现的非认证命令".to_string(),
            action: None,
            token_status: None,
        },
    }
} 