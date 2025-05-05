// 便利贴置顶功能
document.addEventListener('DOMContentLoaded', function() {
    const pinCheckbox = document.getElementById('pin-note');
    const notesCard = document.querySelector('.card-notes');
    
    // 从本地存储加载置顶状态
    const isPinned = localStorage.getItem('notesPinned') === 'true';
    pinCheckbox.checked = isPinned;
    if (isPinned) {
        notesCard.classList.add('pinned');
    }
    
    // 监听置顶状态变化
    pinCheckbox.addEventListener('change', function() {
        const isPinned = this.checked;
        localStorage.setItem('notesPinned', isPinned);
        
        if (isPinned) {
            notesCard.classList.add('pinned');
        } else {
            notesCard.classList.remove('pinned');
        }
    });
}); 