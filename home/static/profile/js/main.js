/**
 * 全局变量声明
 * --------------------------------------
 */
// 防止重定向循环的标记
let redirectAttempted = false;

// DOM引用缓存
let dropdownUserName;
let dropdownUserEmail;

// 卡片加载状态标记
let cardsLoaded = false;

// 用户ID缓存
let currentUserId = '';

// 备忘录同步相关变量
let lastServerUpdate = 0; // 服务器最后更新时间戳
let userIsEditing = false; // 用户是否正在编辑
let syncInterval; // 同步定时器引用

/**
 * 页面初始化
 * --------------------------------------
 */
document.addEventListener('DOMContentLoaded', function() {
    // 会话检查和重定向处理
    handleSessionCheck();
    
    // 初始化各个模块
    initData();
    initUI();

    // 便利贴功能
    const notesTextarea = document.getElementById('notes-content');
    if (!notesTextarea) {
        console.error('便利贴文本框未找到');
        return;
    }

    let saveTimeout;

    // 从localStorage加载保存的内容
    const loadNotes = () => {
        // 首先尝试从服务器获取备忘录
        fetch('/profile/api/notes')
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else if (response.status === 404) {
                    // 如果服务器没有找到备忘录，则使用本地存储的内容
                    return { content: localStorage.getItem('userNotes') || '' };
                } else {
                    throw new Error('获取备忘录失败');
                }
            })
            .then(data => {
                notesTextarea.value = data.content;
                // 同步到localStorage
                localStorage.setItem('userNotes', data.content);
                console.log('从服务器加载备忘录成功');
                
                // 记录最后更新时间
                if (data.last_updated) {
                    lastServerUpdate = data.last_updated;
                }
                
                // 启动自动同步
                startAutoSync(notesTextarea);
            })
            .catch(error => {
                console.error('加载备忘录失败:', error);
                // 如果服务器请求失败，回退到本地存储
                const savedNotes = localStorage.getItem('userNotes');
                if (savedNotes) {
                    notesTextarea.value = savedNotes;
                }
                
                // 即使加载失败也启动自动同步
                startAutoSync(notesTextarea);
            });
    };

    // 自动保存功能
    const autoSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const notes = notesTextarea.value;
            
            // 保存到本地存储
            localStorage.setItem('userNotes', notes);
            
            // 保存到服务器
            saveNotesToServer(notes);
            
            console.log('笔记已自动保存:', notes.substring(0, 20) + (notes.length > 20 ? '...' : ''));
            // 显示保存提示（可选）
            showToast('已自动保存');
        }, 500);
    };

    // 添加事件监听器
    notesTextarea.addEventListener('input', autoSave);
    
    // 跟踪用户是否在编辑文本区域
    notesTextarea.addEventListener('focus', () => {
        userIsEditing = true;
        console.log('用户开始编辑');
    });
    
    // 添加失焦保存
    notesTextarea.addEventListener('blur', () => {
        const notes = notesTextarea.value;
        localStorage.setItem('userNotes', notes);
        saveNotesToServer(notes);
        console.log('失焦保存完成');
        
        // 设置延迟，以免用户只是临时失焦
        setTimeout(() => {
            userIsEditing = false;
            console.log('用户停止编辑');
        }, 500);
    });

    // 页面加载时加载保存的内容
    loadNotes();
    
    // 页面关闭前保存
    window.addEventListener('beforeunload', () => {
        const notes = notesTextarea.value;
        localStorage.setItem('userNotes', notes);
        // 这里不需要调用saveNotesToServer，因为beforeunload事件中的异步操作不保证会完成
        
        // 清除同步定时器
        if (syncInterval) {
            clearInterval(syncInterval);
        }
    });
});

/**
 * 初始化数据
 * --------------------------------------
 */
function initData() {
    // 加载用户基本信息
    fetchUserInfo();
    
    // 加载登录统计信息
    fetchLoginStats();
}

/**
 * 初始化UI组件
 * --------------------------------------
 */
function initUI() {
    // 初始化下拉菜单
    initProfileDropdown();
    
    // 监听页面滚动，为导航栏添加光晕效果
    initNavbarScrollEffect();

    // 初始化头像上传功能
    initAvatarUpload();
    
    // 初始化页面加载动画
    initPageLoadAnimation();
}

