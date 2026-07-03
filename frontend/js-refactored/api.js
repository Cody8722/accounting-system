/**
 * API 調用模組 - 統一的後端 API 調用介面
 *
 * 功能：
 * - Token 管理（localStorage）
 * - 自動添加 Authorization header
 * - 401 錯誤處理
 * - 統一錯誤處理
 */

import { backendUrl } from './config.js';

/**
 * 防止重複處理 401 錯誤的標誌
 */
let is401Handling = false;

/**
 * 取得認證 Token
 * @returns {string} Token 字串
 */
export function getAuthToken() {
    return localStorage.getItem('authToken') || '';
}

/**
 * 儲存認證 Token
 * @param {string} token - Token 字串
 */
export function setAuthToken(token) {
    localStorage.setItem('authToken', token);
}

/**
 * 移除認證 Token 和用戶資料
 */
export function removeAuthToken() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
}

/**
 * 統一的 API 調用函數
 * - 自動添加 Authorization header
 * - 自動處理 401 錯誤
 * @param {string} url - API 端點 URL
 * @param {object} options - fetch 選項
 * @returns {Promise<Response>} fetch Response 物件
 */
export async function apiCall(url, options = {}) {
    const token = getAuthToken();
    const headers = {
        ...options.headers,
        'Content-Type': 'application/json'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        // 如果返回 401，且是有 token 的請求（非登入/註冊），才當作過期處理
        if (response.status === 401 && getAuthToken()) {
            removeAuthToken();
            // 防止多個同時發出的請求重複觸發處理
            if (!is401Handling) {
                is401Handling = true;
                console.warn('⚠️ [API] 登入已過期');
                // 發送事件通知（讓其他模組處理）
                window.dispatchEvent(new CustomEvent('auth:token-invalid'));
                // 5秒後重置標誌
                setTimeout(() => { is401Handling = false; }, 5000);
            }
            throw new Error('登入已過期，請重新登入');
        }

        return response;
    } catch (error) {
        console.error('❌ [API] 調用失敗:', error);
        throw error;
    }
}

/**
 * 快速 API 調用（自動加上 backendUrl）
 * @param {string} endpoint - API 端點（如 '/api/records'）
 * @param {object} options - fetch 選項
 * @returns {Promise<Response>} fetch Response 物件
 */
export async function api(endpoint, options = {}) {
    const url = `${backendUrl}${endpoint}`;
    return apiCall(url, options);
}

/**
 * 取得用戶資料
 * @returns {object|null} 用戶資料物件
 */
export function getUserData() {
    const data = localStorage.getItem('userData');
    return data ? JSON.parse(data) : null;
}

/**
 * 儲存用戶資料
 * @param {object} data - 用戶資料物件
 */
export function setUserData(data) {
    localStorage.setItem('userData', JSON.stringify(data));
}

// 開發環境下輸出 API 配置
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log('🌐 [API] 後端 URL:', backendUrl);
    console.log('🔑 [API] Token 存在:', !!getAuthToken());
}
