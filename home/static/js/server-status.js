// 服务器配置
const servers = [
    {
        name: "Current Server",
        url: "/api/status",
        showLatency: true
    },
    {
        name: "Hong Kong Server",
        url: "https://hk.lycrex.com/api/status",
        showLatency: true
    },
    {
        name: "Los Angeles Server",
        url: "https://us.lycrex.com/api/status",
        showLatency: true
    },
    {
        name: "Japan Server",
        url: "https://jp.lycrex.com/api/status",
        showLatency: true
    },
    {
        name: "Git & Lfs Server",
        url: "https://git.lycrex.com",
        showLatency: true
    }
];

// 全局配置
const config = {
    enableLatency: false,        // 是否启用延迟显示
    updateInterval: 1000 * 60 * 30,     // 状态更新间隔(毫秒)
    requestTimeout: 1000 * 5,        // 请求超时时间(毫秒)
    latencyThresholds: {
        excellent: 50,           // 极佳延迟阈值(毫秒)
        good: 100,               // 良好延迟阈值
        average: 200,            // 一般延迟阈值
        poor: 400,               // 较差延迟阈值
        bad: 1000                // 很差延迟阈值
    },
    blinkAnimation: {
        minInterval: 5000,       // 指示灯闪烁最小间隔(毫秒)
        maxInterval: 15000,      // 指示灯闪烁最大间隔
        duration: 200            // 闪烁动画持续时间
    }
};