/**
 * 会话检查和重定向处理
 * --------------------------------------
 */
function handleSessionCheck() {
    // 检查URL中是否包含错误参数
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('error')) {
        const error = urlParams.get('error');
        
        // 如果存在session_expired错误且没有之前的重定向尝试
        if (error === 'session_expired' && !sessionStorage.getItem('redirectAttempted')) {
            // 设置标记，避免再次重定向
            sessionStorage.setItem('redirectAttempted', 'true');
            
            // 直接跳转到登录页面
            window.location.href = '/';
            return;
        }
    } else {
        // 如果当前页面没有错误参数，清除之前的重定向标记
        sessionStorage.removeItem('redirectAttempted');
    }
}

/**
 * 动画与视觉效果模块
 * --------------------------------------
 */

/**
 * 初始化页面加载动画
 * 按顺序加载导航栏、页面内容和卡片
 */
function initPageLoadAnimation() {
    // 显示导航栏
    setTimeout(() => {
        document.querySelector('.navbar').classList.add('loaded');
    }, 100);
    
    // 显示页面内容
    setTimeout(() => {
        document.querySelector('.page-content').classList.add('loaded');
    }, 300);
    
    // 逐个显示卡片
    animateCards();
}

/**
 * 卡片动画显示效果
 */
function animateCards() {
    const cards = document.querySelectorAll('.card');
    let lastCardIndex = cards.length - 1;
    
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.classList.add('loaded');
            
            // 当最后一张卡片加载完成后，设置标记
            if (index === lastCardIndex) {
                cardsLoaded = true;
                
                // 触发自定义事件，通知卡片加载完成
                document.dispatchEvent(new CustomEvent('cardsLoaded'));
            }
        }, 500 + (index * 150)); // 每个卡片延迟150ms显示
    });
}

/**
 * 初始化导航栏滚动效果
 */
function initNavbarScrollEffect() {
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', function() {
        if (window.scrollY > 10) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

/**
 * 创建并启动进度条动画
 * @param {number} percentage - 进度百分比(0-100)
 * @param {number} loginCount - 登录次数
 */
function startProgressAnimation(percentage, loginCount) {
    const progressBar = document.getElementById('login-progress');
    
    // 清理旧的闪光容器（如果有）
    const oldShimmer = document.querySelector('.shimmer-container');
    if (oldShimmer) {
        oldShimmer.parentNode.removeChild(oldShimmer);
    }
    
    // 重置进度条宽度
    progressBar.style.width = '0%';
    
    // 创建新的闪光效果
    const shimmerContainer = document.createElement('div');
    shimmerContainer.className = 'shimmer-container';
    
    const shimmerElement = document.createElement('div');
    shimmerElement.className = 'shimmer-element';
    
    shimmerContainer.appendChild(shimmerElement);
    progressBar.parentNode.appendChild(shimmerContainer);
    
    // 设置进度条宽度
    progressBar.style.width = `${percentage}%`;
    
    // 根据登录次数设置不同的颜色
    updateProgressColor(progressBar, loginCount);
    
    // 显示闪光效果
    setTimeout(() => {
        shimmerContainer.classList.add('active');
        
        // 等待一段时间后平滑淡出闪光效果
        setTimeout(() => {
            shimmerContainer.classList.add('fadeout');
            
            // 淡出完成后删除元素
            setTimeout(() => {
                if (shimmerContainer.parentNode) {
                    shimmerContainer.parentNode.removeChild(shimmerContainer);
                }
            }, 1100); // 等待淡出完成后再移除（略多于淡出时间）
        }, 2500); // 闪光效果显示2.5秒后开始淡出
    }, 100);
}

/**
 * 根据登录次数更新进度条颜色
 * @param {HTMLElement} progressBar - 进度条元素
 * @param {number} loginCount - 登录次数
 */
function updateProgressColor(progressBar, loginCount) {
    if (loginCount <= 30) {
        // 0-30次：绿色
        progressBar.style.backgroundColor = '#4caf50';
    } else if (loginCount <= 60) {
        // 31-60次：黄色
        progressBar.style.backgroundColor = '#ffeb3b';
    } else if (loginCount <= 90) {
        // 61-90次：橙色
        progressBar.style.backgroundColor = '#ff9800';
    } else {
        // 91+次：红色
        progressBar.style.backgroundColor = '#f44336';
    }
}

/**
 * 交互功能模块
 * --------------------------------------
 */

/**
 * 初始化个人资料下拉菜单
 */
function initProfileDropdown() {
    const profileIcon = document.getElementById('profileIcon');
    const profileDropdown = document.getElementById('profileDropdown');
    
    // 初始化全局变量
    dropdownUserName = document.getElementById('dropdown-user-name');
    dropdownUserEmail = document.getElementById('dropdown-user-email');
    
    // 点击头像图标显示/隐藏下拉菜单
    profileIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
    });
    
    // 点击页面其他地方时关闭下拉菜单
    document.addEventListener('click', function() {
        profileDropdown.classList.remove('show');
    });
}

