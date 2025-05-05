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

/**
 * 页面初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    handleSessionCheck();
    initData();
    initUI();
    initPasswordChange();
    initLogout();
    initNotePinning();

    const notesTextarea = document.getElementById('notes-content');
    if (!notesTextarea) {
        console.error('便利贴文本框未找到');
        return;
    }

    let saveTimeout;

    // 从服务器加载备忘录
    const loadNotes = () => {
        fetch('/profile/api/notes')
            .then(response => {
                if (response.ok) {
                    return response.json();
                } else if (response.status === 404) {
                    return { content: localStorage.getItem('userNotes') || '' };
                } else {
                    throw new Error('获取备忘录失败');
                }
            })
            .then(data => {
                notesTextarea.value = data.content;
                localStorage.setItem('userNotes', data.content);
                console.log('从服务器加载备忘录成功');
                
                if (data.last_updated) {
                    lastServerUpdate = data.last_updated;
                }
                
                startAutoSync(notesTextarea);
            })
            .catch(error => {
                console.error('加载备忘录失败:', error);
                const savedNotes = localStorage.getItem('userNotes');
                if (savedNotes) {
                    notesTextarea.value = savedNotes;
                }
                
                startAutoSync(notesTextarea);
            });
    };

    // 自动保存功能
    const autoSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const notes = notesTextarea.value;
            localStorage.setItem('userNotes', notes);
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
        localStorage.setItem('userNotes', notes);
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
        localStorage.setItem('userNotes', notes);
        
        if (syncInterval) {
            clearInterval(syncInterval);
        }
    });
});

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
    
    document.getElementById('user-name').textContent = username;
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

function startAutoSync(textarea) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    syncInterval = setInterval(() => {
        syncNotesFromServer(textarea);
    }, 10000);
    
    console.log('已启动备忘录自动同步 (10秒)');
}

function syncNotesFromServer(textarea) {
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
                return null;
            } else {
                throw new Error('同步备忘录失败，状态码: ' + response.status);
            }
        })
        .then(data => {
            if (!data) return;
            
            if (data.last_updated && data.last_updated > lastServerUpdate) {
                console.log('发现新的服务器备忘录内容，正在更新...');
                lastServerUpdate = data.last_updated;
                
                if (textarea.value !== data.content) {
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
        if (data && data.last_updated) {
            lastServerUpdate = data.last_updated;
        }
    })
    .catch(error => {
        console.error('保存备忘录到服务器失败:', error);
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