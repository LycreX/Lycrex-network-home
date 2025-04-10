document.addEventListener('DOMContentLoaded', function() {
    const typedTextElement = document.getElementById('typed-text');
    const typedSubtitleElement = document.getElementById('typed-subtitle');
    const cursorElement = document.createElement('span');
    cursorElement.textContent = '';
    cursorElement.style.borderRight = '2px solid currentColor';
    cursorElement.style.height = '1em';
    cursorElement.style.marginLeft = '1px';
    cursorElement.style.display = 'inline-block';
    cursorElement.style.opacity = '1';  // 确保光标一开始就是完全可见的
    cursorElement.style.fontWeight = '100';  // 添加这行来使光标更细
    cursorElement.style.fontSize = '0.9em';  // 添加这行来稍微减小光标大小
    cursorElement.style.verticalAlign = 'middle';  // 添加这行
    cursorElement.style.position = 'relative';     // 添加这行
    cursorElement.style.top = '-0.05em';             // 添加这行

    // 修改：初始化水平光标，准备翻转和缩放动画
    cursorElement.style.transform = 'rotate(90deg) scale(0.5)';
    cursorElement.style.display = 'inline-block';
    cursorElement.style.animation = 'blink 1s step-end infinite';
    cursorElement.style.transformOrigin = 'center';

    // 从 API 获取标题和副标题
    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            const mainText = data.server.title;
            const subtitleText = data.server.subtitle;

            let currentElement = typedTextElement;
            let currentText = mainText;
            let index = 0;

            // 为副标题预留空间
            typedSubtitleElement.innerHTML = '&nbsp;';

            function getRandomDelay(min, max) {
                return Math.floor(Math.random() * (max - min + 1) + min);
            }

            function typeText() {
                if (index < currentText.length) {
                    currentElement.textContent = currentText.substring(0, index + 1);
                    index++;
                    currentElement.appendChild(cursorElement);
                    // 确保光标在打字过程中保持闪烁
                    cursorElement.style.animation = 'blink 0.5s step-end infinite';
                    setTimeout(typeText, getRandomDelay(80, 250));
                } else if (currentElement === typedTextElement) {
                    // 主标题完成，切换到副标题
                    setTimeout(() => {
                        currentElement = typedSubtitleElement;
                        currentText = subtitleText;
                        index = 0;
                        typedTextElement.removeChild(cursorElement);
                        typedSubtitleElement.textContent = '';
                        currentElement.appendChild(cursorElement);
                        typeText();
                    }, 500);
                } else {
                    // 打字结束后继续光标闪烁动画
                    cursorElement.style.animation = 'blink 1s step-end infinite';
                }
            }

            // 修改动画样式
            const style = document.createElement('style');
            style.textContent = `
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
                @keyframes rotateAndScale {
                    0% { transform: rotate(90deg) scale(0.5); }
                    100% { transform: rotate(0deg) scale(1); }
                }
            `;
            document.head.appendChild(style);

            currentElement.appendChild(cursorElement);
            
            // 修改：延迟1.5秒后开始平滑的翻转和缩放动画，动画结束后再等待0.5秒开始打字
            setTimeout(() => {
                cursorElement.style.animation = 'rotateAndScale 0.5s ease-in-out';
                cursorElement.addEventListener('animationend', () => {
                    cursorElement.style.animation = 'blink 1s step-end infinite';
                    cursorElement.style.transform = 'rotate(0deg) scale(1)';
                    setTimeout(typeText, 300);
                }, {once: true});
            }, 1500);
        })
        .catch(error => {
            console.error('获取标题失败:', error);
            // 如果获取失败，使用默认值
            const mainText = "LycreX";
            const subtitleText = "> programming for acg - hk";
            // ... 使用默认值继续执行打字动画 ...
        });
});
