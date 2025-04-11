document.addEventListener('DOMContentLoaded', () => {
    const typedTextElement = document.getElementById('typed-text');
    const typedSubtitleElement = document.getElementById('typed-subtitle');
    
    // 创建光标元素
    const cursorElement = document.createElement('span');
    cursorElement.className = 'typing-cursor';
    
    // 添加动画相关样式
    const style = document.createElement('style');
    style.textContent = `
        .typing-cursor {
            display: inline-block;
            width: 2px;
            height: 1em;
            background-color: currentColor;
            margin-left: 2px;
            vertical-align: middle;
            animation: blink 1s step-end infinite;
        }
        
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
        }
        
        .typing-container {
            display: inline-block;
        }

        .background-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 25vw;
            font-weight: 900;
            color: rgba(200, 200, 200, 0.08);
            z-index: -1;
            opacity: 0;
            transition: opacity 1.5s ease;
            user-select: none;
            pointer-events: none;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-family: 'Arial Black', Helvetica, sans-serif;
        }
        
        /* 样式1: 倾斜分层效果 */
        .bg-style-1 {
            transform: translate(-50%, -50%) rotate(-5deg);
            text-shadow: 0.03em 0.03em 0 rgba(180, 180, 180, 0.03);
            animation: float1 8s ease-in-out infinite;
        }
        
        .bg-style-1::before,
        .bg-style-1::after {
            content: 'LYCREX';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            z-index: -1;
        }
        
        .bg-style-1::before {
            transform: translateX(-0.05em);
            color: rgba(220, 220, 220, 0.02);
        }
        
        .bg-style-1::after {
            transform: translateX(0.05em) translateY(0.05em);
            color: rgba(180, 180, 180, 0.02);
        }
        
        @keyframes float1 {
            0%, 100% { transform: translate(-50%, -50%) rotate(-5deg); }
            50% { transform: translate(-50%, -52%) rotate(-4deg); }
        }
        
        /* 样式2: 垂直堆叠效果 */
        .bg-style-2 {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            line-height: 0.8;
            transform: translate(-50%, -50%);
            font-size: 20vw;
            text-shadow: 0.02em 0.02em 0.05em rgba(180, 180, 180, 0.04);
            font-weight: 900;
            transition: opacity 1.5s ease;
        }
        
        .bg-style-2::before {
            content: 'LY';
            display: block;
            letter-spacing: 0.2em;
            margin-left: 0.2em;
            color: rgba(200, 200, 200, 0.09);
        }
        
        .bg-style-2::after {
            content: 'CREX';
            display: block;
            letter-spacing: 0.1em;
            margin-left: 0.1em;
            color: rgba(210, 210, 210, 0.07);
        }
        
        /* 样式3: 简约居中效果 */
        .bg-style-3 {
            font-size: 28vw;
            transform: translate(-50%, -50%);
            color: rgba(200, 200, 200, 0.06);
            font-weight: 900;
            letter-spacing: -0.03em;
            transition: opacity 1.8s ease;
        }
        
        /* 样式4: X和LYCRE组合效果 */
        .bg-style-4 {
            position: relative;
            width: 100%;
            height: 100%;
            text-align: center;
            transition: opacity 3.5s ease;
        }

        .bg-style-4 .x-letter {
            position: absolute;
            font-size: 80vw;
            color: rgba(200, 200, 200, 0.04);
            font-weight: 900;
            z-index: -1;
            top: 50%;
            right: -20%;
            transform: translateY(-50%);
            transition: opacity 4s ease;
        }

        .bg-style-4 .lycre-text {
            position: absolute;
            font-size: 20vw;
            color: rgba(180, 180, 180, 0.07);
            font-weight: 900;
            z-index: 1;
            top: 50%;
            left: 40%;
            transform: translate(-50%, -50%);
            transition: opacity 3s ease;
        }
    `;
    document.head.appendChild(style);

    /**
     * 高级打字效果类
     */
    class TypeWriter {
        /**
         * 构造函数
         * @param {HTMLElement} element - 要显示文字的元素
         * @param {Object} options - 配置选项
         */
        constructor(element, options = {}) {
            this.element = element;
            this.cursor = cursorElement;
            this.text = '';
            this.typingSpeed = options.typingSpeed || { min: 60, max: 120 };
            this.deleteSpeed = options.deleteSpeed || { min: 20, max: 60 };
            this.delayAfterWord = options.delayAfterWord || 1500;
            this.delayBeforeDelete = options.delayBeforeDelete || 1000;
            this.currentIndex = 0;
            this.isDeleting = false;
            this.queue = [];
            this.isWaiting = false;
            this.isPaused = false;
            this.waitForEnter = options.waitForEnter || false;
            this.enterCallback = null;
            this.enableUserInput = options.enableUserInput || false;
            this.userInputHandler = null;
            this.userInputText = '';
            this.passwordMode = options.passwordMode || false;
            this.savedPassword = ''; // 存储实际输入的密码
            this.errorMessage = null;
            this.expiryTimer = null;
        }

        /**
         * 获取随机延迟时间
         * @param {number} min - 最小延迟毫秒数
         * @param {number} max - 最大延迟毫秒数
         * @returns {number} 随机延迟时间
         */
        getRandomDelay(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }
        
        /**
         * 添加文本到队列（会被删除）
         * @param {string} text - 要显示的文本
         * @param {Function} callback - 完成后的回调函数
         * @returns {TypeWriter} 链式调用
         */
        addText(text, callback = null) {
            this.queue.push({ 
                text, 
                callback,
                shouldDelete: true
            });
            if (this.queue.length === 1 && !this.isWaiting) {
                this.processQueue();
            }
            return this;
        }
        
        /**
         * 添加永久文本（不会被删除）
         * @param {string} text - 要显示的文本
         * @param {Function} callback - 完成后的回调函数
         * @returns {TypeWriter} 链式调用
         */
        addPermanentText(text, callback = null) {
            this.queue.push({ 
                text, 
                callback,
                shouldDelete: false
            });
            if (this.queue.length === 1 && !this.isWaiting) {
                this.processQueue();
            }
            return this;
        }
        
        /**
         * 处理文本队列
         */
        processQueue() {
            if (this.queue.length === 0 || this.isPaused) {
                this.isWaiting = false;
                return;
            }
            
            this.isWaiting = true;
            const { text, callback, shouldDelete } = this.queue[0];
            this.text = text;
            this.currentIndex = 0;
            this.isDeleting = false;
            
            this.typeStep(shouldDelete, callback);
        }
        
        /**
         * 打字动画步骤
         * @param {boolean} shouldDelete - 是否需要删除文本
         * @param {Function} callback - 完成后的回调函数
         */
        typeStep(shouldDelete = true, callback = null) {
            if (this.isPaused) {
                setTimeout(() => this.typeStep(shouldDelete, callback), 100);
                return;
            }
            
            if (!this.isDeleting && this.currentIndex < this.text.length) {
                // 正在打字
                this.currentIndex++;
                this.updateText();
                
                const delay = this.getRandomDelay(this.typingSpeed.min, this.typingSpeed.max);
                setTimeout(() => this.typeStep(shouldDelete, callback), delay);
                
            } else if (this.isDeleting && this.currentIndex > 0) {
                // 正在删除
                this.currentIndex--;
                this.updateText();
                
                const delay = this.getRandomDelay(this.deleteSpeed.min, this.deleteSpeed.max);
                setTimeout(() => this.typeStep(shouldDelete, callback), delay);
                
                // 如果删除完成，显示背景文字
                if (this.currentIndex === 0 && this.element.id === 'typed-text') {
                    this.showBackgroundText();
                }
                
            } else if (!this.isDeleting && shouldDelete) {
                // 打字完成，等待后开始删除
                if (this.waitForEnter) {
                    // 显示Enter提示
                    const promptElement = document.createElement('div');
                    promptElement.className = 'enter-prompt';
                    promptElement.textContent = '按下Enter继续...';
                    promptElement.style.fontSize = '12px';
                    promptElement.style.marginTop = '5px';
                    promptElement.style.opacity = '0.7';
                    this.element.parentNode.appendChild(promptElement);
                    
                    // 等待Enter按键
                    this.enterCallback = () => {
                        this.element.parentNode.removeChild(promptElement);
                        this.isDeleting = true;
                        this.typeStep(shouldDelete, callback);
                    };
                    
                    document.addEventListener('keydown', this.handleEnterKey);
                } else {
                    setTimeout(() => {
                        this.isDeleting = true;
                        this.typeStep(shouldDelete, callback);
                    }, this.delayBeforeDelete);
                }
            } else {
                // 完成当前队列项
                this.queue.shift();
                
                if (callback) callback();
                
                // 判断是否启用用户输入
                if (this.enableUserInput && this.element.id === 'typed-subtitle' && this.isDeleting) {
                    this.startUserInput();
                } else {
                    // 短暂暂停后进入下一项
                    setTimeout(() => {
                        this.isWaiting = false;
                        this.processQueue();
                    }, this.delayAfterWord);
                }
            }
        }
        
        /**
         * 处理Enter按键事件
         * @param {KeyboardEvent} event - 键盘事件
         */
        handleEnterKey = (event) => {
            if (event.key === 'Enter' && this.enterCallback) {
                event.preventDefault();
                const callback = this.enterCallback;
                this.enterCallback = null;
                document.removeEventListener('keydown', this.handleEnterKey);
                callback();
            }
        }
        
        /**
         * 更新文本显示
         */
        updateText() {
            let currentText;
            
            if (this.userInputHandler) {
                currentText = this.userInputText;
            } else {
                currentText = this.text.substring(0, this.currentIndex);
            }
            
            const formattedText = currentText.replace(/\n/g, '<br>');
            
            this.element.innerHTML = formattedText;
            this.element.appendChild(this.cursor);
        }
        
        /**
         * 暂停打字动画
         * @returns {TypeWriter} 链式调用
         */
        pause() {
            this.isPaused = true;
            return this;
        }
        
        /**
         * 继续打字动画
         * @returns {TypeWriter} 链式调用
         */
        resume() {
            this.isPaused = false;
            return this;
        }

        /**
         * 显示背景文字
         */
        showBackgroundText() {
            // 检查是否已经有背景文字
            if (!document.querySelector('.background-text')) {
                const container = document.querySelector('.typing-section') || document.body;
                const bgTextElement = document.createElement('div');
                bgTextElement.className = 'background-text';
                bgTextElement.style.opacity = '0';
                
                // 随机选择样式
                const styles = ['bg-style-1', 'bg-style-2', 'bg-style-3', 'bg-style-4'];
                const randomStyle = styles[Math.floor(Math.random() * styles.length)];
                bgTextElement.classList.add(randomStyle);
                
                // 根据不同样式设置内容
                if (randomStyle === 'bg-style-2') {
                    // 样式2使用::before和::after伪元素
                    bgTextElement.textContent = '';
                } else if (randomStyle === 'bg-style-4') {
                    // 样式4：创建X和LYCRE两层背景
                    bgTextElement.innerHTML = '';
                    
                    // 创建大X背景
                    const xElement = document.createElement('div');
                    xElement.className = 'x-letter';
                    xElement.textContent = 'X';
                    xElement.style.opacity = '0';
                    bgTextElement.appendChild(xElement);
                    
                    // 创建LYCRE背景
                    const lycreElement = document.createElement('div');
                    lycreElement.className = 'lycre-text';
                    lycreElement.textContent = 'LYCRE';
                    lycreElement.style.opacity = '0';
                    bgTextElement.appendChild(lycreElement);
                } else {
                    // 默认文本内容
                    bgTextElement.textContent = "LYCREX";
                }
                
                container.appendChild(bgTextElement);
                
                // 强制回流并开始动画
                setTimeout(() => {
                    bgTextElement.style.opacity = '1';
                    
                    // 如果是样式4，分别为X和LYCRE设置错开淡入
                    if (randomStyle === 'bg-style-4') {
                        const xElement = bgTextElement.querySelector('.x-letter');
                        const lycreElement = bgTextElement.querySelector('.lycre-text');
                        
                        setTimeout(() => {
                            if (xElement) xElement.style.opacity = '1';
                        }, 100);
                        
                        setTimeout(() => {
                            if (lycreElement) lycreElement.style.opacity = '1';
                        }, 600);
                    }
                }, 10);
            }
        }

        /**
         * 开始用户输入模式
         */
        startUserInput() {
            this.userInputText = this.passwordMode ? '' : '> ';
            this.savedPassword = '';
            this.updateText();
            
            // 添加键盘事件监听
            this.userInputHandler = this.handleUserInput.bind(this);
            document.addEventListener('keydown', this.userInputHandler);
            
            // 提示用户可以输入
            console.log('现在可以输入了...');
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
                        this.showMessage('密码验证成功，已获取访问权限');
                    } else {
                        this.showMessage('验证成功，但未获取令牌');
                    }
                    
                    // 切换到命令模式
                    setTimeout(() => {
                        this.userInputText = '> ';
                        this.updateText();
                        this.passwordMode = false;
                    }, 1500);
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
                
            if (command.toLowerCase() === 'password') {
                // 切换到密码输入模式
                this.passwordMode = true;
                this.userInputText = '';
                this.savedPassword = '';
                this.showMessage('请输入密码:');
                this.updateText();
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
                        
                        // 在短暂延迟后自动切换到密码输入模式
                        setTimeout(() => {
                            this.passwordMode = true;
                            this.userInputText = '';
                            this.savedPassword = '';
                            this.updateText();
                        }, 2000);
                        return;
                    } 
                    // 如果token无效（但非过期），显示普通错误
                    else if (!data.token_status.valid) {
                        // 移除无效token
                        window.sessionStorage.removeItem('userToken');
                        console.log('已移除无效token');
                    }
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
            const baseTextEl = document.createElement('div');
            baseTextEl.textContent = baseMsg;
            baseTextEl.style.marginBottom = '10px';
            messageElement.appendChild(baseTextEl);
            
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
                'version'
            ];
            
            // 检查命令是否在列表中
            const normalizedCommand = command.trim().toLowerCase();
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
                message.split('\n').forEach((line, index, array) => {
                    if (index > 0) {
                        messageElement.appendChild(document.createElement('br'));
                    }
                    
                    // 添加文本行
                    const textNode = document.createTextNode(line);
                    messageElement.appendChild(textNode);
                    
                    // 如果这是过期消息行，使用不同颜色显示
                    if (line.includes('已过期') || line.includes('请重新登录')) {
                        const span = document.createElement('span');
                        span.textContent = line;
                        span.style.color = '#ff9999'; // 使用警告颜色
                        span.style.fontWeight = 'bold';
                        
                        // 替换之前添加的文本节点
                        messageElement.replaceChild(span, textNode);
                    }
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
         * 停止用户输入模式
         */
        stopUserInput() {
            if (this.userInputHandler) {
                document.removeEventListener('keydown', this.userInputHandler);
                this.userInputHandler = null;
            }
        }
    }

    // 初始化打字效果
    typedTextElement.textContent = '';
    typedSubtitleElement.textContent = '';
    
    // 获取数据并开始动画
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            const mainText = data.server.title;
            const subtitleText = data.server.subtitle;
            
            // 创建主标题打字机
            const titleTyper = new TypeWriter(typedTextElement, {
                typingSpeed: { min: 80, max: 150 },
                delayAfterWord: 500
            });
            
            // 创建副标题打字机
            const subtitleTyper = new TypeWriter(typedSubtitleElement, {
                typingSpeed: { min: 60, max: 120 },
                deleteSpeed: { min: 30, max: 80 },
                waitForEnter: true,
                enableUserInput: true,
                passwordMode: false
            });
            
            // 启动动画序列
            setTimeout(() => {
                titleTyper.addText(mainText, () => {
                    subtitleTyper.addText(subtitleText);
                });
            }, 800);
        })
        .catch(error => {
            console.error('获取标题失败:', error);
            const mainText = "LycreX";
            const subtitleText = "> programming for acg";
            
            // 创建主标题打字机
            const titleTyper = new TypeWriter(typedTextElement);
            
            // 创建副标题打字机  
            const subtitleTyper = new TypeWriter(typedSubtitleElement, {
                waitForEnter: true,
                enableUserInput: true,
                passwordMode: false
            });
            
            // 启动动画序列
            setTimeout(() => {
                titleTyper.addText(mainText, () => {
                    subtitleTyper.addText(subtitleText);
                });
            }, 800);
        });
});