/**
 * 初始化头像上传功能
 */
function initAvatarUpload() {
    const avatarContainer = document.getElementById('avatar-upload-btn');
    const avatarInput = document.getElementById('avatar-input');
    
    // 点击头像容器触发文件选择
    avatarContainer.addEventListener('click', function() {
        avatarInput.click();
    });
    
    // 处理文件选择事件
    avatarInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            
            // 验证文件
            if (!validateAvatarFile(file)) return;
            
            // 预览图像
            previewAvatar(file);
            
            // 上传头像
            uploadAvatar(file);
        }
    });
    
    // 阻止冒泡，避免点击input时触发container的点击事件
    avatarInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

/**
 * 验证头像文件
 * @param {File} file - 要验证的文件对象
 * @returns {boolean} 验证结果
 */
function validateAvatarFile(file) {
    // 检查文件大小（限制为4MB）
    if (file.size > 4 * 1024 * 1024) {
        showToast('头像文件过大，请选择小于4MB的图片', 'error');
        return false;
    }
    
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        return false;
    }
    
    return true;
}

/**
 * 预览头像图片
 * @param {File} file - 要预览的图片文件
 */
function previewAvatar(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('user-avatar').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

/**
 * 显示消息提示
 * @param {string} message - 提示消息内容
 * @param {string} type - 提示类型（success/error）
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    
    // 3秒后自动隐藏
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

/**
 * 数据处理模块
 * --------------------------------------
 */

/**
 * 获取用户信息
 */
async function fetchUserInfo() {
    try {
        console.log('正在获取用户信息...');
        const response = await fetch('/profile/api/userinfo');
        
        // 处理响应错误
        if (!response.ok) {
            handleResponseError(response.status);
            return;
        }
        
        const userData = await response.json();
        console.log('用户信息获取成功');
        
        // 更新页面上的用户信息
        updateUserInterface(userData);
    } catch (error) {
        console.error('获取用户信息失败:', error);
        
        // 防止无限重定向循环
        if (!redirectAttempted) {
            redirectAttempted = true;
        }
    }
}

/**
 * 处理API响应错误
 * @param {number} status - HTTP状态码
 */
function handleResponseError(status) {
    // 如果响应不成功（如401未授权），重定向到登录页面
    if (status === 401) {
        console.warn('用户未授权，需要重新登录');
        
        // 防止无限重定向循环
        if (!redirectAttempted) {
            redirectAttempted = true;
            window.location.href = '/auth?error=session_expired';
        }
        return;
    }
    
    throw new Error(`API请求失败，状态码: ${status}`);
}

/**
 * 更新用户界面
 * @param {Object} user - 用户数据对象
 */
function updateUserInterface(user) {
    // 更新头像
    updateUserAvatar(user);
    
    // 获取用户ID并存储
    currentUserId = user.id || user.sub || '';
    
    // 获取用户名
    const username = user.preferred_username || user.name || user.username || '';
    
    // 更新网页标题为用户名
    document.title = username ? username : '个人资料';
    
    // 更新用户名显示
    document.getElementById('user-name').textContent = username;
    document.getElementById('info-name').textContent = username;
    
    // 更新下拉菜单中的用户信息
    if (!dropdownUserName) dropdownUserName = document.getElementById('dropdown-user-name');
    if (!dropdownUserEmail) dropdownUserEmail = document.getElementById('dropdown-user-email');
    
    if (dropdownUserName) dropdownUserName.textContent = username.toUpperCase();
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || '';
    
    // 更新邮箱
    document.getElementById('user-email').textContent = user.email || '';
    document.getElementById('info-email').textContent = user.email || '';
    
    // 更新邮箱验证状态
    updateEmailVerificationStatus(user.email_verified);
    
    // 更新最近30天登录次数
    updateLoginCountInfo(user.recent_login_count || 0);
}

/**
 * 更新用户头像
 * @param {Object} user - 用户数据对象
 */
function updateUserAvatar(user) {
    const avatarElement = document.getElementById('user-avatar');
    const timestamp = new Date().getTime();
    
    // 设置用户头像
    if (user.avatar_url) {
        // 添加时间戳参数以避免缓存
        const avatarUrl = addTimestampToUrl(user.avatar_url, timestamp);
        avatarElement.src = avatarUrl;
    }
    // 备选方案，如果avatar_url不存在但有其他头像字段
    else if (user.avatar || user.picture) {
        const avatarData = user.avatar || user.picture;
        
        // 检查是否是有效的URL或data URI
        if (avatarData.startsWith('http://') || avatarData.startsWith('https://')) {
            // 添加时间戳参数以避免缓存
            const avatarUrl = addTimestampToUrl(avatarData, timestamp);
            avatarElement.src = avatarUrl;
        } else if (avatarData.startsWith('data:')) {
            // data URI不需要添加时间戳
            avatarElement.src = avatarData;
        }
    }
}

/**
 * 向URL添加时间戳参数
 * @param {string} url - 原始URL
 * @param {number} timestamp - 时间戳
 * @returns {string} 添加时间戳后的URL
 */
function addTimestampToUrl(url, timestamp) {
    return url.includes('?') 
        ? `${url}&t=${timestamp}` 
        : `${url}?t=${timestamp}`;
}

/**
 * 更新邮箱验证状态
 * @param {boolean} isVerified - 是否已验证
 */
function updateEmailVerificationStatus(isVerified) {
    const emailVerifiedBadge = document.getElementById('email-verified-badge');
    if (isVerified) {
        emailVerifiedBadge.textContent = 'Verified';
        emailVerifiedBadge.className = 'verified-badge';
    } else {
        emailVerifiedBadge.textContent = 'Not Verified';
        emailVerifiedBadge.className = 'not-verified-badge';
    }
}

/**
 * 更新登录次数信息
 * @param {number} loginCount - 登录次数
 */
function updateLoginCountInfo(loginCount) {
    // 更新登录次数文本
    document.getElementById('login-count-text').innerHTML = 
        `You have logged in <strong>${loginCount}</strong> times in the last 30 days`;
    
    // 计算进度条百分比（最大值为100）
    const maxLogins = 100;
    const percentage = Math.min(100, (loginCount / maxLogins) * 100);
    
    // 检查卡片是否已加载完成
    if (cardsLoaded) {
        // 如果卡片已加载完成，延迟一小段时间后启动进度条动画
        setTimeout(() => startProgressAnimation(percentage, loginCount), 300);
    } else {
        // 如果卡片尚未加载完成，监听卡片加载完成事件
        document.addEventListener('cardsLoaded', function onCardsLoaded() {
            // 卡片加载完成后等待一小段时间再开始动画
            setTimeout(() => startProgressAnimation(percentage, loginCount), 300);
            
            // 移除事件监听器，避免重复执行
            document.removeEventListener('cardsLoaded', onCardsLoaded);
        });
    }
}

/**
 * 获取登录统计信息
 */
async function fetchLoginStats() {
    try {
        console.log('正在获取登录统计...');
        const response = await fetch('/profile/api/user/login-stats');
        
        if (!response.ok) {
            // 处理错误但不重定向
            if (response.status === 401) {
                console.warn('获取登录统计时用户未授权');
                return;
            }
            throw new Error('获取登录统计失败');
        }
        
        const statsData = await response.json();
        console.log('登录统计获取成功');
        
        // 从登录统计中提取客户端信息并更新UI
        if (statsData && statsData.client_stats) {
            displayRecentClients(statsData.client_stats, statsData);
        } else {
            displayRecentClientsError('无法获取客户端统计信息');
        }
    } catch (error) {
        console.error('获取登录统计失败:', error);
        displayRecentClientsError('无法加载登录统计信息');
    }
}

/**
 * 显示最近登录的客户端
 * @param {Array} clientStats - 客户端统计数据
 * @param {Object} statsData - 统计总数据
 */
function displayRecentClients(clientStats, statsData) {
    const container = document.getElementById('recent-clients-list');
    
    // 清空加载指示器
    container.innerHTML = '';
    
    if (!clientStats || clientStats.length === 0) {
        container.innerHTML = '<div class="loading-indicator">没有找到最近的登录记录</div>';
        return;
    }
    
    // 添加时间范围信息
    addDateRangeInfo(container, statsData);
    
    // 对客户端按照最后登录时间排序（最近的在前）
    const sortedClients = sortClientsByLastLogin(clientStats);
    
    // 为每个客户端创建一个项目
    createClientElements(container, sortedClients);
}

/**
 * 添加日期范围信息
 * @param {HTMLElement} container - 容器元素
 * @param {Object} statsData - 统计数据
 */
function addDateRangeInfo(container, statsData) {
    let dayRange = 30; // 默认30天
    
    if (statsData && statsData.start_date && statsData.end_date) {
        const startDate = new Date(statsData.start_date);
        const endDate = new Date(statsData.end_date);
        dayRange = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        const rangeElement = document.createElement('div');
        rangeElement.className = 'date-range-info';
        rangeElement.style.marginBottom = '15px';
        rangeElement.style.color = '#aaaaaa';
        rangeElement.textContent = `最近${dayRange}天`;
        container.appendChild(rangeElement);
    }
}

/**
 * 按最后登录时间排序客户端
 * @param {Array} clientStats - 客户端统计数据
 * @returns {Array} 排序后的客户端数组
 */
function sortClientsByLastLogin(clientStats) {
    return [...clientStats].sort((a, b) => {
        const lastLoginA = new Date(a.last_login);
        const lastLoginB = new Date(b.last_login);
        return lastLoginB - lastLoginA; // 降序排列，最近的在前
    });
}

/**
 * 创建客户端元素
 * @param {HTMLElement} container - 容器元素
 * @param {Array} clients - 客户端数组
 */
function createClientElements(container, clients) {
    clients.forEach((client, index) => {
        // 格式化最后登录时间
        const lastLogin = new Date(client.last_login);
        const timeAgo = getTimeAgo(lastLogin);
        
        // 确定客户端图标
        const clientIcon = getClientIcon(client.client_name);
        
        // 创建客户端元素
        const clientElement = document.createElement('div');
        clientElement.className = 'interactive-item';
        clientElement.style.opacity = '0';
        clientElement.style.transform = 'translateY(10px)';
        clientElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        clientElement.innerHTML = `
            <div class="item-icon">${clientIcon}</div>
            <div class="item-text">
                <div class="item-title">${client.client_name}</div>
                <div class="item-desc">
                    <span style="color: #ccc; font-weight: 500;">${timeAgo}</span> · 共登录 ${client.login_count} 次
                </div>
            </div>
        `;
        
        container.appendChild(clientElement);
        
        // 错开显示每个客户端项
        setTimeout(() => {
            clientElement.style.opacity = '1';
            clientElement.style.transform = 'translateY(0)';
        }, 100 + (index * 80));
    });
}

/**
 * 获取客户端图标
 * @param {string} clientName - 客户端名称
 * @returns {string} 图标
 */
function getClientIcon(clientName) {
    const name = clientName.toLowerCase();
    
    if (name.includes('web') || name.includes('网页')) return '🌐';
    if (name.includes('desktop') || name.includes('桌面')) return '💻';
    if (name.includes('mobile') || name.includes('手机')) return '📱';
    
    return '🔹'; // 默认图标
}

/**
 * 显示最近登录客户端的错误
 * @param {string} message - 错误信息
 */
function displayRecentClientsError(message) {
    console.warn('显示客户端错误:', message);
    const container = document.getElementById('recent-clients-list');
    container.innerHTML = `<div class="loading-indicator" style="color: #ff8888;">${message}</div>`;
}

/**
 * 计算时间差（几天前、几小时前等）
 * @param {Date} date - 要计算的日期
 * @returns {string} 格式化后的时间差
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            return `${diffDays} 天前`;
        } else if (diffDays < 31) {
            const weeks = Math.floor(diffDays / 7);
            return weeks === 1 ? '1 周前' : `${weeks} 周前`;
        } else {
            const months = Math.floor(diffDays / 30);
            return months === 1 ? '1 个月前' : `${months} 个月前`;
        }
    } else if (diffHours > 0) {
        return diffHours === 1 ? '1 小时前' : `${diffHours} 小时前`;
    } else if (diffMin > 0) {
        return diffMin === 1 ? '1 分钟前' : `${diffMin} 分钟前`;
    } else if (diffSec > 30) {
        return `${diffSec} 秒前`;
    } else {
        return '刚刚';
    }
}

/**
 * 上传头像
 * @param {File} file - 要上传的文件
 */
async function uploadAvatar(file) {
    try {
        console.log('正在上传头像...');
        
        // 创建FormData对象
        const formData = new FormData();
        formData.append('avatar', file);
        
        // 发送请求
        const uploadResponse = await fetch('/profile/api/upload-avatar', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || '上传头像失败');
        }
        
        console.log('头像上传成功');
        
        // 上传成功
        showToast('头像上传成功', 'success');
        
        // 添加时间戳参数以强制更新缓存的头像
        refreshAvatarCache();
        
        // 重新加载用户信息以更新头像
        setTimeout(() => {
            fetchUserInfo();
        }, 1000);
        
    } catch (error) {
        console.error('上传头像失败:', error);
        showToast(error.message || '上传头像失败', 'error');
    }
}

