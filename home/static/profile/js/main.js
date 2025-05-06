/**
 * 全局变量
 */
let redirectAttempted = false;
let dropdownUserName;
let dropdownUserEmail;
let cardsLoaded = false;
let currentUserId = '';
let lastServerUpdate = 0;
let userIsEditing = false;
let syncInterval;
let passwordModalActive = false;
let usernameEditActive = false;
let isPublicNote = false;
let currentChannelId = 0;

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 添加加载状态的CSS样式
    addLoadingStateCss();
    
    handleSessionCheck();
    initData();
    initUI();
    initPasswordChange();
    initLogout();
    initNotePinning();
    initNoteTypeSwitch();

    const notesTextarea = document.getElementById('notes-content');
    if (!notesTextarea) {
        console.error('便利贴文本框未找到');
        return;
    }

    let saveTimeout;

    // 从服务器加载备忘录
    const loadNotes = () => {
        const noteTypeToggle = document.getElementById('noteTypeToggle');
        const channelInput = document.getElementById('channelInput');
        
        // 禁用输入框和开关
        if (noteTypeToggle) noteTypeToggle.disabled = true;
        if (channelInput) channelInput.disabled = true;
        
        let apiUrl = isPublicNote
            ? `/profile/api/public-notes?channel=${currentChannelId}`
            : '/profile/api/notes';
            
        console.log(`开始加载${isPublicNote ? '公共' : '个人'}备忘录，频道ID：${currentChannelId}`);
        
        // 先尝试从服务器加载，如果失败则使用本地存储
        fetch(apiUrl)
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else {
                    // 返回本地存储的内容
                    return { 
                        content: (isPublicNote ? localStorage.getItem(`publicNotes_${currentChannelId}`) : localStorage.getItem('userNotes')) || '',
                        last_updated: 0
                    };
                }
            })
            .then(data => {
                if (notesTextarea) {
                    notesTextarea.value = data.content || '';
                }
                
                if (isPublicNote) {
                    localStorage.setItem(`publicNotes_${currentChannelId}`, data.content || '');
                } else {
                    localStorage.setItem('userNotes', data.content || '');
                }
                
                // 更新最后同步时间
                lastServerUpdate = data.last_updated || 0;
                
                console.log(`从服务器加载${isPublicNote ? '公共' : '个人'}备忘录成功，频道ID：${currentChannelId}`);
                
                // 启动自动同步
                startAutoSync(notesTextarea);
                
                // 恢复输入框和开关
                if (noteTypeToggle) noteTypeToggle.disabled = false;
                if (channelInput) channelInput.disabled = false;
            })
            .catch(error => {
                console.error('加载备忘录失败:', error);
                
                let savedNotes = '';
                
                if (isPublicNote) {
                    savedNotes = localStorage.getItem(`publicNotes_${currentChannelId}`);
                } else {
                    savedNotes = localStorage.getItem('userNotes');
                }
                
                if (notesTextarea && savedNotes) {
                    notesTextarea.value = savedNotes;
                }
                
                // 恢复输入框和开关
                if (noteTypeToggle) noteTypeToggle.disabled = false;
                if (channelInput) channelInput.disabled = false;
                
                showToast('加载备忘录失败，已使用本地缓存', 'error');
            });
    };

    // 自动保存功能
    const autoSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const notes = notesTextarea.value;
            
            if (isPublicNote) {
                localStorage.setItem(`publicNotes_${currentChannelId}`, notes);
            } else {
                localStorage.setItem('userNotes', notes);
            }
            
            saveNotesToServer(notes);
            console.log('笔记已自动保存:', notes.substring(0, 20) + (notes.length > 20 ? '...' : ''));
            showToast('已自动保存');
        }, 500);
    };

    // 事件监听器
    notesTextarea.addEventListener('input', autoSave);
    
    notesTextarea.addEventListener('focus', () => {
        userIsEditing = true;
        console.log('用户开始编辑');
    });
    
    notesTextarea.addEventListener('blur', () => {
        const notes = notesTextarea.value;
        
        if (isPublicNote) {
            localStorage.setItem(`publicNotes_${currentChannelId}`, notes);
        } else {
            localStorage.setItem('userNotes', notes);
        }
        
        saveNotesToServer(notes);
        console.log('失焦保存完成');
        
        setTimeout(() => {
            userIsEditing = false;
            console.log('用户停止编辑');
        }, 500);
    });

    loadNotes();
    
    window.addEventListener('beforeunload', () => {
        const notes = notesTextarea.value;
        
        if (isPublicNote) {
            localStorage.setItem(`publicNotes_${currentChannelId}`, notes);
        } else {
            localStorage.setItem('userNotes', notes);
        }
        
        if (syncInterval) {
            clearInterval(syncInterval);
        }
    });
    
    // 监听保存快捷键 (Ctrl+S 或 Cmd+S)
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            
            const notes = notesTextarea.value;
            
            if (isPublicNote) {
                localStorage.setItem(`publicNotes_${currentChannelId}`, notes);
            } else {
                localStorage.setItem('userNotes', notes);
            }
            
            saveNotesToServer(notes);
            showToast('便利贴已保存');
        }
    });
    
    // 当频道输入框发生变化时
    const channelInput = document.getElementById('channelInput');
    if (channelInput) {
        channelInput.addEventListener('change', function() {
            // 先保存当前内容
            if (notesTextarea && isPublicNote) {
                const currentContent = notesTextarea.value;
                localStorage.setItem(`publicNotes_${currentChannelId}`, currentContent);
                saveNotesToServer(currentContent);
            }
            
            const newChannelId = parseInt(this.value) || 0;
            if (newChannelId < 0) this.value = 0;
            if (newChannelId > 9999) this.value = 9999;
            
            if (newChannelId !== currentChannelId) {
                currentChannelId = newChannelId;
                saveUserChannelSetting(currentChannelId);
                
                // 只有在公共便利贴模式下才重新加载笔记
                if (isPublicNote) {
                    loadNotes();
                }
                
                showToast(`已切换到频道: ${currentChannelId}`);
            }
        });
    }
});

