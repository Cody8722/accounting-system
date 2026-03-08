/**
 * PWA 功能模組 - 處理 PWA 安裝提示和 Service Worker
 *
 * 功能：
 * - Android PWA 安裝提示（beforeinstallprompt）
 * - iOS PWA 安裝提示（手動指引）
 * - Service Worker 註冊和更新管理
 * - 獨立模式檢測
 * - 網路狀態監聽與離線佇列同步
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';

// 注入 slideInRight / slideOutRight 動畫（供 showNetworkStatus 使用）
(function injectNetworkAnimationStyles() {
    if (document.getElementById('pwa-network-styles')) return;
    const style = document.createElement('style');
    style.id = 'pwa-network-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(110%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0);    opacity: 1; }
            to   { transform: translateX(110%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
})();

/**
 * Android 安裝提示事件
 */
let androidInstallPromptEvent = null;

/**
 * 待處理的 Service Worker 更新
 */
let pendingUpdate = false;

/**
 * 檢測是否為 iOS 設備
 * @returns {boolean}
 */
export function isIOS() {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
}

/**
 * 檢測是否在獨立模式（PWA 已安裝）
 * @returns {boolean}
 */
export function isInStandaloneMode() {
    // iOS Safari：navigator.standalone = true 表示已加入主畫面
    if ('standalone' in window.navigator && window.navigator.standalone) return true;

    // 現代瀏覽器（含 iOS 16.4+ PWA）：display-mode: standalone
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;

    return false;
}

/**
 * 判斷是否應顯示 Android 安裝提示
 * @returns {boolean}
 */
function shouldShowAndroidPrompt() {
    if (!androidInstallPromptEvent) return false;
    if (isInStandaloneMode()) return false;

    const lastDismissed = localStorage.getItem('androidPromptDismissed');
    if (lastDismissed) {
        const parsed = parseInt(lastDismissed, 10);
        if (!isNaN(parsed) && (Date.now() - parsed) / (1000 * 60 * 60 * 24) < 7) return false;
    }

    return true;
}

/**
 * 顯示 Android 安裝提示
 */
export function showAndroidInstallPrompt() {
    if (shouldShowAndroidPrompt()) {
        setTimeout(() => {
            const prompt = document.getElementById('android-install-prompt');
            if (prompt) prompt.classList.remove('hidden');
        }, 3000); // 3秒後顯示
    }
}

/**
 * 關閉 Android 安裝提示
 */
export function dismissAndroidPrompt() {
    const prompt = document.getElementById('android-install-prompt');
    if (prompt) prompt.classList.add('hidden');
    localStorage.setItem('androidPromptDismissed', Date.now().toString());
}

/**
 * 觸發 Android 安裝
 */
export async function triggerAndroidInstall() {
    if (!androidInstallPromptEvent) return;

    dismissAndroidPrompt();
    androidInstallPromptEvent.prompt();

    const choiceResult = await androidInstallPromptEvent.userChoice;
    console.log('User choice:', choiceResult.outcome);

    androidInstallPromptEvent = null;
}

/**
 * 判斷是否應顯示 iOS 安裝提示
 * @returns {boolean}
 */
function shouldShowIOSPrompt() {
    // 1. 必須是 iOS 設備
    if (!isIOS()) return false;

    // 2. 不在獨立模式（已安裝）
    if (isInStandaloneMode()) return false;

    // 3. 檢查是否已經關閉過提示（7天內不再顯示）
    const lastDismissed = localStorage.getItem('iosPromptDismissed');
    if (lastDismissed) {
        const parsed = parseInt(lastDismissed, 10);
        if (!isNaN(parsed)) {
            const daysSinceDismissed = (Date.now() - parsed) / (1000 * 60 * 60 * 24);
            if (daysSinceDismissed < 7) return false;
        }
    }

    return true;
}

/**
 * 顯示 iOS 安裝提示
 */
export function showIOSInstallPrompt() {
    if (shouldShowIOSPrompt()) {
        setTimeout(() => {
            const prompt = document.getElementById('ios-install-prompt');
            if (prompt) {
                prompt.classList.remove('hidden');
            }
        }, 3000); // 3秒後顯示
    }
}

/**
 * 關閉 iOS 安裝提示
 */
export function dismissIOSPrompt() {
    const prompt = document.getElementById('ios-install-prompt');
    if (prompt) {
        prompt.classList.add('hidden');
        localStorage.setItem('iosPromptDismissed', Date.now().toString());
    }
}

/**
 * 註冊 Service Worker
 */
