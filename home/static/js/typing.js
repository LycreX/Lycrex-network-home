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
                
            } else if (!this.isDeleting && shouldDelete) {
                // 打字完成，等待后开始删除
                setTimeout(() => {
                    this.isDeleting = true;
                    this.typeStep(shouldDelete, callback);
                }, this.delayBeforeDelete);
                
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
                deleteSpeed: { min: 30, max: 80 }
            });
            
            // 启动动画序列
            setTimeout(() => {
                // 添加主标题（永久不删除）
                titleTyper.addPermanentText(mainText, () => {
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
            const subtitleTyper = new TypeWriter(typedSubtitleElement);
            
            // 启动动画序列
            setTimeout(() => {
                titleTyper.addPermanentText(mainText, () => {
                    subtitleTyper.addText(subtitleText);
                });
            }, 800);
        });
});