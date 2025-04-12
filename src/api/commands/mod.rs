use async_trait::async_trait;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use once_cell::sync::Lazy;

mod help;
mod password;
mod system;
mod echo;
mod enter;
mod token;

// 重新导出所有命令模块
pub use help::HelpCommand;
pub use password::PasswordCommand;
pub use system::SystemCommand;
pub use echo::EchoCommand;
pub use enter::EnterCommand;
pub use token::TokenCommand;

// 命令操作结构体
#[derive(Serialize, Clone)]
pub struct CommandAction {
    pub action_type: String,
    pub target: String,
}

// Token状态信息结构体
#[derive(Serialize, Clone)]
pub struct TokenStatus {
    pub valid: bool,
    pub expired: bool,
    pub expired_for: Option<String>,
}

// 命令响应结构体
#[derive(Serialize, Clone)]
pub struct CommandResponse {
    pub success: bool,
    pub message: String,
    pub action: Option<CommandAction>,
    pub token_status: Option<TokenStatus>,
    pub request_password: Option<String>,
}

// 命令请求上下文，包含请求的所有相关信息
#[allow(dead_code)]
pub struct CommandContext {
    pub command_text: String,
    pub args: Vec<String>,
    pub is_authenticated: bool,
    pub client_ip: Option<String>,
}

// 定义命令特性，所有命令都需要实现此特性
#[async_trait]
pub trait Command: Send + Sync {
    // 命令的主名称
    fn name(&self) -> &'static str;
    
    // 命令的别名列表
    fn aliases(&self) -> Vec<&'static str> {
        Vec::new()
    }
    
    // 命令的描述
    fn description(&self) -> &'static str;
    
    // 命令是否需要认证
    fn needs_auth(&self) -> bool {
        false
    }
    
    // 执行命令的逻辑
    async fn execute(&self, ctx: CommandContext) -> CommandResponse;
}

// 用于存储所有已注册命令的全局容器
pub static COMMANDS: Lazy<Arc<HashMap<String, Arc<dyn Command>>>> = Lazy::new(|| {
    let mut commands = HashMap::new();
    
    // 注册所有命令
    register_command(&mut commands, Arc::new(HelpCommand::new()));
    register_command(&mut commands, Arc::new(PasswordCommand::new()));
    register_command(&mut commands, Arc::new(SystemCommand::new()));
    register_command(&mut commands, Arc::new(EchoCommand::new()));
    register_command(&mut commands, Arc::new(TokenCommand::new()));
    
    // 注册enter命令并保留引用用于特殊别名
    let enter_cmd: Arc<dyn Command> = Arc::new(EnterCommand::new());
    register_command(&mut commands, Arc::clone(&enter_cmd));
    
    // 添加特殊命令处理 - 将home/git/tv/admin作为enter命令的快捷方式
    commands.insert("home".to_string(), Arc::clone(&enter_cmd));
    commands.insert("git".to_string(), Arc::clone(&enter_cmd));
    commands.insert("tv".to_string(), Arc::clone(&enter_cmd));
    commands.insert("admin".to_string(), Arc::clone(&enter_cmd));
    
    Arc::new(commands)
});

// 注册命令及其别名的辅助函数
fn register_command(commands: &mut HashMap<String, Arc<dyn Command>>, command: Arc<dyn Command>) {
    // 注册主命令名称
    commands.insert(command.name().to_string(), Arc::clone(&command));
    
    // 注册所有别名
    for alias in command.aliases() {
        commands.insert(alias.to_string(), Arc::clone(&command));
    }
}

// 解析命令并返回命令名称和参数
pub fn parse_command(command_text: &str) -> (String, Vec<String>) {
    let parts: Vec<&str> = command_text.trim().split_whitespace().collect();
    
    if parts.is_empty() {
        return (String::new(), Vec::new());
    }
    
    let command_name = parts[0].to_lowercase();
    let args = parts[1..].iter().map(|s| s.to_string()).collect();
    
    (command_name, args)
}

// 获取所有已注册的命令，用于help命令
pub fn get_all_commands() -> Vec<Arc<dyn Command>> {
    // 创建一个HashMap来存储已处理的命令名称，避免重复
    let mut processed = HashMap::new();
    
    // 通过遍历COMMANDS来收集所有唯一的命令实例
    COMMANDS.iter().filter_map(|(_, cmd)| {
        let name = cmd.name();
        if !processed.contains_key(name) {
            processed.insert(name, true);
            Some(Arc::clone(cmd))
        } else {
            None
        }
    }).collect()
}

// 创建通用的未知命令响应
pub fn unknown_command_response(command: &str) -> CommandResponse {
    CommandResponse {
        success: false,
        message: format!("未知命令: {}\n输入 help 查看可用命令", command),
        action: None,
        token_status: None,
        request_password: None,
    }
}

// 创建通用的未经授权响应
pub fn unauthorized_response() -> CommandResponse {
    CommandResponse {
        success: false,
        message: "您无权执行此命令".to_string(),
        action: None,
        token_status: None,
        request_password: Some("请输入密码获取访问权限".to_string()),
    }
} 