export function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then((registration) => {
                    console.log('✅ Service Worker 註冊成功:', registration.scope);

                    // 檢查更新
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        console.log('🔄 發現新版 Service Worker');

                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // 有新版本等待接管
                                pendingUpdate = true;
                                console.log('⚠️ 新版本已就緒，等待接管');
                                showUpdateNotification();
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.error('❌ Service Worker 註冊失敗:', error);
                });

            // 監聽 Service Worker 接管事件
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (pendingUpdate) {
                    console.log('🔄 Service Worker 已更新，重新載入頁面');
                    window.location.reload();
                }
            });
        });
    }
}

/**
 * 顯示更新通知
 */
function showUpdateNotification() {
    // 可以在這裡添加自定義的更新提示 UI
    console.log('💡 提示用戶有新版本可用');

    // 簡單的確認對話框
    if (confirm('發現新版本！是否立即更新？')) {
        skipWaitingAndReload();
    }
}

/**
 * 跳過等待並重新載入
 */
function skipWaitingAndReload() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
}

/**
 * 顯示網路狀態浮動通知
 * @param {string} message - 通知文字
 * @param {'success'|'warning'|'info'} type - 通知類型
 */
export function showNetworkStatus(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 500;
        z-index: 10000;
        animation: slideInRight 0.3s ease-out;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    `;

    const colors = { success: '#10b981', warning: '#f59e0b', info: '#667eea' };
    notification.style.background = colors[type] || colors.info;

    const icon = type === 'success' ? 'check-circle' : 'exclamation-triangle';
    notification.innerHTML = `<i class="fas fa-${icon} mr-2"></i>${message}`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

/**
 * 連線恢復時同步離線佇列
 * 使用 MessageChannel 通知 Service Worker；iOS 不支援時降級為直接重新載入
 */
function syncOfflineQueue() {
    if (!navigator.serviceWorker.controller) return;

    try {
        const messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = (event) => {
            if (event.data.success) {
                console.log('✅ 離線記錄同步完成');
                showNetworkStatus('離線記錄已同步', 'success');
                EventBus.emit(EVENTS.NETWORK_SYNC_COMPLETE);
                // 通知 records 模組重新載入
                EventBus.emit(EVENTS.RECORDS_LOADED);
            } else {
                console.error('❌ 同步失敗:', event.data.error);
                EventBus.emit(EVENTS.NETWORK_SYNC_FAILED, event.data.error);
            }
        };

        navigator.serviceWorker.controller.postMessage(
            { type: 'SYNC_OFFLINE_QUEUE' },
            [messageChannel.port2]
        );
    } catch (err) {
        // iOS PWA 降級：直接觸發記錄重新載入
        console.warn('MessageChannel 不支援，降級為重新載入記錄:', err);
        setTimeout(() => EventBus.emit(EVENTS.RECORDS_LOADED), 1500);
    }

    // 同時嘗試 Background Sync（不強制依賴）
    navigator.serviceWorker.ready
        .then((reg) => {
            if ('sync' in reg) {
                return reg.sync.register('sync-offline-queue');
            }
        })
        .catch((err) => console.log('Background Sync 不支援:', err));
}

/**
 * 初始化網路狀態監聽（online / offline 事件）
 */
function initNetworkListeners() {
    window.addEventListener('online', () => {
        console.log('📡 網路連線恢復');
        showNetworkStatus('已連線，正在同步記錄...', 'success');
        EventBus.emit(EVENTS.NETWORK_ONLINE);
        syncOfflineQueue();
    });

    window.addEventListener('offline', () => {
        console.log('📴 網路連線中斷');
        showNetworkStatus('離線模式：記錄將在連線後同步', 'warning');
        EventBus.emit(EVENTS.NETWORK_OFFLINE);
    });
}

/**
 * 初始化 PWA 模組
 */
export function initPWA() {
    // 監聽 beforeinstallprompt 事件（Android）
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault(); // 阻止瀏覽器自動顯示
        androidInstallPromptEvent = e;
        console.log('📱 Android 安裝提示事件已捕獲');
    });

    // 監聽安裝完成事件
    window.addEventListener('appinstalled', () => {
        androidInstallPromptEvent = null;
        const prompt = document.getElementById('android-install-prompt');
        if (prompt) prompt.classList.add('hidden');
        console.log('✅ PWA 已安裝');
    });

    // 註冊 Service Worker
    registerServiceWorker();

    // 初始化網路狀態監聽
    initNetworkListeners();

    // 暴露到全局（供 HTML onclick 使用）
    window.showAndroidInstallPrompt = showAndroidInstallPrompt;
    window.dismissAndroidPrompt = dismissAndroidPrompt;
    window.triggerAndroidInstall = triggerAndroidInstall;
    window.showIOSInstallPrompt = showIOSInstallPrompt;
    window.dismissIOSPrompt = dismissIOSPrompt;
    window.isInStandaloneMode = isInStandaloneMode;
    window.showNetworkStatus = showNetworkStatus;

    console.log('✅ [PWA] PWA 功能模組已初始化（含網路狀態監聽）');
}
