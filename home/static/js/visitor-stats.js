// 存储用户访问信息的全局变量
let visitorData = {
    ipAddress: '',
    visits: 0,
    reported: false
};

// 只在页面加载时执行一次的上报访问函数
async function reportVisitOnce() {
    try {
        // 获取访问者IP和地理信息
        const visitorInfo = await getVisitorInfo();
        visitorData.ipAddress = visitorInfo.ipAddress;
        
        // 上报访问信息
        const reportResponse = await reportVisit(visitorInfo);
        
        if (reportResponse.success) {
            visitorData.visits = reportResponse.visits;
            visitorData.reported = true;
        }
    } catch (error) {
        console.error('Failed to report visitor data:', error);
    }
}

// Fetch and display visitor statistics
async function fetchVisitorStats() {
    try {
        // 测量ping延迟
        const pingLatency = await measurePingLatency();
        
        const statusResponse = await fetch('/api/status');
        const statusData = await statusResponse.json();
        
        // Check if configuration and visitor stats exist
        if (!statusData.visitor_stats || 
            !statusData.server || 
            !statusData.server.show_visitor_stats || 
            !statusData.server.show_visitor_stats.enabled) {
            return;
        }
        
        const showTotal = statusData.server.show_visitor_stats.show_total_visits;
        const showUnique = statusData.server.show_visitor_stats.show_unique_ips;
        const showPersonal = statusData.server.show_visitor_stats.show_personal_visits;
        
        // If nothing to display, return
        if (!showTotal && !showUnique && !showPersonal) {
            return;
        }
        
        // Create visitor stats element
        const visitorStatsElement = document.getElementById('visitor-stats');
        if (!visitorStatsElement) {
            return;
        }
        
        let statsHtml = '';
        let hasContent = false;
        
        if (showTotal) {
            statsHtml += `<span>Total Visits: ${statusData.visitor_stats.total_visits}</span>`;
            hasContent = true;
        }
        
        if (showUnique) {
            if (hasContent) statsHtml += ' | ';
            statsHtml += `<span>Unique IPs: ${statusData.visitor_stats.unique_ips}</span>`;
            hasContent = true;
        }
        
        // 显示个人访问次数（如果配置允许）
        if (showPersonal) {
            if (hasContent) statsHtml += ' | ';
            
            if (visitorData.reported) {
                // 使用已上报的数据
                statsHtml += `<span>You(${visitorData.ipAddress}) visited: ${visitorData.visits} times</span>`;
            } else {
                statsHtml += `<span>Visit statistics loading...</span>`;
            }
        }
        
        // Add server latency display
        if (hasContent) statsHtml += ' | ';
        statsHtml += `<span>${pingLatency} ms</span>`;
        
        visitorStatsElement.innerHTML = statsHtml;
        visitorStatsElement.style.display = 'block';
    } catch (error) {
        console.error('Failed to fetch visitor statistics:', error);
    }
}

// 页面加载后执行的初始化函数
async function initializeVisitorStats() {
    // 首先上报访问信息（仅执行一次）
    await reportVisitOnce();
    
    // 然后获取并显示统计信息
    await fetchVisitorStats();
    
    // 设置定时刷新统计信息（不再包含上报功能）
    setInterval(fetchVisitorStats, 60000);
}

// 页面加载后执行初始化
document.addEventListener('DOMContentLoaded', initializeVisitorStats);

// get visitor IP address and geo information
async function getVisitorInfo() {
    try {
        const response = await fetch('https://api.db-ip.com/v2/free/self');
        const data = await response.json();
        
        // 返回完整的地理位置信息
        return {
            ipAddress: data.ipAddress,
            continentCode: data.continentCode,
            continentName: data.continentName,
            countryCode: data.countryCode,
            countryName: data.countryName,
            stateProv: data.stateProv,
            city: data.city
        };
    } catch (error) {
        console.error('Failed to get visitor info:', error);
        // 返回默认值，仅包含IP地址
        const randomIP = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        return { ipAddress: randomIP };
    }
}

// report visit information with geo data
async function reportVisit(visitorInfo) {
    try {
        const response = await fetch('/api/report-visitor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ip: visitorInfo.ipAddress,
                continent_code: visitorInfo.continentCode,
                continent_name: visitorInfo.continentName,
                country_code: visitorInfo.countryCode,
                country_name: visitorInfo.countryName,
                state_prov: visitorInfo.stateProv,
                city: visitorInfo.city
            }),
        });
        
        return await response.json();
    } catch (error) {
        console.error('report visit failed:', error);
        return { success: false, message: 'report visit failed', visits: 0 };
    }
}

// 测量ping延迟
async function measurePingLatency() {
    try {
        // 执行3次测量取平均值
        const samples = 3;
        let totalLatency = 0;
        
        for (let i = 0; i < samples; i++) {
            const latency = await singlePingMeasurement();
            totalLatency += latency;
            
            // 短暂延迟避免请求堆叠
            if (i < samples - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        
        // 计算平均延迟并四舍五入到整数
        return Math.round(totalLatency / samples);
    } catch (error) {
        console.error('Failed to measure ping latency:', error);
        return 0;
    }
}

// 单次ping测量
async function singlePingMeasurement() {
    // 使用performance API更精确地测量时间
    const start = performance.now();
    
    try {
        // 使用fetch API，无需解析响应
        const response = await fetch('/api/ping', {
            method: 'GET',
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store',
                'Pragma': 'no-cache'
            }
        });
        
        const end = performance.now();
        return end - start;
    } catch (e) {
        return 0;
    }
} 