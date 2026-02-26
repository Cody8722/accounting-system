/**
 * PWA 功能模組 - 處理 PWA 安裝提示和 Service Worker
 *
 * 功能：
 * - Android PWA 安裝提示（beforeinstallprompt）
 * - iOS PWA 安裝提示（手動指引）
 * - Service Worker 註冊和更新管理
 * - 獨立模式檢測
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';

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

    // 暴露到全局（供 HTML onclick 使用）
    window.showAndroidInstallPrompt = showAndroidInstallPrompt;
    window.dismissAndroidPrompt = dismissAndroidPrompt;
    window.triggerAndroidInstall = triggerAndroidInstall;
    window.showIOSInstallPrompt = showIOSInstallPrompt;
    window.dismissIOSPrompt = dismissIOSPrompt;
    window.isInStandaloneMode = isInStandaloneMode;

    console.log('✅ [PWA] PWA 功能模組已初始化');
}
