/**
 * 主題模組 - 手動切換深色/淺色/跟隨系統
 *
 * 功能：
 * - setTheme(theme)：切換主題並儲存到 localStorage
 * - updateThemeUI(theme)：更新設定頁按鈕高亮狀態
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';

/**
 * 設定主題
 * @param {string} theme - 'light' | 'dark' | 'system'
 */
export function setTheme(theme) {
    document.documentElement.classList.remove('dark', 'light');
    if (theme === 'system') {
        const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.add(sysDark ? 'dark' : 'light');
    } else {
        document.documentElement.classList.add(theme);
    }
    localStorage.setItem('theme', theme);
    updateThemeUI(theme);
}

/**
 * 更新設定頁外觀按鈕的高亮狀態
 * @param {string} theme - 'light' | 'dark' | 'system'
 */
export function updateThemeUI(theme) {
    ['light', 'dark', 'system'].forEach(t => {
        const btn = document.getElementById(`theme-btn-${t}`);
        if (!btn) return;
        if (t === theme) {
            btn.classList.add('bg-purple-600', 'text-white');
            btn.classList.remove('bg-gray-100', 'text-gray-600');
        } else {
            btn.classList.remove('bg-purple-600', 'text-white');
            btn.classList.add('bg-gray-100', 'text-gray-600');
        }
    });
}

/**
 * 初始化主題模組
 */
export function initTheme() {
    // 暴露到 window 供 HTML onclick 使用
    window.setTheme = setTheme;

    // 切換到設定頁時更新按鈕高亮
    EventBus.on(EVENTS.PAGE_LOAD, (pageName) => {
        if (pageName === 'settings') {
            updateThemeUI(localStorage.getItem('theme') || 'system');
        }
    });

    // 系統主題變更時即時更新（僅在跟隨系統模式下）
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const t = localStorage.getItem('theme');
        if (!t || t === 'system') {
            document.documentElement.classList.remove('dark', 'light');
            document.documentElement.classList.add(e.matches ? 'dark' : 'light');
        }
    });

    console.log('✅ [Theme] 主題模組已初始化');
}