/**
 * 动态添加加载状态的CSS样式
 */
function addLoadingStateCss() {
    const style = document.createElement('style');
    style.textContent = `
        /* 开关加载状态样式 */
        .note-type-switch .switch-label.loading {
            opacity: 0.6;
            color: #888;
        }
        
        /* 开关滑块加载状态 */
        .note-type-switch .slider.loading {
            transition: all 0.3s ease;
            left: 50% !important;
            transform: translateX(-50%) !important;
            opacity: 0.7;
        }
        
        /* 开关禁用状态 */
        .note-type-switch input:disabled + .slider {
            opacity: 0.6;
            cursor: wait;
        }
        
        /* 脉冲动画效果 */
        .note-type-switch .slider.loading::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 20px;
            animation: pulse 1.5s ease-in-out infinite;
            background-color: inherit;
            z-index: -1;
        }
        
        @keyframes pulse {
            0% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.5;
                transform: scale(1.1);
            }
            100% {
                opacity: 1;
                transform: scale(1);
            }
        }
        
        /* 输入框禁用状态 */
        #channelInput:disabled {
            opacity: 0.7;
            cursor: wait;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 初始化数据
 */
function initData() {
    fetchUserInfo();
    fetchLoginStats();
}

/**
 * 初始化UI组件
 */
function initUI() {
    initProfileDropdown();
    initNavbarScrollEffect();
    initAvatarUpload();
    initPageLoadAnimation();
    initUsernameEdit();
}

/**
 * 会话检查和重定向处理
 */
function handleSessionCheck() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('error')) {
        const error = urlParams.get('error');
        
        if (error === 'session_expired' && !sessionStorage.getItem('redirectAttempted')) {
            sessionStorage.setItem('redirectAttempted', 'true');
            window.location.href = '/';
            return;
        }
    } else {
        sessionStorage.removeItem('redirectAttempted');
    }
}

/**
 * 动画与视觉效果
 */
function initPageLoadAnimation() {
    setTimeout(() => {
        document.querySelector('.navbar').classList.add('loaded');
    }, 100);
    
    setTimeout(() => {
        document.querySelector('.page-content').classList.add('loaded');
    }, 300);
    
    animateCards();
}

function animateCards() {
    const cards = document.querySelectorAll('.card');
    let lastCardIndex = cards.length - 1;
    
    cards.forEach((card, index) => {
        setTimeout(() => {
            card.classList.add('loaded');
            
            if (index === lastCardIndex) {
                cardsLoaded = true;
                document.dispatchEvent(new CustomEvent('cardsLoaded'));
            }
        }, 500 + (index * 150));
    });
}

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

function startProgressAnimation(percentage, loginCount) {
    const progressBar = document.getElementById('login-progress');
    
    const oldShimmer = document.querySelector('.shimmer-container');
    if (oldShimmer) {
        oldShimmer.parentNode.removeChild(oldShimmer);
    }
    
    progressBar.style.width = '0%';
    
    const shimmerContainer = document.createElement('div');
    shimmerContainer.className = 'shimmer-container';
    
    const shimmerElement = document.createElement('div');
    shimmerElement.className = 'shimmer-element';
    
    shimmerContainer.appendChild(shimmerElement);
    progressBar.parentNode.appendChild(shimmerContainer);
    
    progressBar.style.width = `${percentage}%`;
    
    updateProgressColor(progressBar, loginCount);
    
    setTimeout(() => {
        shimmerContainer.classList.add('active');
        
        setTimeout(() => {
            shimmerContainer.classList.add('fadeout');
            
            setTimeout(() => {
                if (shimmerContainer.parentNode) {
                    shimmerContainer.parentNode.removeChild(shimmerContainer);
                }
            }, 1100);
        }, 2500);
    }, 100);
}

function updateProgressColor(progressBar, loginCount) {
    if (loginCount <= 30) {
        progressBar.style.backgroundColor = '#4caf50';
    } else if (loginCount <= 60) {
        progressBar.style.backgroundColor = '#ffeb3b';
    } else if (loginCount <= 90) {
        progressBar.style.backgroundColor = '#ff9800';
    } else {
        progressBar.style.backgroundColor = '#f44336';
    }
}

/**
 * 交互功能
 */
function initProfileDropdown() {
    const profileIcon = document.getElementById('profileIcon');
    const profileDropdown = document.getElementById('profileDropdown');
    
    dropdownUserName = document.getElementById('dropdown-user-name');
    dropdownUserEmail = document.getElementById('dropdown-user-email');
    
    profileIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', function() {
        profileDropdown.classList.remove('show');
    });
}

function initAvatarUpload() {
    const avatarContainer = document.getElementById('avatar-upload-btn');
    const avatarInput = document.getElementById('avatar-input');
    
    avatarContainer.addEventListener('click', function() {
        avatarInput.click();
    });
    
    avatarInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            
            if (!validateAvatarFile(file)) return;
            
            previewAvatar(file);
            uploadAvatar(file);
        }
    });
    
    avatarInput.addEventListener('click', function(e) {
        e.stopPropagation();
    });
}

function validateAvatarFile(file) {
    if (file.size > 4 * 1024 * 1024) {
        showToast('头像文件过大，请选择小于4MB的图片', 'error');
        return false;
    }
    
    if (!file.type.startsWith('image/')) {
        showToast('请选择图片文件', 'error');
        return false;
    }
    
    return true;
}

function previewAvatar(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('user-avatar').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

/**
 * 数据处理
 */
async function fetchUserInfo() {
    try {
        console.log('正在获取用户信息...');
        const response = await fetch('/profile/api/userinfo');
        
        if (!response.ok) {
            handleResponseError(response.status);
            return;
        }
        
        const userData = await response.json();
        console.log('用户信息获取成功');
        
        updateUserInterface(userData);
    } catch (error) {
        console.error('获取用户信息失败:', error);
        
        if (!redirectAttempted) {
            redirectAttempted = true;
        }
    }
}

function handleResponseError(status) {
    if (status === 401) {
        console.warn('用户未授权，需要重新登录');
        
        if (!redirectAttempted) {
            redirectAttempted = true;
            window.location.href = '/auth?error=session_expired';
        }
        return;
    }
    
    throw new Error(`API请求失败，状态码: ${status}`);
}

function updateUserInterface(user) {
    updateUserAvatar(user);
    
    currentUserId = user.id || user.sub || '';
    
    const username = user.preferred_username || user.name || user.username || '';
    
    document.title = username ? username : '个人资料';
    
    document.getElementById('username-display').textContent = username;
    document.getElementById('info-name').textContent = username;
    
    if (!dropdownUserName) dropdownUserName = document.getElementById('dropdown-user-name');
    if (!dropdownUserEmail) dropdownUserEmail = document.getElementById('dropdown-user-email');
    
    if (dropdownUserName) dropdownUserName.textContent = username.toUpperCase();
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || '';
    
    document.getElementById('user-email').textContent = user.email || '';
    document.getElementById('info-email').textContent = user.email || '';
    
    updateEmailVerificationStatus(user.email_verified);
    
    updateLoginCountInfo(user.recent_login_count || 0);
}

function updateUserAvatar(user) {
    const avatarElement = document.getElementById('user-avatar');
    const timestamp = new Date().getTime();
    
    if (user.avatar_url) {
        const avatarUrl = addTimestampToUrl(user.avatar_url, timestamp);
        avatarElement.src = avatarUrl;
    }
    else if (user.avatar || user.picture) {
        const avatarData = user.avatar || user.picture;
        
        if (avatarData.startsWith('http://') || avatarData.startsWith('https://')) {
            const avatarUrl = addTimestampToUrl(avatarData, timestamp);
            avatarElement.src = avatarUrl;
        } else if (avatarData.startsWith('data:')) {
            avatarElement.src = avatarData;
        }
    }
}

function addTimestampToUrl(url, timestamp) {
    return url.includes('?') 
        ? `${url}&t=${timestamp}` 
        : `${url}?t=${timestamp}`;
}

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

function updateLoginCountInfo(loginCount) {
    document.getElementById('login-count-text').innerHTML = 
        `You have logged in <strong>${loginCount}</strong> times in the last 30 days`;
    
    const maxLogins = 100;
    const percentage = Math.min(100, (loginCount / maxLogins) * 100);
    
    if (cardsLoaded) {
        setTimeout(() => startProgressAnimation(percentage, loginCount), 300);
    } else {
        document.addEventListener('cardsLoaded', function onCardsLoaded() {
            setTimeout(() => startProgressAnimation(percentage, loginCount), 300);
            document.removeEventListener('cardsLoaded', onCardsLoaded);
        });
    }
}

async function fetchLoginStats() {
    try {
        console.log('正在获取登录统计...');
        const response = await fetch('/profile/api/user/login-stats');
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('获取登录统计时用户未授权');
                return;
            }
            throw new Error('获取登录统计失败');
        }
        
        const statsData = await response.json();
        console.log('登录统计获取成功');
        
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

function displayRecentClients(clientStats, statsData) {
    const container = document.getElementById('recent-clients-list');
    
    container.innerHTML = '';
    
    if (!clientStats || clientStats.length === 0) {
        container.innerHTML = '<div class="loading-indicator">没有找到最近的登录记录</div>';
        return;
    }
    
    addDateRangeInfo(container, statsData);
    
    const sortedClients = sortClientsByLastLogin(clientStats);
    
    createClientElements(container, sortedClients);
}

function addDateRangeInfo(container, statsData) {
    let dayRange = 30;
    
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

function sortClientsByLastLogin(clientStats) {
    return [...clientStats].sort((a, b) => {
        const lastLoginA = new Date(a.last_login);
        const lastLoginB = new Date(b.last_login);
        return lastLoginB - lastLoginA;
    });
}

function createClientElements(container, clients) {
    clients.forEach((client, index) => {
        const lastLogin = new Date(client.last_login);
        const timeAgo = getTimeAgo(lastLogin);
        
        const clientIcon = getClientIcon(client.client_name);
        
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
        
        setTimeout(() => {
            clientElement.style.opacity = '1';
            clientElement.style.transform = 'translateY(0)';
        }, 100 + (index * 80));
    });
}

function getClientIcon(clientName) {
    const name = clientName.toLowerCase();
    
    if (name.includes('web') || name.includes('网页')) return '🌐';
    if (name.includes('desktop') || name.includes('桌面')) return '💻';
    if (name.includes('mobile') || name.includes('手机')) return '📱';
    
    return '🔹';
}

function displayRecentClientsError(message) {
    console.warn('显示客户端错误:', message);
    const container = document.getElementById('recent-clients-list');
    container.innerHTML = `<div class="loading-indicator" style="color: #ff8888;">${message}</div>`;
}

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

async function uploadAvatar(file) {
    try {
        console.log('正在上传头像...');
        
        const formData = new FormData();
        formData.append('avatar', file);
        
        const uploadResponse = await fetch('/profile/api/upload-avatar', {
            method: 'POST',
            body: formData
        });
        
        if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json();
            throw new Error(errorData.error || '上传头像失败');
        }
        
        console.log('头像上传成功');
        
        showToast('头像上传成功', 'success');
        
        refreshAvatarCache();
        
        setTimeout(() => {
            fetchUserInfo();
        }, 1000);
        
    } catch (error) {
        console.error('上传头像失败:', error);
        showToast(error.message || '上传头像失败', 'error');
    }
}

function refreshAvatarCache() {
    const timestamp = new Date().getTime();
    const userAvatar = document.getElementById('user-avatar');
    
    if (userAvatar.src && !userAvatar.src.startsWith('data:')) {
        let avatarUrl = new URL(userAvatar.src);
        avatarUrl.searchParams.set('t', timestamp);
        userAvatar.src = avatarUrl.toString();
    }
}

/**
 * 自动同步便利贴内容到服务器
 */
function startAutoSync(textarea) {
    // 先清除可能存在的定时器
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // 初始同步
    syncNotesFromServer(textarea);
    
    // 每60秒同步一次
    syncInterval = setInterval(() => {
        // 只有在用户不编辑时才同步
        if (!userIsEditing) {
            syncNotesFromServer(textarea);
        }
    }, 60000);
}

/**
 * 从服务器同步便利贴内容
 */
function syncNotesFromServer(textarea) {
    if (!textarea) return;
    
    // 如果用户正在编辑，不进行同步
    if (userIsEditing) {
        console.log('用户正在编辑，跳过同步');
        return;
    }
    
    console.log(`正在与服务器同步${isPublicNote ? '公共' : '个人'}备忘录...频道:${currentChannelId}`);
    
    // 确定API URL
    let apiUrl = isPublicNote
        ? `/profile/api/public-notes?channel=${currentChannelId}`
        : '/profile/api/notes';
    
    fetch(apiUrl)
        .then(response => {
            if (response.ok) {
                return response.json();
            } else if (response.status === 404) {
                return { content: '', last_updated: 0 };
            } else {
                throw new Error('同步备忘录失败');
            }
        })
        .then(data => {
            // 没有服务器数据则跳过
            if (!data) {
                return;
            }
            
            // 如果服务器更新时间更新，且用户没有编辑，则使用服务器内容
            if (data.last_updated > lastServerUpdate && !userIsEditing) {
                // 检查本地内容是否与服务器内容不同
                const localContent = textarea.value;
                const serverContent = data.content || '';
                
                if (localContent !== serverContent) {
                    // 如果内容不同且不是用户正在编辑，则更新
                    textarea.value = serverContent;
                    
                    if (isPublicNote) {
                        localStorage.setItem(`publicNotes_${currentChannelId}`, serverContent);
                    } else {
                        localStorage.setItem('userNotes', serverContent);
                    }
                    
                    console.log('已从服务器更新便利贴内容');
                }
                
                // 更新最后同步时间
                lastServerUpdate = data.last_updated;
            }
            // 如果本地有内容但服务器内容为空，且不是用户正在编辑，则可能需要将本地内容同步到服务器
            else if (textarea.value && !data.content && !userIsEditing) {
                saveNotesToServer(textarea.value);
            }
        })
        .catch(error => {
            console.error('同步备忘录失败:', error);
        });
}

/**
 * 保存便利贴内容到服务器
 */
function saveNotesToServer(content) {
    if (content === undefined || content === null) return;
    
    let apiUrl = '';
    let requestBody = {};
    
    if (isPublicNote) {
        apiUrl = '/profile/api/public-notes';
        requestBody = {
            channel_id: currentChannelId,
            content: content
        };
    } else {
        apiUrl = '/profile/api/notes';
        requestBody = {
            content: content
        };
    }
    
    fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`保存${isPublicNote ? '公共' : '个人'}备忘录到服务器失败`);
        }
        return response.json();
    })
    .then(data => {
        console.log(`${isPublicNote ? '公共' : '个人'}备忘录已保存到服务器`);
        
        // 更新最后同步时间
        if (data && data.last_updated) {
            lastServerUpdate = data.last_updated;
        }
    })
    .catch(error => {
        console.error(`保存${isPublicNote ? '公共' : '个人'}备忘录到服务器失败:`, error);
    });
}

/**
 * 密码修改功能
 */
function initPasswordChange() {
    const changePasswordBtn = document.getElementById('change-password-btn');
    const passwordModal = document.getElementById('passwordModal');
    const closeBtn = passwordModal.querySelector('.close-btn');
    const cancelBtn = document.getElementById('cancel-password-btn');
    const saveBtn = document.getElementById('save-password-btn');
    const oldPasswordInput = document.getElementById('old-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const errorMessage = document.getElementById('password-error');
    
    changePasswordBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openPasswordModal();
        document.getElementById('profileDropdown').classList.remove('show');
    });
    
    closeBtn.addEventListener('click', closePasswordModal);
    cancelBtn.addEventListener('click', closePasswordModal);
    saveBtn.addEventListener('click', submitPasswordChange);
    
    oldPasswordInput.addEventListener('input', clearErrorMessage);
    newPasswordInput.addEventListener('input', clearErrorMessage);
    confirmPasswordInput.addEventListener('input', clearErrorMessage);
    
    [oldPasswordInput, newPasswordInput, confirmPasswordInput].forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitPasswordChange();
            }
        });
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && passwordModalActive) {
            closePasswordModal();
        }
    });
    
    passwordModal.addEventListener('click', function(e) {
        if (e.target === passwordModal) {
            closePasswordModal();
        }
    });
    
    function openPasswordModal() {
        oldPasswordInput.value = '';
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        errorMessage.textContent = '';
        
        passwordModal.style.display = 'flex';
        setTimeout(() => {
            passwordModal.classList.add('show');
            passwordModalActive = true;
            
            oldPasswordInput.focus();
        }, 10);
    }
    
    function closePasswordModal() {
        passwordModal.classList.remove('show');
        passwordModalActive = false;
        
        setTimeout(() => {
            passwordModal.style.display = 'none';
        }, 300);
    }
    
    function clearErrorMessage() {
        errorMessage.textContent = '';
    }
    
    function submitPasswordChange() {
        const oldPassword = oldPasswordInput.value.trim();
        const newPassword = newPasswordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();
        
        if (!oldPassword) {
            errorMessage.textContent = '请输入当前密码';
            oldPasswordInput.focus();
            return;
        }
        
        if (!newPassword) {
            errorMessage.textContent = '请输入新密码';
            newPasswordInput.focus();
            return;
        }
        
        if (newPassword.length < 8) {
            errorMessage.textContent = '新密码长度不能少于8个字符';
            newPasswordInput.focus();
            return;
        }
        
        if (newPassword !== confirmPassword) {
            errorMessage.textContent = '两次输入的新密码不一致';
            confirmPasswordInput.focus();
            return;
        }
        
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        changePassword(oldPassword, newPassword);
    }
    
    function changePassword(oldPassword, newPassword) {
        fetch('/profile/api/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                old_password: oldPassword,
                new_password: newPassword
            }),
        })
        .then(response => response.json())
        .then(data => {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            
            if (data.status === 'success') {
                closePasswordModal();
                showToast('密码修改成功', 'success');
            } else {
                errorMessage.textContent = data.error || '密码修改失败，请重试';
            }
        })
        .catch(error => {
            console.error('密码修改请求失败:', error);
            
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            
            errorMessage.textContent = '网络错误，请稍后重试';
        });
    }
}

/**
 * 退出登录功能
 */
function initLogout() {
    const logoutLinks = document.querySelectorAll('a[href="/profile/logout"]');
    
    logoutLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    });
}

function handleLogout() {
    const tempOverlay = document.createElement('div');
    tempOverlay.style.position = 'fixed';
    tempOverlay.style.top = '0';
    tempOverlay.style.left = '0';
    tempOverlay.style.width = '100%';
    tempOverlay.style.height = '100%';
    tempOverlay.style.backgroundColor = '#000';
    tempOverlay.style.zIndex = '10000';
    tempOverlay.style.opacity = '0';
    tempOverlay.style.transition = 'opacity 0.3s ease';
    
    document.body.appendChild(tempOverlay);
    
    void tempOverlay.offsetWidth;
    
    tempOverlay.style.opacity = '1';
    
    setTimeout(function() {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/profile/logout', false);
        try {
            xhr.send();
            
            setTimeout(function() {
                window.location.replace('/auth');
            }, 100);
        } catch (e) {
            console.error('退出请求失败:', e);
            window.location.replace('/auth');
        }
    }, 400);
}

/**
 * 便利贴置顶功能
 */
function initNotePinning() {
    const pinButton = document.getElementById('pinNoteBtn');
    const notesCard = document.getElementById('notesCard');
    const pinnedNotesContainer = document.getElementById('pinnedNotesContainer');
    const rightColumn = document.querySelector('.right-column');
    
    // 从localStorage加载置顶状态
    const isPinned = localStorage.getItem('notesPinned') === 'true';
    
    function updateNotePosition(isPinned) {
        const isMobile = window.innerWidth < 768;
        
        if (isPinned) {
            if (isMobile) {
                // 移动端：移动到左列
                pinnedNotesContainer.appendChild(notesCard);
            } else {
                // 桌面端：保持在右列
                rightColumn.appendChild(notesCard);
            }
            notesCard.classList.add('pinned');
            pinButton.classList.add('pinned');
        } else {
            // 取消置顶：移回右列
            rightColumn.appendChild(notesCard);
            notesCard.classList.remove('pinned');
            pinButton.classList.remove('pinned');
        }
    }
    
    // 初始化置顶状态
    updateNotePosition(isPinned);
    
    // 监听窗口大小变化
    window.addEventListener('resize', () => {
        if (notesCard.classList.contains('pinned')) {
            updateNotePosition(true);
        }
    });
    
    pinButton.addEventListener('click', function() {
        const willBePinned = !notesCard.classList.contains('pinned');
        updateNotePosition(willBePinned);
        
        // 保存置顶状态到localStorage
        localStorage.setItem('notesPinned', willBePinned);
        
        // 显示提示消息
        const toast = document.getElementById('toast');
        toast.textContent = willBePinned ? '便利贴已置顶' : '便利贴已取消置顶';
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    });
}

/**
 * 用户名编辑功能
 */
function initUsernameEdit() {
    const usernameDisplay = document.getElementById('username-display');
    const editableNameContainer = document.querySelector('.editable-name');
    const usernameEditContainer = document.getElementById('username-edit-container');
    const usernameInput = document.getElementById('username-input');
    const saveBtn = document.getElementById('username-save');
    const cancelBtn = document.getElementById('username-cancel');
    
    if (!usernameDisplay || !usernameEditContainer || !usernameInput || !saveBtn || !cancelBtn) {
        console.error('未找到用户名编辑所需的DOM元素');
        return;
    }
    
    // 显示编辑界面
    function showEditMode() {
        usernameEditActive = true;
        editableNameContainer.style.display = 'none';
        usernameEditContainer.style.display = 'block';
        usernameInput.value = usernameDisplay.textContent.trim();
        usernameInput.focus();
        usernameInput.select();
    }
    
    // 隐藏编辑界面
    function hideEditMode() {
        usernameEditActive = false;
        editableNameContainer.style.display = 'flex';
        usernameEditContainer.style.display = 'none';
    }
    
    // 保存用户名
    function saveUsername() {
        const newUsername = usernameInput.value.trim();
        
        if (!newUsername) {
            showToast('用户名不能为空', 'error');
            return;
        }
        
        // 如果用户名没有变化
        if (newUsername === usernameDisplay.textContent.trim()) {
            hideEditMode();
            return;
        }
        
        // 禁用保存按钮，防止重复提交
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
        
        // 显示加载状态
        usernameInput.disabled = true;
        cancelBtn.disabled = true;
        
        // 构建请求数据
        const requestData = {
            username: newUsername
        };
        console.log('正在提交用户名修改请求:', JSON.stringify(requestData));
        
        // 发送请求到后端
        fetch('/profile/api/change-username', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
            credentials: 'include' // 确保包含cookie
        })
        .then(async response => {
            console.log('用户名修改响应状态:', response.status);
            
            let text = '';
            try {
                text = await response.text();
                console.log('原始响应文本:', text);
            } catch (e) {
                console.error('读取响应文本失败:', e);
            }
            
            let json = null;
            if (text) {
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    console.error('解析响应JSON失败:', e);
                }
            }
            
            return { 
                json,
                text,
                status: response.status,
                ok: response.ok
            };
        })
        .then(result => {
            // 重置按钮状态
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            usernameInput.disabled = false;
            cancelBtn.disabled = false;
            
            // 处理错误情况
            if (!result.ok) {
                const errorMessage = result.json && result.json.error 
                    ? result.json.error 
                    : `请求失败，状态码：${result.status}`;
                    
                throw new Error(errorMessage);
            }
            
            const data = result.json || {};
            console.log('用户名修改响应数据:', data);
            
            // 响应成功 
            if (data.status === 'success' || result.ok) {
                // 更新所有显示用户名的地方
                usernameDisplay.textContent = newUsername;
                document.getElementById('info-name').textContent = newUsername;
                if (dropdownUserName) dropdownUserName.textContent = newUsername.toUpperCase();
                document.title = newUsername;
                
                // 关闭编辑模式
                hideEditMode();
                
                // 显示成功消息
                showToast('用户名修改成功', 'success');
                
                // 2秒后刷新用户信息
                setTimeout(() => {
                    fetchUserInfo();
                }, 2000);
            } else {
                showToast(data.error || '用户名修改失败', 'error');
            }
        })
        .catch(error => {
            console.error('修改用户名请求失败:', error);
            
            // 重置按钮状态
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
            usernameInput.disabled = false;
            cancelBtn.disabled = false;
            
            // 显示错误消息
            showToast(error.message || '网络错误，请稍后重试', 'error');
        });
    }
    
    // 点击用户名显示编辑框
    editableNameContainer.addEventListener('click', showEditMode);
    
    // 保存按钮
    saveBtn.addEventListener('click', saveUsername);
    
    // 取消按钮
    cancelBtn.addEventListener('click', hideEditMode);
    
    // 输入框按下回车键保存
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveUsername();
        }
    });
    
    // 点击其他区域关闭编辑框
    document.addEventListener('mousedown', function(e) {
        if (usernameEditActive && 
            !usernameEditContainer.contains(e.target) && 
            !editableNameContainer.contains(e.target)) {
            hideEditMode();
        }
    });
    
    // 按下Escape键关闭编辑框
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && usernameEditActive) {
            hideEditMode();
        }
    });
}

/**
 * 初始化便利贴类型切换功能
 */
function initNoteTypeSwitch() {
    const noteTypeToggle = document.getElementById('noteTypeToggle');
    const channelInputContainer = document.getElementById('channelInputContainer');
    const channelInput = document.getElementById('channelInput');
    const notesTextarea = document.getElementById('notes-content');
    
    if (!noteTypeToggle || !channelInputContainer || !channelInput) {
        console.error('便利贴类型切换按钮未找到');
        return;
    }
    
    // 从本地存储中加载用户的选择
    isPublicNote = localStorage.getItem('isPublicNote') === 'true';
    
    // 初始化UI状态
    noteTypeToggle.checked = isPublicNote;
    channelInputContainer.style.visibility = isPublicNote ? 'visible' : 'hidden';
    
    // 设置标签样式
    updateSwitchLabels(isPublicNote);
    
    // 加载用户频道设置
    loadUserChannelSetting();
    
    // 是否正在加载中
    let isLoading = false;
    
    // 监听频道输入变化
    channelInput.addEventListener('change', function() {
        if (isLoading) return; // 如果正在加载中，不处理新的请求
        
        const newChannelId = parseInt(this.value, 10) || 0;
        
        // 验证范围
        if (newChannelId < 0) this.value = 0;
        if (newChannelId > 9999) this.value = 9999;
        
        // 如果频道ID未变，不需要任何操作
        if (newChannelId === currentChannelId) {
            return;
        }
        
        // 进入加载状态
        isLoading = true;
        channelInput.disabled = true;
        noteTypeToggle.disabled = true;
        
        // 显示加载状态提示
        showToast('正在切换频道...');
        
        // 保存当前内容到当前频道
        if (notesTextarea && isPublicNote) {
            const currentContent = notesTextarea.value;
            localStorage.setItem(`publicNotes_${currentChannelId}`, currentContent);
            
            // 先保存当前内容
            const savePromise = new Promise((resolve) => {
                saveNotesToServer(currentContent);
                setTimeout(resolve, 500); // 给服务器一点时间来处理保存请求
            });
            
            savePromise.then(() => {
                // 更新当前频道ID
                currentChannelId = newChannelId;
                
                // 保存用户频道设置
                saveUserChannelSetting(currentChannelId);
                
                // 从新频道加载内容
                loadNoteContent().then(() => {
                    // 加载完成，恢复UI状态
                    channelInput.disabled = false;
                    noteTypeToggle.disabled = false;
                    isLoading = false;
                    
                    showToast(`已切换到频道: ${currentChannelId}`);
                }).catch(error => {
                    console.error('加载笔记内容失败:', error);
                    channelInput.disabled = false;
                    noteTypeToggle.disabled = false;
                    isLoading = false;
                    showToast('频道切换失败，请重试', 'error');
                });
            });
        } else {
            // 不是公共笔记，直接切换
            currentChannelId = newChannelId;
            saveUserChannelSetting(currentChannelId);
            channelInput.disabled = false;
            noteTypeToggle.disabled = false;
            isLoading = false;
            showToast(`已切换到频道: ${currentChannelId}`);
        }
    });
    
    // 切换便利贴类型
    noteTypeToggle.addEventListener('change', function() {
        if (isLoading) {
            // 如果正在加载中，恢复开关状态并返回
            this.checked = isPublicNote;
            return;
        }
        
        const toPublic = this.checked;
        
        // 如果状态未改变，不执行任何操作
        if ((toPublic && isPublicNote) || (!toPublic && !isPublicNote)) {
            return;
        }
        
        // 设置中间状态
        isLoading = true;
        noteTypeToggle.disabled = true;
        channelInput.disabled = true;
        
        // 将开关设置为中间状态（视觉上）
        updateSwitchToLoadingState();
        
        showToast('正在切换便利贴类型...');
        
        // 保存当前内容
        let savePromise;
        if (notesTextarea) {
            const currentContent = notesTextarea.value;
            
            if (isPublicNote) {
                // 当前是公共便利贴，需要保存到公共便利贴的存储中
                localStorage.setItem(`publicNotes_${currentChannelId}`, currentContent);
                
                // 保存当前公共便利贴内容
                savePromise = new Promise((resolve) => {
                    saveNotesToServer(currentContent);
                    setTimeout(resolve, 500);
                });
            } else {
                // 当前是个人便利贴，需要保存到个人便利贴的存储中
                localStorage.setItem('userNotes', currentContent);
                
                // 保存当前个人便利贴内容
                savePromise = new Promise((resolve) => {
                    saveNotesToServer(currentContent);
                    setTimeout(resolve, 500);
                });
            }
        } else {
            savePromise = Promise.resolve();
        }
        
        // 保存完成后再切换
        savePromise.then(() => {
            // 切换便利贴类型
            isPublicNote = toPublic;
            localStorage.setItem('isPublicNote', isPublicNote.toString());
            
            // 加载新的内容
            return loadNoteContent();
        })
        .then(() => {
            // 更新UI
            channelInputContainer.style.visibility = isPublicNote ? 'visible' : 'hidden';
            updateSwitchLabels(isPublicNote);
            noteTypeToggle.checked = isPublicNote;
            
            // 恢复UI状态
            noteTypeToggle.disabled = false;
            channelInput.disabled = false;
            isLoading = false;
            
            showToast(isPublicNote ? `切换到公共便利贴 频道:${currentChannelId}` : '切换到个人便利贴');
        })
        .catch(error => {
            console.error('切换便利贴类型失败:', error);
            // 恢复原始状态
            noteTypeToggle.checked = isPublicNote;
            updateSwitchLabels(isPublicNote);
            noteTypeToggle.disabled = false;
            channelInput.disabled = false;
            isLoading = false;
            showToast('切换便利贴类型失败，请重试', 'error');
        });
    });
    
    // 加载笔记内容的函数
    function loadNoteContent() {
        return new Promise((resolve, reject) => {
            if (!notesTextarea) {
                resolve();
                return;
            }
            
            let apiUrl = isPublicNote
                ? `/profile/api/public-notes?channel=${currentChannelId}`
                : '/profile/api/notes';
                
            fetch(apiUrl)
                .then(response => {
                    if (response.ok) {
                        return response.json();
                    } else if (response.status === 404) {
                        return { content: '', last_updated: 0 };
                    } else {
                        throw new Error('加载笔记内容失败');
                    }
                })
                .then(data => {
                    if (notesTextarea) {
                        notesTextarea.value = data.content || '';
                    }
                    
                    if (isPublicNote) {
                        localStorage.setItem(`publicNotes_${currentChannelId}`, data.content || '');
                    } else {
                        localStorage.setItem('userNotes', data.content || '');
                    }
                    
                    // 更新最后同步时间
                    lastServerUpdate = data.last_updated || 0;
                    
                    // 确保重新开始同步
                    if (syncInterval) {
                        clearInterval(syncInterval);
                    }
                    startAutoSync(notesTextarea);
                    
                    console.log(`从服务器加载${isPublicNote ? '公共' : '个人'}备忘录成功，频道ID：${currentChannelId}`);
                    resolve();
                })
                .catch(error => {
                    console.error('加载笔记内容失败:', error);
                    
                    // 尝试使用本地存储
                    let savedNotes = '';
                    
                    if (isPublicNote) {
                        savedNotes = localStorage.getItem(`publicNotes_${currentChannelId}`);
                    } else {
                        savedNotes = localStorage.getItem('userNotes');
                    }
                    
                    if (notesTextarea) {
                        notesTextarea.value = savedNotes || '';
                    }
                    
                    // 需要在失败时也继续操作，所以这里用resolve而不是reject
                    resolve();
                });
        });
    }
    
    // 设置开关为加载状态
    function updateSwitchToLoadingState() {
        const switchLabels = document.querySelectorAll('.note-type-switch .switch-label');
        if (switchLabels.length < 2) return;
        
        const personalLabel = switchLabels[0];
        const publicLabel = switchLabels[1];
        
        // 清除所有样式类
        personalLabel.classList.remove('active', 'inactive');
        publicLabel.classList.remove('active', 'inactive');
        
        // 设置加载中样式
        personalLabel.classList.add('loading');
        publicLabel.classList.add('loading');
        
        // 设置开关滑块在中间的样式（可以通过CSS来控制）
        const switchSlider = document.querySelector('.note-type-switch .slider');
        if (switchSlider) {
            switchSlider.classList.add('loading');
        }
        
        // 2秒后自动恢复，以防加载出错
        setTimeout(() => {
            personalLabel.classList.remove('loading');
            publicLabel.classList.remove('loading');
            if (switchSlider) {
                switchSlider.classList.remove('loading');
            }
        }, 5000);
    }
}

/**
 * 加载用户频道设置
 */
function loadUserChannelSetting() {
    fetch('/profile/api/channel-setting')
        .then(response => {
            if (response.ok) {
                return response.json();
            } else if (response.status === 404) {
                return { channel_id: 0 };
            } else {
                throw new Error('获取频道设置失败');
            }
        })
        .then(data => {
            currentChannelId = data.channel_id || 0;
            const channelInput = document.getElementById('channelInput');
            if (channelInput) {
                channelInput.value = currentChannelId;
            }
            console.log('加载用户频道设置成功:', currentChannelId);
        })
        .catch(error => {
            console.error('加载用户频道设置失败:', error);
            // 使用默认值或本地存储的值
            currentChannelId = parseInt(localStorage.getItem('channelId') || '0');
            const channelInput = document.getElementById('channelInput');
            if (channelInput) {
                channelInput.value = currentChannelId;
            }
        });
}

/**
 * 保存用户频道设置
 */
function saveUserChannelSetting(channelId) {
    // 保存到本地存储作为备份
    localStorage.setItem('channelId', channelId);
    
    fetch('/profile/api/channel-setting', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channel_id: channelId }),
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('保存频道设置失败');
        }
        return response.json();
    })
    .then(data => {
        console.log('保存用户频道设置成功');
    })
    .catch(error => {
        console.error('保存用户频道设置失败:', error);
    });
}

// 添加处理切换开关标签样式的JS代码
function updateSwitchLabels(isPublicNote) {
    // 获取标签元素
    const switchLabels = document.querySelectorAll('.note-type-switch .switch-label');
    if (switchLabels.length < 2) return;
    
    const personalLabel = switchLabels[0];
    const publicLabel = switchLabels[1];
    
    // 清除所有样式类
    personalLabel.classList.remove('active', 'inactive', 'loading');
    publicLabel.classList.remove('active', 'inactive', 'loading');
    
    // 清除滑块的加载状态
    const switchSlider = document.querySelector('.note-type-switch .slider');
    if (switchSlider) {
        switchSlider.classList.remove('loading');
    }
    
    // 设置对应样式
    if (isPublicNote) {
        personalLabel.classList.remove('active');
        personalLabel.classList.add('inactive');
        publicLabel.classList.add('active');
        publicLabel.classList.remove('inactive');
    } else {
        personalLabel.classList.add('active');
        personalLabel.classList.remove('inactive');
        publicLabel.classList.remove('active');
        publicLabel.classList.add('inactive');
    }
} 