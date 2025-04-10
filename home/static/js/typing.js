document.addEventListener('DOMContentLoaded', function() {
    const typedTextElement = document.getElementById('typed-text');
    const typedSubtitleElement = document.getElementById('typed-subtitle');
    const cursorElement = document.createElement('span');
    
    const cursorStyle = {
        textContent: '',
        borderRight: '2px solid currentColor',
        height: '1em',
        marginLeft: '1px',
        display: 'inline-block',
        opacity: '1',
        fontWeight: '100',
        fontSize: '0.9em',
        verticalAlign: 'middle',
        position: 'relative',
        top: '-0.05em',
        transform: 'rotate(90deg) scale(0.5)',
        transformOrigin: 'center',
        animation: 'blink 1s step-end infinite'
    };
    
    Object.assign(cursorElement.style, cursorStyle);

    fetch('/api/status')
        .then(response => response.json())
        .then(data => {
            const mainText = data.server.title;
            const subtitleText = data.server.subtitle;

            let currentElement = typedTextElement;
            let currentText = mainText;
            let index = 0;

            typedSubtitleElement.innerHTML = '&nbsp;';

            function getRandomDelay(min, max) {
                return Math.floor(Math.random() * (max - min + 1) + min);
            }

            function typeText() {
                if (index < currentText.length) {
                    currentElement.textContent = currentText.substring(0, index + 1);
                    index++;
                    currentElement.appendChild(cursorElement);
                    cursorElement.style.animation = 'blink 0.5s step-end infinite';
                    setTimeout(typeText, getRandomDelay(80, 250));
                } else if (currentElement === typedTextElement) {
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
                    cursorElement.style.animation = 'blink 1s step-end infinite';
                }
            }

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
            const mainText = "LycreX";
            const subtitleText = "> programming for acg";
        });
});