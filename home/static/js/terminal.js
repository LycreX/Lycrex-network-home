/**
 * 终端控制类
 * 处理命令输入、处理和响应
 */
class Terminal {
    /**
     * 构造函数
     * @param {HTMLElement} element - 显示终端的元素 
     * @param {Object} options - 配置选项
     */
    constructor(element, options = {}) {
        this.element = element;
        this.cursor = options.cursor || this.createCursor();
        this.passwordMode = options.passwordMode || false;
        this.userInputText = '> ';
        this.savedPassword = '';
        this.errorMessage = null;
        this.expiryTimer = null;
        this.userInputHandler = null;
    }

    /**
     * 创建光标元素
     * @returns {HTMLElement} 光标元素
     */
    createCursor() {
        const cursorElement = document.createElement('span');
        cursorElement.className = 'typing-cursor';
        return cursorElement;
    }

    /**
     * 初始化终端
     */
    init() {
        this.updateText();
        // 添加键盘事件监听
        this.userInputHandler = this.handleUserInput.bind(this);
        document.addEventListener('keydown', this.userInputHandler);
    }

    /**
     * 更新文本显示
     */
    updateText() {
        let currentText = this.userInputText;
        
        const formattedText = currentText.replace(/\n/g, '<br>');
        
        this.element.innerHTML = formattedText;
        this.element.appendChild(this.cursor);
    }

    /**
     * 处理用户输入
     * @param {KeyboardEvent} event - 键盘事件
     */
    handleUserInput = (event) => {
        // 处理退格键
        if (event.key === 'Backspace') {
            if ((this.passwordMode && this.savedPassword.length > 0) || 
                (!this.passwordMode && this.userInputText.length > 2)) {
                if (this.passwordMode) {
                    this.savedPassword = this.savedPassword.slice(0, -1);
                    this.userInputText = '•'.repeat(this.savedPassword.length);
                } else {
                    this.userInputText = this.userInputText.slice(0, -1);
                }
                this.updateText();
            }
            return;
        }
        
        // 处理回车键
        if (event.key === 'Enter') {
            // 在输入新命令前清除之前的消息
            if (this.errorMessage && !this.passwordMode) {
                this.removeMessage();
            }
            
            // 保存命令内容以备后用
            const commandContent = this.userInputText;
            const savedPassword = this.passwordMode ? this.savedPassword : '';
            
            // 立即清空输入框
            if (this.passwordMode) {
                this.userInputText = '';
                this.savedPassword = '';
                this.updateText();
            } else {
                this.userInputText = '> ';
                this.updateText();
            }
            
            // 处理密码验证或命令
            if (this.passwordMode) {
                this.validatePassword(savedPassword);
            } else {
                // 使用之前保存的命令内容处理命令
                this.processCommand(commandContent);
            }
            return;
        }
        
        // 忽略控制键
        if (event.ctrlKey || event.altKey || event.metaKey || 
            ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(event.key)) {
            return;
        }
        
        // 添加字符到输入文本
        if (event.key.length === 1) {
            if (this.passwordMode) {
                this.savedPassword += event.key;
                this.userInputText = '•'.repeat(this.savedPassword.length);
            } else {
                this.userInputText += event.key;
            }
            this.updateText();
        }
    }

