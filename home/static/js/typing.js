document.addEventListener('DOMContentLoaded', () => {
    // 获取DOM元素
    const typedTextElement = document.getElementById('typed-text');
    const typedSubtitleElement = document.getElementById('typed-subtitle');

    // 向页面添加所需样式
    addStyles();

    /**
     * 创建共享光标元素
     */
    const createCursor = () => {
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        return cursor;
    };
    
    const cursorElement = createCursor();

    /**
     * 打字效果类 - 处理文本打字、删除和队列管理
     */
    class TypeWriter {
        /**
         * @param {HTMLElement} element - 目标元素
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
            this.onTypingComplete = options.onTypingComplete || null;
            this.terminal = null;
        }

        /**
         * 获取随机延迟
         */
        getRandomDelay(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        }
        
        /**
         * 添加临时文本（会被删除）
         */
        addText(text, callback = null) {
            this.queue.push({ text, callback, shouldDelete: true });
            this.processQueueIfReady();
            return this;
        }
        
        /**
         * 添加永久文本（不会被删除）
         */
        addPermanentText(text, callback = null) {
            this.queue.push({ text, callback, shouldDelete: false });
            this.processQueueIfReady();
            return this;
        }
        
        /**
         * 条件处理队列
         */
        processQueueIfReady() {
            if (this.queue.length === 1 && !this.isWaiting) {
                this.processQueue();
            }
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
         * 打字动画核心步骤
         */
        typeStep(shouldDelete = true, callback = null) {
            if (this.isPaused) {
                setTimeout(() => this.typeStep(shouldDelete, callback), 100);
                return;
            }
            
            // 打字阶段
            if (!this.isDeleting && this.currentIndex < this.text.length) {
                this.currentIndex++;
                this.updateText();
                
                const delay = this.getRandomDelay(this.typingSpeed.min, this.typingSpeed.max);
                setTimeout(() => this.typeStep(shouldDelete, callback), delay);
            } 
            // 删除阶段
            else if (this.isDeleting && this.currentIndex > 0) {
                this.currentIndex--;
                this.updateText();
                
                const delay = this.getRandomDelay(this.deleteSpeed.min, this.deleteSpeed.max);
                setTimeout(() => this.typeStep(shouldDelete, callback), delay);
                
                // 删除完成后显示背景文字
                if (this.currentIndex === 0 && this.element.id === 'typed-text') {
                    this.showBackgroundText();
                }
            } 
            // 打字完成，等待后开始删除
            else if (!this.isDeleting && shouldDelete) {
                if (this.waitForEnter) {
                    this.showEnterPrompt(shouldDelete, callback);
                } else {
                    setTimeout(() => {
                        this.isDeleting = true;
                        this.typeStep(shouldDelete, callback);
                    }, this.delayBeforeDelete);
                }
            } 
            // 完成当前队列项
            else {
                this.completeQueueItem(callback);
            }
        }
        
        /**
         * 完成当前队列任务
         */
        completeQueueItem(callback) {
            this.queue.shift();
            
            if (callback) callback();
            
            if (this.onTypingComplete && this.element.id === 'typed-subtitle') {
                this.onTypingComplete();
            } else {
                setTimeout(() => {
                    this.isWaiting = false;
                    this.processQueue();
                }, this.delayAfterWord);
            }
        }
        
        /**
         * 显示Enter提示
         */
        showEnterPrompt(shouldDelete, callback) {
            const promptElement = document.createElement('div');
            promptElement.className = 'enter-prompt';
            promptElement.textContent = '按下Enter继续...';
            promptElement.style.cssText = `
                font-size: 12px;
                margin-top: 5px;
                opacity: 0;
                transition: opacity 0.8s ease, transform 0.8s ease;
                transform: translateY(-10px);
            `;
            this.element.parentNode.appendChild(promptElement);
            
            // 强制回流并开始动画
            setTimeout(() => {
                promptElement.style.opacity = '0.7';
                promptElement.style.transform = 'translateY(0)';
            }, 10);

            let promptTimedOut = false;
            
            // 5秒后自动淡出的定时器
            const promptTimeout = setTimeout(() => {
                if (this.enterCallback) {
                    this.fadeOutPrompt(promptElement);
                }
                promptTimedOut = true;
            }, 5000);
            
            // 等待Enter按键
            this.enterCallback = () => {
                clearTimeout(promptTimeout);
                this.fadeOutPrompt(promptElement);
                
                let fadeDelay = promptTimedOut ? 0 : 600;
                setTimeout(() => {
                    if (promptElement.parentNode) {
                        this.element.parentNode.removeChild(promptElement);
                    }
                    this.isDeleting = true;
                    this.typeStep(shouldDelete, callback);
                }, fadeDelay);
            };
            
            document.addEventListener('keydown', this.handleEnterKey);
        }
        
        /**
         * 淡出提示元素
         */
        fadeOutPrompt(element) {
            element.style.opacity = '0';
            element.style.transform = 'translateY(10px)';
        }
        
        /**
         * Enter键处理
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
         * 更新显示文本
         */
        updateText() {
            const currentText = this.text.substring(0, this.currentIndex);
            const formattedText = currentText.replace(/\n/g, '<br>');
            
            this.element.innerHTML = formattedText;
            this.element.appendChild(this.cursor);
        }
        
        /**
         * 暂停动画
         */
        pause() {
            this.isPaused = true;
            return this;
        }
        
        /**
         * 继续动画
         */
        resume() {
            this.isPaused = false;
            return this;
        }

        /**
         * 显示背景文字并应用淡入效果
         */
        showBackgroundText() {
            if (document.querySelector('.background-text')) return;
            
            const container = document.querySelector('.typing-section') || document.body;
            const bgTextElement = document.createElement('div');
            bgTextElement.className = 'background-text';
            bgTextElement.style.opacity = '0';
            
            // 随机选择样式
            const styles = ['bg-style-1', 'bg-style-2', 'bg-style-3', 'bg-style-4', 'bg-style-5'];
            const randomStyle = styles[Math.floor(Math.random() * styles.length)];
            bgTextElement.classList.add(randomStyle);
            
            this.createBackgroundContent(bgTextElement, randomStyle);
            container.appendChild(bgTextElement);
            
            // 根据不同样式应用不同的淡入时间
            const fadeInTimes = {
                'bg-style-1': '1.5s',
                'bg-style-2': '1.8s',
                'bg-style-3': '2s',
                'bg-style-4': '2.5s',
                'bg-style-5': '2.2s'
            };
            
            // 应用淡入动画
            setTimeout(() => {
                bgTextElement.style.transition = `opacity ${fadeInTimes[randomStyle]} ease-in`;
                bgTextElement.style.opacity = '1';
                
                if (randomStyle === 'bg-style-4') {
                    this.animateStyle4Elements(bgTextElement);
                }
            }, 50);
        }
        
        /**
         * 为背景创建内容
         */
        createBackgroundContent(element, style) {
            switch(style) {
                case 'bg-style-2':
                    // 使用::before和::after伪元素
                    element.textContent = '';
                    break;
                    
                case 'bg-style-4':
                    element.innerHTML = '';
                    
                    // X背景
                    const xElement = document.createElement('div');
                    xElement.className = 'x-letter';
                    xElement.textContent = 'X';
                    xElement.style.opacity = '0';
                    
                    // LYCRE背景
                    const lycreElement = document.createElement('div');
                    lycreElement.className = 'lycre-text';
                    lycreElement.textContent = 'LYCRE';
                    lycreElement.style.opacity = '0';
                    
                    element.append(xElement, lycreElement);
                    break;
                    
                case 'bg-style-5':
                    element.innerHTML = '';
                    
                    // 创建滚动行
                    const createScrollingRow = (className) => {
                        const row = document.createElement('div');
                        row.className = className;
                        
                        // 添加重复文本
                        for (let i = 0; i < 10; i++) {
                            const textContainer = document.createElement('span');
                            textContainer.className = 'text-container';
                            textContainer.textContent = 'LYCREX';
                            row.appendChild(textContainer);
                        }
                        
                        return row;
                    };
                    
                    const topRow = createScrollingRow('top-row');
                    const bottomRow = createScrollingRow('bottom-row');
                    
                    element.append(topRow, bottomRow);
                    break;
                    
                default:
                    element.textContent = "LYCREX";
            }
        }
        
        /**
         * 为样式4元素添加动画
         */
        animateStyle4Elements(container) {
            const xElement = container.querySelector('.x-letter');
            const lycreElement = container.querySelector('.lycre-text');
            
            if (xElement) {
                setTimeout(() => xElement.style.opacity = '1', 100);
            }
            
            if (lycreElement) {
                setTimeout(() => lycreElement.style.opacity = '1', 600);
            }
        }

        /**
         * 连接终端实例
         */
        connectTerminal(terminal) {
            this.terminal = terminal;
            return this;
        }
    }

    /**
     * 初始化动画
     */
    const initAnimation = (mainText, subtitleText) => {
        // 创建终端实例（假设Terminal类已定义）
        const terminal = new Terminal(typedSubtitleElement, {
            cursor: cursorElement
        });
        
        // 创建主标题打字机
        const titleTyper = new TypeWriter(typedTextElement, {
            typingSpeed: { min: 80, max: 150 },
            delayAfterWord: 500
        });
        
        // 创建副标题打字机
        const subtitleTyper = new TypeWriter(typedSubtitleElement, {
            typingSpeed: { min: 60, max: 100 },
            deleteSpeed: { min: 10, max: 25 },
            waitForEnter: true,
            onTypingComplete: () => setTimeout(() => terminal.init(), 500)
        });
        
        // 连接终端
        subtitleTyper.connectTerminal(terminal);
        
        // 启动动画序列
        setTimeout(() => {
            titleTyper.addText(mainText, () => {
                subtitleTyper.addText(subtitleText);
            });
        }, 800);
    };

    // 清空初始文本
    typedTextElement.textContent = '';
    typedSubtitleElement.textContent = '';
    
    // 获取数据并开始动画
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            initAnimation(data.server.title, data.server.subtitle);
        })
        .catch(error => {
            console.error('获取标题失败:', error);
            initAnimation("LycreX", "> programming for acg");
        });
    
    /**
     * 添加所需样式
     */
    function addStyles() {
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

            /* 样式5: 双排律动效果 */
            .bg-style-5 {
                position: relative;
                width: 100%;
                height: 100%;
                overflow: hidden;
                transition: opacity 2s ease;
            }

            .bg-style-5 .top-row, 
            .bg-style-5 .bottom-row {
                position: absolute;
                width: 300%;
                white-space: nowrap;
                font-size: 22vw;
                font-weight: 900;
                letter-spacing: -0.03em;
                left: 0;
            }

            .bg-style-5 .top-row {
                top: 28%;
                transform: translateY(-50%);
                color: rgba(200, 200, 200, 0.05);
                animation: slideLeft 30s linear infinite;
            }

            .bg-style-5 .bottom-row {
                top: 70%;
                transform: translateY(-50%);
                color: rgba(200, 200, 200, 0.04);
                animation: slideRight 30s linear infinite;
            }

            .bg-style-5 .text-container {
                display: inline-block;
                margin-right: 2vw;
            }

            @keyframes slideLeft {
                0% { transform: translateY(-50%) translateX(0); }
                100% { transform: translateY(-50%) translateX(-50%); }
            }

            @keyframes slideRight {
                0% { transform: translateY(-50%) translateX(-50%); }
                100% { transform: translateY(-50%) translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }
});