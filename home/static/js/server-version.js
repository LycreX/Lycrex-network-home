// 获取并显示服务器版本信息
async function fetchServerVersion() {
    try {
        const versionResponse = await fetch('/api/version');
        const versionData = await versionResponse.json();
        
        // 获取或创建版本信息元素
        let versionElement = document.getElementById('server-version');
        
        // 如果元素不存在，创建一个新元素
        if (!versionElement) {
            versionElement = document.createElement('div');
            versionElement.id = 'server-version';
            versionElement.className = 'server-version';
            document.body.appendChild(versionElement);
        }
        
        // 显示版本信息
        versionElement.innerHTML = `${versionData.name} v${versionData.version}`;
        versionElement.style.display = 'block';
    } catch (error) {
        console.error('获取服务器版本信息失败:', error);
    }
}

// 页面加载完成后获取服务器版本信息
document.addEventListener('DOMContentLoaded', fetchServerVersion); 