    /**
     * 验证密码
     */
    validatePassword(password) {
        // 显示验证中消息
        this.showMessage('正在验证...');
        
        // 调用 API 验证密码
        fetch('/api/authenticate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 验证成功，保存密码
                window.sessionStorage.setItem('userPassword', password);
                
                // 如果有token，也保存token
                if (data.token) {
                    window.sessionStorage.setItem('userToken', data.token);
                    
                    // 直接显示服务器返回的格式化消息，包含token和过期时间
                    this.showMessage(data.message || '密码验证成功，已获取访问权限');
                } else {
                    this.showMessage('验证成功，但未获取令牌');
                }
                
                // 切换到命令模式
                setTimeout(() => {
                    this.userInputText = '> ';
                    this.updateText();
                    this.passwordMode = false;
                }, 1000);
            } else {
                // 验证失败，确保清除任何可能存在的token
                window.sessionStorage.removeItem('userToken');
                
                // 显示错误消息
                this.showMessage(data.message || '密码错误，请重试');
                setTimeout(() => {
                    this.removeMessage();
                }, 1500);
            }
        })
        .catch(error => {
            console.error('验证请求失败:', error);
            // 处理请求失败
            this.showMessage('验证失败，无法连接服务器');
            setTimeout(() => {
                this.removeMessage();
            }, 1500);
        });
    }

    /**
     * 处理命令
     * @param {string} commandInput - 可选的命令文本，如果不提供则使用当前输入框内容
     */
    processCommand(commandInput) {
        const command = commandInput ? 
            (commandInput.startsWith('> ') ? commandInput.substring(2) : commandInput) : 
            (this.userInputText.startsWith('> ') ? this.userInputText.substring(2) : this.userInputText);
            
        // 处理空命令
        if (command.trim() === '') {
            this.showMessage("请输入命令");
            return;
        }
        
        // 从会话存储中获取密码和令牌
        const password = window.sessionStorage.getItem('userPassword') || '';
        const token = window.sessionStorage.getItem('userToken') || '';
        
        // 准备请求数据
        const requestData = { command: command };
        
        // 只有在有效时才添加密码
        if (password && password.trim() !== '') {
            requestData.password = password;
        }
        
        // 构建请求头
        const headers = {
            'Content-Type': 'application/json'
        };
        
        // 检查token是否有效，如果有效则添加到Authorization头
        if (token && token.trim() !== '') {
            headers['Authorization'] = `Bearer ${token}`;
            // 输出调试信息
            console.log('使用令牌:', token);
        } else {
            console.log('无有效令牌');
        }
        
        // 发送命令到API
        fetch('/api/command', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData),
        })
        .then(response => response.json())
        .then(data => {
            // 处理可能的token状态信息
            if (data.token_status) {
                // 如果token已过期，显示过期信息并提示重新登录
                if (data.token_status.expired && data.token_status.expired_for) {
                    // 解析原始过期时间
                    const expiredFor = data.token_status.expired_for;
                    const expiredTimeParts = this.parseExpiredTimeString(expiredFor);
                    
                    // 构建初始消息
                    const baseMsg = data.message;
                    const initialExpiredMsg = `您的认证令牌已过期 ${expiredFor}，请重新登录`;
                    
                    // 显示初始消息
                    this.showTokenExpiryMessage(baseMsg, initialExpiredMsg, expiredTimeParts);
                    
                    // 移除过期的token
                    window.sessionStorage.removeItem('userToken');
                    console.log('已移除过期token');
                    
                    // 不再自动切换到密码输入模式
                    return;
                } 
                // 如果token无效（但非过期），显示普通错误
                else if (!data.token_status.valid) {
                    // 移除无效token
                    window.sessionStorage.removeItem('userToken');
                    console.log('已移除无效token');
                }
            }
            
            // 检查服务器是否请求输入密码
            if (data.request_password) {
                // 切换到密码输入模式
                this.passwordMode = true;
                this.userInputText = '';
                this.savedPassword = '';
                // 显示服务器提供的密码请求消息
                this.showMessage(data.request_password);
                this.updateText();
                return;
            }
            
            // 正常显示消息
            this.showMessage(data.message);
            
            // 判断是否是需要持久显示结果的命令
            const isPersistentCommand = this.isPersistentResultCommand(command);
            
            // 如果有动作要执行
            if (data.action) {
                setTimeout(() => {
                    if (data.action.action_type === 'redirect') {
                        window.location.href = data.action.target;
                    }
                }, 1000);
            }
        })
        .catch(error => {
            console.error('命令处理失败:', error);
            this.showMessage('命令处理失败，请重试');
        });
    }

    /**
     * 解析过期时间字符串
     * @param {string} timeString - 过期时间字符串，如"2小时15分30秒"
     * @returns {object} 包含小时、分钟和秒的对象
     */
    parseExpiredTimeString(timeString) {
        const result = { hours: 0, minutes: 0, seconds: 0 };
        
        // 提取小时
        const hourMatch = timeString.match(/(\d+)小时/);
        if (hourMatch) {
            result.hours = parseInt(hourMatch[1], 10);
        }
        
        // 提取分钟
        const minMatch = timeString.match(/(\d+)分/);
        if (minMatch) {
            result.minutes = parseInt(minMatch[1], 10);
        }
        
        // 提取秒
        const secMatch = timeString.match(/(\d+)秒/);
        if (secMatch) {
            result.seconds = parseInt(secMatch[1], 10);
        }
        
        return result;
    }
    
    /**
     * 显示带实时更新的token过期消息
     * @param {string} baseMsg - 基础消息
     * @param {string} expiredMsg - 初始过期消息
     * @param {object} expiredTime - 包含过期时间的对象
     */
    showTokenExpiryMessage(baseMsg, expiredMsg, expiredTime) {
        // 移除旧消息
        this.removeMessage();
        
        // 创建新消息元素
        const messageElement = document.createElement('div');
        messageElement.className = 'command-message';
        
        // 创建基础消息部分
        if (baseMsg) {
            const baseTextLines = baseMsg.split('\n');
            baseTextLines.forEach((line, index) => {
                if (index > 0) {
                    messageElement.appendChild(document.createElement('br'));
                }
                const baseTextEl = document.createElement('div');
                baseTextEl.textContent = line;
                messageElement.appendChild(baseTextEl);
            });
            
            // 添加间距
            messageElement.appendChild(document.createElement('br'));
        }
        
        // 创建过期消息部分（将被动态更新）
        const expiredTextEl = document.createElement('div');
        expiredTextEl.style.color = '#ff9999';
        expiredTextEl.style.fontWeight = 'bold';
        messageElement.appendChild(expiredTextEl);
        
        // 更新过期文本的初始内容
        expiredTextEl.textContent = expiredMsg;
        
        // 设置基本样式
        messageElement.style.fontSize = '12px';
        messageElement.style.marginTop = '10px';
        messageElement.style.color = '#aaa';
        
        // 保存消息元素引用
        this.errorMessage = messageElement;
        
        // 添加到DOM
        this.element.parentNode.appendChild(messageElement);
        
        // 创建计时器来更新过期时间
        const startTime = Date.now();
        const initialTotalSeconds = expiredTime.hours * 3600 + expiredTime.minutes * 60 + expiredTime.seconds;
        
        // 创建并保存计时器引用
        this.expiryTimer = setInterval(() => {
            // 计算经过的时间（秒）
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            const totalSeconds = initialTotalSeconds + elapsedSeconds;
            
            // 计算新的小时、分钟和秒
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            // 创建新的时间字符串
            let timeString = '';
            if (hours > 0) {
                timeString += `${hours}小时`;
            }
            if (minutes > 0 || hours > 0) {
                timeString += `${minutes}分`;
            }
            timeString += `${seconds}秒`;
            
            // 更新文本
            expiredTextEl.textContent = `您的认证令牌已过期 ${timeString}，请重新登录`;
        }, 1000);
    }
    
    /**
     * 判断命令是否需要持久显示结果
     * @param {string} command - 命令文本
     * @returns {boolean} 是否需要持久显示结果
     */
    isPersistentResultCommand(command) {
        // 定义需要持久显示结果的命令列表
        const persistentCommands = [
            'help',
            'system',
            'status',
            'ls',
            'list',
            'info',
            'version',
            'token',
            'tokens',
            't'
        ];
        
        // 检查命令是否在列表中
        const normalizedCommand = command.trim().toLowerCase();
        
        // 处理enter命令
        if (normalizedCommand.startsWith('enter ')) {
            // enter命令通常会导致页面跳转，不需要持久显示
            return false;
        }
        
        return persistentCommands.some(cmd => 
            normalizedCommand === cmd || normalizedCommand.startsWith(`${cmd} `)
        );
    }
    
    /**
     * 显示消息
     * @param {string} message - 要显示的消息
     */
    showMessage(message) {
        // 清除之前可能存在的计时器
        if (this.expiryTimer) {
            clearInterval(this.expiryTimer);
            this.expiryTimer = null;
        }
        
        // 移除旧消息
        this.removeMessage();
        
        // 创建新消息元素
        const messageElement = document.createElement('div');
        messageElement.className = 'command-message';
        
        // 处理可能包含换行符的消息
        if (message.includes('\n')) {
            // 将换行符替换为HTML换行
            message.split('\n').forEach((line, index) => {
                if (index > 0) {
                    messageElement.appendChild(document.createElement('br'));
                }
                
                // 为每行单独创建一个文本元素，以便应用特殊样式
                const lineElement = document.createElement('div');
                lineElement.textContent = line;
                
                // 根据内容应用特殊样式
                if (line.includes('已过期') || line.includes('请重新登录')) {
                    lineElement.style.color = '#ff9999'; // 警告颜色
                    lineElement.style.fontWeight = 'bold';
                } else if (line.includes('令牌:')) {
                    lineElement.style.color = '#88cc88'; // 成功颜色
                    lineElement.style.fontWeight = 'bold';
                } else if (line.includes('过期时间:')) {
                    lineElement.style.color = '#88aaff'; // 信息颜色
                }
                
                messageElement.appendChild(lineElement);
            });
        } else {
            messageElement.textContent = message;
        }
        
        // 设置基本样式
        messageElement.style.fontSize = '12px';
        messageElement.style.marginTop = '10px';
        messageElement.style.color = '#aaa';
        
        // 保存消息元素引用
        this.errorMessage = messageElement;
        
        // 添加到DOM
        this.element.parentNode.appendChild(messageElement);
    }
    
    /**
     * 移除消息
     */
    removeMessage() {
        // 清除之前可能存在的计时器
        if (this.expiryTimer) {
            clearInterval(this.expiryTimer);
            this.expiryTimer = null;
        }
        
        // 移除消息元素
        if (this.errorMessage && this.errorMessage.parentNode) {
            this.errorMessage.parentNode.removeChild(this.errorMessage);
            this.errorMessage = null;
        }
    }
    
    /**
     * 停止终端
     */
    stop() {
        if (this.userInputHandler) {
            document.removeEventListener('keydown', this.userInputHandler);
            this.userInputHandler = null;
        }
    }
}