// 服务器状态管理类
class ServerStatusManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = null;
        this.styleElement = null;
    }

    // 初始化状态管理器
    async initialize() {
        // 初始化DOM容器
        this.container = this.initContainer();
        if (!this.container) return;
        
        // 添加样式
        this.addStyles();
        
        // 创建服务器状态元素
        this.createServerElements();
        
        // 获取初始状态(不包含延迟)
        await this.fetchInitialStatus();
        
        // 显示容器
        this.showContainer();
        
        // 如果启用延迟，延迟加载延迟信息
        if (config.enableLatency) {
            setTimeout(() => this.fetchLatencyData(), 5000);
        }
        
        // 设置定期更新
        setInterval(() => this.updateAllServers(), config.updateInterval);
    }
    
    // 初始化容器
    initContainer() {
        const container = document.getElementById(this.containerId);
        if (!container) return null;
        
        // 初始隐藏容器
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.5s ease-in-out';
        
        return container;
    }
    
    // 添加FadeIn CSS
    addStyles() {
        if (document.getElementById('server-status-styles')) return;
        
        this.styleElement = document.createElement('style');
        this.styleElement.id = 'server-status-styles';
        this.styleElement.textContent = `
            #${this.containerId} {
                transition: opacity 0.5s ease-in-out;
            }
            .server-latency {
                transition: opacity 0.5s ease-in-out;
                opacity: 1;
            }
            .latency-hidden {
                opacity: 0 !important;
            }
            .latency-visible {
                opacity: 1 !important;
            }
        `;
        document.head.appendChild(this.styleElement);
    }
    
    // 创建服务器状态元素
    createServerElements() {
        servers.forEach((server, index) => {
            const serverId = `server-${index}`;
            const serverElement = document.createElement('p');
            serverElement.id = serverId;
            serverElement.innerHTML = `
                <span class="status-indicator"></span>
                <span class="server-name">${server.name}</span>
                <span class="server-latency latency-hidden"></span>
            `;
            this.container.appendChild(serverElement);
        });
    }
    
    // 获取初始状态
    async fetchInitialStatus() {
        const promises = servers.map((server, index) => {
            return this.fetchServerStatus(server, true)
                .then(statusData => {
                    this.updateUI(`server-${index}`, statusData, false);
                });
        });
        
        await Promise.all(promises);
    }
    
    // 显示容器
    showContainer() {
        this.container.style.opacity = '1';
    }
    
    // 获取延迟数据
    async fetchLatencyData() {
        // 确保所有延迟元素隐藏
        this.setLatencyVisibility(false);
        
        // 获取状态和延迟
        const promises = servers.map((server, index) => {
            const skipLatency = !this.shouldShowLatency(server);
            return this.fetchServerStatus(server, skipLatency)
                .then(statusData => {
                    this.updateUI(`server-${index}`, statusData, this.shouldShowLatency(server));
                });
        });
        
        await Promise.all(promises);
        
        // 显示延迟信息
        setTimeout(() => this.setLatencyVisibility(true), 50);
    }
    
    // 检查是否应该显示服务器延迟
    shouldShowLatency(server) {
        return config.enableLatency && server.showLatency !== false;
    }
    
    // 设置延迟元素的可见性
    setLatencyVisibility(visible) {
        const elements = document.querySelectorAll('.server-latency');
        elements.forEach(el => {
            if (visible) {
                el.classList.remove('latency-hidden');
                el.classList.add('latency-visible');
            } else {
                el.classList.remove('latency-visible');
                el.classList.add('latency-hidden');
            }
        });
    }
    
    // 更新所有服务器状态
    async updateAllServers() {
        if (config.enableLatency) {
            this.setLatencyVisibility(false);
        }
        
        const promises = servers.map((server, index) => {
            const skipLatency = !this.shouldShowLatency(server);
            return this.fetchServerStatus(server, skipLatency)
                .then(statusData => {
                    this.updateUI(`server-${index}`, statusData, this.shouldShowLatency(server));
                });
        });
        
        await Promise.all(promises);
        
        if (config.enableLatency) {
            setTimeout(() => this.setLatencyVisibility(true), 50);
        }
    }
    
    // 获取服务器状态
    async fetchServerStatus(server, skipLatency = false) {
        try {
            let startTime = null;
            let latency = null;
            
            if (!skipLatency) {
                startTime = performance.now();
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);
            
            const response = await fetch(server.url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            
            clearTimeout(timeoutId);
            
            if (!skipLatency && startTime) {
                latency = Math.round(performance.now() - startTime);
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (server.url === "/api/status") {
                return {
                    name: data.server.name,
                    status: data.server.status,
                    message: data.server.message,
                    latency,
                    showLatency: server.showLatency
                };
            }
            
            return {
                name: server.name,
                status: data.server?.status || "unknown",
                message: data.server?.message || "无法获取服务器状态",
                latency,
                showLatency: server.showLatency
            };
        } catch (error) {
            // 检查连接性
            const connectivityResult = await this.checkConnectivity(server.url, skipLatency);
            
            return {
                name: server.name,
                status: connectivityResult.connected ? "maintenance" : "error",
                message: connectivityResult.connected ? "服务器可连接，但状态API不可用" : "服务器无法连接",
                latency: connectivityResult.latency,
                showLatency: server.showLatency
            };
        }
    }
    
    // 检查服务器连接性
    async checkConnectivity(url, skipLatency) {
        try {
            let startTime = skipLatency ? null : performance.now();
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.requestTimeout);
            
            await fetch(url, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const latency = startTime ? Math.round(performance.now() - startTime) : null;
            return { connected: true, latency };
        } catch {
            return { connected: false, latency: null };
        }
    }
    
    // 更新UI
    updateUI(elementId, statusData, showLatency) {
        const statusElement = document.getElementById(elementId);
        if (!statusElement) return;
        
        const indicator = statusElement.querySelector('.status-indicator');
        if (!indicator) return;
        
        // 清除现有状态类和动画
        this.clearStatusClasses(statusElement);
        this.clearAnimations(indicator);
        
        // 设置新状态类
        this.setStatusClass(statusElement, statusData.status);
        
        // 根据状态设置动画
        if (statusData.status !== 'error') {
            this.setBlinkAnimation(indicator);
        }
        
        // 更新提示文本
        let message = statusData.message;
        const shouldDisplayLatency = showLatency && statusData.showLatency && 
                                      config.enableLatency && statusData.latency !== null;
        
        if (shouldDisplayLatency) {
            message += ` (${statusData.latency} ms)`;
        }
        indicator.setAttribute('title', message);
        
        // 更新延迟显示
        this.updateLatencyDisplay(statusElement, statusData, shouldDisplayLatency);
    }
    
    // 清除状态类
    clearStatusClasses(element) {
        element.classList.remove(
            'status-running', 
            'status-error', 
            'status-maintenance', 
            'status-other'
        );
    }
    
    // 设置状态类
    setStatusClass(element, status) {
        switch (status) {
            case 'running':
                element.classList.add('status-running');
                break;
            case 'error':
                element.classList.add('status-error');
                break;
            case 'maintenance':
                element.classList.add('status-maintenance');
                break;
            default:
                element.classList.add('status-other');
        }
    }
    
    // 清除动画
    clearAnimations(element) {
        if (element.blinkTimeout) {
            clearTimeout(element.blinkTimeout);
            element.blinkTimeout = null;
        }
    }
    
    // 设置闪烁动画
    setBlinkAnimation(element) {
        const { minInterval, maxInterval, duration } = config.blinkAnimation;
        
        const blink = () => {
            element.animate([
                { opacity: 1 },
                { opacity: 0.5, offset: 0.5 },
                { opacity: 1 }
            ], { duration, iterations: 1 });
        };
        
        const scheduleNext = () => {
            const delay = Math.random() * (maxInterval - minInterval) + minInterval;
            element.blinkTimeout = setTimeout(() => {
                blink();
                scheduleNext();
            }, delay);
        };
        
        scheduleNext();
    }
    
    // 更新延迟显示
    updateLatencyDisplay(statusElement, statusData, showLatency) {
        let latencyElement = statusElement.querySelector('.server-latency');
        
        if (!latencyElement) {
            latencyElement = document.createElement('span');
            latencyElement.className = 'server-latency latency-hidden';
            statusElement.appendChild(latencyElement);
        }
        
        // 移除延迟相关类
        this.clearLatencyClasses(latencyElement);
        
        // 更新延迟显示
        if (showLatency && statusData.latency !== null) {
            latencyElement.textContent = ` ${statusData.latency} ms`;
            this.setLatencyClass(latencyElement, statusData.latency);
        } else {
            latencyElement.textContent = '';
        }
    }
    
    // 清除延迟类
    clearLatencyClasses(element) {
        element.classList.remove(
            'latency-excellent', 
            'latency-good', 
            'latency-average', 
            'latency-poor', 
            'latency-bad', 
            'latency-timeout'
        );
    }
    
    // 设置延迟类
    setLatencyClass(element, latency) {
        const { excellent, good, average, poor, bad } = config.latencyThresholds;
        
        if (latency < excellent) {
            element.classList.add('latency-excellent');
        } else if (latency < good) {
            element.classList.add('latency-good');
        } else if (latency < average) {
            element.classList.add('latency-average');
        } else if (latency < poor) {
            element.classList.add('latency-poor');
        } else if (latency < bad) {
            element.classList.add('latency-bad');
        } else {
            element.classList.add('latency-timeout');
        }
    }
}

// 初始化服务器状态管理器
document.addEventListener('DOMContentLoaded', () => {
    const statusManager = new ServerStatusManager('server-status');
    statusManager.initialize();
});
