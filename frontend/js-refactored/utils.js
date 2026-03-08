/**
 * 工具函數模組 - 提供通用的輔助功能
 *
 * 功能：
 * - HTML 轉義
 * - Toast 通知系統
 * - 確認對話框
 */

/**
 * HTML 轉義函數
 * 防止 XSS 攻擊
 * @param {string} text - 要轉義的文字
 * @returns {string} 轉義後的 HTML 字符串
 */
export function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 顯示 Toast 通知
 * @param {string} message - 通知訊息
 * @param {string} type - 通知類型 ('success' | 'warning' | 'error' | 'info')
 * @param {number} duration - 顯示時間（毫秒）
 */
export function showToast(message, type = 'info', duration = 4000) {
    const colors = {
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#667eea'
    };
    const icons = {
        success: 'check-circle',
        warning: 'exclamation-triangle',
        error: 'times-circle',
        info: 'info-circle'
    };

    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed', 'top:20px', 'right:20px', 'max-width:320px',
        'padding:14px 18px', 'border-radius:10px', 'color:#fff',
        'font-size:14px', 'font-weight:500', 'line-height:1.4',
        'z-index:99999', 'box-shadow:0 6px 20px rgba(0,0,0,.18)',
        'display:flex', 'align-items:flex-start', 'gap:10px',
        `background:${colors[type] || colors.info}`,
        /* iOS safe-area */
        `top:calc(20px + env(safe-area-inset-top))`,
        `right:calc(16px + env(safe-area-inset-right))`,
        'transition:opacity .3s ease'
    ].join(';');
    toast.innerHTML = `<i class="fas fa-${icons[type] || icons.info}" style="margin-top:2px;flex-shrink:0"></i><span>${message}</span>`;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

/**
 * 顯示確認對話框（非阻塞式，PWA 友好）
 * @param {string} message - 確認訊息
 * @param {string} confirmText - 確定按鈕文字
 * @param {string} cancelText - 取消按鈕文字
 * @param {boolean} danger - 是否為危險操作（紅色按鈕）
 * @returns {Promise<boolean>} 使用者選擇（true: 確定, false: 取消）
 */
export function showConfirm(message, confirmText = '確定', cancelText = '取消', danger = true) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.5)',
            'z-index:99998', 'display:flex', 'align-items:center',
            'justify-content:center',
            'padding:16px'
        ].join(';');

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const confirmColor = danger ? '#ef4444' : '#667eea';
        const bgColor = isDark ? '#1f2937' : '#fff';
        const textColor = isDark ? '#f9fafb' : '#374151';
        const cancelBg = isDark ? '#374151' : '#fff';
        const cancelTextColor = isDark ? '#d1d5db' : '#6b7280';
        const cancelBorder = isDark ? '#4b5563' : '#e5e7eb';

        overlay.innerHTML = `
            <div style="background:${bgColor};width:100%;max-width:400px;border-radius:16px;padding:24px 20px;box-shadow:0 20px 40px rgba(0,0,0,0.2)">
                <p style="text-align:center;font-size:16px;color:${textColor};margin-bottom:20px;line-height:1.5">${message}</p>
                <div style="display:flex;gap:12px">
                    <button id="sc-cancel" style="flex:1;padding:13px;border:1px solid ${cancelBorder};border-radius:10px;background:${cancelBg};font-size:15px;color:${cancelTextColor};cursor:pointer">${cancelText}</button>
                    <button id="sc-ok" style="flex:1;padding:13px;border:none;border-radius:10px;background:${confirmColor};color:#fff;font-size:15px;font-weight:600;cursor:pointer">${confirmText}</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        const close = (result) => {
            overlay.remove();
            resolve(result);
        };

        overlay.querySelector('#sc-ok').addEventListener('click', () => close(true));
        overlay.querySelector('#sc-cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close(false);
        });
    });
}
