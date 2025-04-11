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
    `;
    document.head.appendChild(style);

    // 创建高级打字效果函数
    class TypeWriter {
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
        }

        // 获取随机延迟
        getRandomDelay(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }
        
        // 添加文本到队列
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
        
        // 添加永久文本（不会被删除）
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
        
        // 处理队列
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
            
            // 执行打字动画
            this.typeStep(shouldDelete, callback);
        }
        
        // 打字步骤
        typeStep(shouldDelete = true, callback = null) {
            if (this.isPaused) {
                setTimeout(() => this.typeStep(shouldDelete, callback), 100);
                return;
            }
            
            // 决定是打字还是删除
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
                
                // 短暂暂停后进入下一项
                setTimeout(() => {
                    this.isWaiting = false;
                    this.processQueue();
                }, this.delayAfterWord);
            }
        }
        
        // 处理Enter按键
        handleEnterKey = (event) => {
            if (event.key === 'Enter' && this.enterCallback) {
                event.preventDefault();
                const callback = this.enterCallback;
                this.enterCallback = null;
                document.removeEventListener('keydown', this.handleEnterKey);
                callback();
            }
        }
        
        // 更新文本显示
        updateText() {
            // 获取当前显示的文本内容
            const currentText = this.text.substring(0, this.currentIndex);
            
            // 处理换行符，将文本内容转换为HTML
            const formattedText = currentText.replace(/\n/g, '<br>');
            
            // 使用innerHTML而不是textContent以支持HTML标签
            this.element.innerHTML = formattedText;
            this.element.appendChild(this.cursor);
        }
        
        // 暂停打字
        pause() {
            this.isPaused = true;
            return this;
        }
        
        // 继续打字
        resume() {
            this.isPaused = false;
            return this;
        }

        // 显示背景文字
        showBackgroundText() {
            // 检查是否已经有背景文字
            if (!document.querySelector('.background-text')) {
                const container = document.querySelector('.typing-section') || document.body;
                const bgTextElement = document.createElement('div');
                bgTextElement.className = 'background-text';
                
                // 随机选择样式
                const styles = ['bg-style-1', 'bg-style-2', 'bg-style-3'];
                const randomStyle = styles[Math.floor(Math.random() * styles.length)];
                bgTextElement.classList.add(randomStyle);
                
                // 根据不同样式设置内容
                if (randomStyle === 'bg-style-2') {
                    // 空内容，因为使用了::before和::after
                    bgTextElement.textContent = '';
                } else {
                    // 默认文本内容
                    bgTextElement.textContent = "LYCREX";
                }
                
                container.appendChild(bgTextElement);
                
                // 强制回流并开始动画
                setTimeout(() => {
                    bgTextElement.style.opacity = '1';
                }, 10);
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
                waitForEnter: true
            });
            
            // 启动动画序列
            setTimeout(() => {
                // 添加主标题（需要删除）
                titleTyper.addText(mainText, () => {
                    // 主标题完成后，开始副标题
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
                waitForEnter: true
            });
            
            // 启动动画序列
            setTimeout(() => {
                titleTyper.addText(mainText, () => {
                    subtitleTyper.addText(subtitleText);
                });
            }, 800);
        });
});