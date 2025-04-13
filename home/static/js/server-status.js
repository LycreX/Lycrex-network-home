const servers = [
    {
        name: "Current Server",
        url: "/api/status"
    },
    {
        name: "Hong Kong Server",
        url: "https://hk.lycrex.com/api/status"
    },
    {
        name: "Los Angeles Server",
        url: "https://us.lycrex.com/api/status"
    },
    {
        name: "Japan Server",
        url: "https://jp.lycrex.com/api/status"
    },
    {
        name: "Git & Lfs Server",
        url: "https://git.lycrex.com"
    }
];

async function checkServerConnectivity(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(url, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return true;
    } catch (error) {
        console.error(`连接检查失败: ${url}`, error);
        return false;
    }
}

async function fetchServerStatus(server) {
    try {
        const response = await fetch(server.url, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`服务器 ${server.name} 的响应数据:`, data);

        if (server.url === "/api/status") {
            return {
                name: data.server.name,
                status: data.server.status,
                message: data.server.message
            };
        }
        
        return {
            name: server.name,
            status: data.server?.status || "unknown",
            message: data.server?.message || "无法获取服务器状态"
        };
    } catch (error) {
        console.error(`获取 ${server.name} 状态时出错:`, error);
        
        const isConnected = await checkServerConnectivity(server.url);
        if (isConnected) {
            return {
                name: server.name,
                status: "maintenance",
                message: "服务器可连接，但状态API不可用"
            };
        }
        
        return {
            name: server.name,
            status: "error",
            message: "服务器无法连接"
        };
    }
}

function updateStatusIndicator(elementId, statusData) {
    const statusElement = document.getElementById(elementId);
    const indicator = statusElement.querySelector('.status-indicator');
    
    statusElement.classList.remove('status-running', 'status-error', 'status-maintenance', 'status-other');
    
    if (indicator.blinkInterval) {
        clearInterval(indicator.blinkInterval);
        indicator.blinkInterval = null;
    }
    if (indicator.blinkTimeout) {
        clearTimeout(indicator.blinkTimeout);
        indicator.blinkTimeout = null;
    }
    
    console.log('服务器状态:', statusData.status);
    
    switch (statusData.status) {
        case 'running':
            statusElement.classList.add('status-running');
            setRandomBlinkAnimation(indicator);
            break;
        case 'error':
            statusElement.classList.add('status-error');
            break;
        case 'maintenance':
            statusElement.classList.add('status-maintenance');
            setRandomBlinkAnimation(indicator);
            break;
        default:
            statusElement.classList.add('status-other');
            setRandomBlinkAnimation(indicator);
    }
    
    console.log('应用的类:', statusElement.className);
    indicator.setAttribute('title', statusData.message);
}

function setRandomBlinkAnimation(element) {
    const minInterval = 5000;
    const maxInterval = 15000;
    const blinkDuration = 200;
    
    function blink() {
        const keyframes = [
            { opacity: 1 },
            { opacity: 0.5, offset: 0.5 },
            { opacity: 1 }
        ];
        const options = {
            duration: blinkDuration,
            iterations: 1
        };
        element.animate(keyframes, options);
    }
    
    function scheduleNextBlink() {
        const nextBlinkDelay = Math.random() * (maxInterval - minInterval) + minInterval;
        element.blinkTimeout = setTimeout(() => {
            blink();
            scheduleNextBlink();
        }, nextBlinkDelay);
    }
    
    scheduleNextBlink();
}

async function updateServerStatus() {
    const serverStatusContainer = document.getElementById('server-status');
    
    // 初始化时创建服务器状态元素
    if (serverStatusContainer.children.length === 0) {
        for (const [index, server] of servers.entries()) {
            const serverId = `server-${index}`;
            const serverElement = document.createElement('p');
            serverElement.id = serverId;
            serverElement.innerHTML = `<span class="status-indicator"></span>${server.name}`;
            serverStatusContainer.appendChild(serverElement);
        }

        // 仅在初始化时添加淡入效果
        if (!serverStatusContainer.classList.contains('fade-in')) {
            serverStatusContainer.style.opacity = '0';
            serverStatusContainer.classList.add('fade-in');
            setTimeout(() => {
                serverStatusContainer.style.transition = 'opacity 0.5s ease-in-out';
                serverStatusContainer.style.opacity = '1';
            }, 100);
        }
    }

    // 仅更新状态
    for (const [index, server] of servers.entries()) {
        const serverId = `server-${index}`;
        const statusData = await fetchServerStatus(server);
        updateStatusIndicator(serverId, statusData);
    }
}

setInterval(updateServerStatus, 1800000); // 每 30 分钟 更新一次服务器状态
updateServerStatus();