/**
 * 刷新头像缓存
 */
function refreshAvatarCache() {
    const timestamp = new Date().getTime();
    const userAvatar = document.getElementById('user-avatar');
    
    // 如果当前头像是URL（非data:开头的URI），添加时间戳参数
    if (userAvatar.src && !userAvatar.src.startsWith('data:')) {
        // 处理URL，添加或更新时间戳参数
        let avatarUrl = new URL(userAvatar.src);
        avatarUrl.searchParams.set('t', timestamp);
        userAvatar.src = avatarUrl.toString();
    }
}

/**
 * 启动自动同步功能
 * @param {HTMLTextAreaElement} textarea - 备忘录文本区域
 */
function startAutoSync(textarea) {
    // 清除可能存在的旧定时器
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // 创建新的同步定时器，每10秒触发一次
    syncInterval = setInterval(() => {
        syncNotesFromServer(textarea);
    }, 10000); // 10秒
    
    console.log('已启动备忘录自动同步 (10秒)');
}

/**
 * 从服务器同步备忘录内容
 * @param {HTMLTextAreaElement} textarea - 备忘录文本区域
 */
function syncNotesFromServer(textarea) {
    // 如果用户正在编辑，跳过同步以避免干扰用户
    if (userIsEditing) {
        console.log('用户正在编辑，跳过此次同步');
        return;
    }
    
    console.log('正在与服务器同步备忘录...');
    
    fetch('/profile/api/notes')
        .then(response => {
            if (response.ok) {
                return response.json();
            } else if (response.status === 404) {
                // 如果服务器没有找到备忘录，不做任何操作
                return null;
            } else {
                throw new Error('同步备忘录失败，状态码: ' + response.status);
            }
        })
        .then(data => {
            if (!data) return;
            
            // 检查服务器的最后更新时间是否比上次同步更新
            if (data.last_updated && data.last_updated > lastServerUpdate) {
                console.log('发现新的服务器备忘录内容，正在更新...');
                lastServerUpdate = data.last_updated;
                
                // 检查本地内容是否与服务器不同
                if (textarea.value !== data.content) {
                    // 更新文本区域和本地存储
                    textarea.value = data.content;
                    localStorage.setItem('userNotes', data.content);
                    showToast('备忘录已自动同步', 'info');
                }
            }
        })
        .catch(error => {
            console.error('同步备忘录失败:', error);
        });
}

/**
 * 将备忘录保存到服务器
 * @param {string} content - 备忘录内容
 */
function saveNotesToServer(content) {
    fetch('/profile/api/notes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('保存备忘录到服务器失败');
        }
        return response.json();
    })
    .then(data => {
        console.log('备忘录已保存到服务器');
        // 更新最后服务器更新时间
        if (data && data.last_updated) {
            lastServerUpdate = data.last_updated;
        }
    })
    .catch(error => {
        console.error('保存备忘录到服务器失败:', error);
    });
} 