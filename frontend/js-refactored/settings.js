/**
 * 個人設定模組 - 處理使用者資料和密碼修改
 *
 * 功能：
 * - 載入使用者資料
 * - 修改使用者名稱
 * - 修改密碼（含強度驗證）
 * - 密碼強度即時檢查
 *
 * 使用事件驅動架構解耦依賴
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall } from './api.js';
import { backendUrl } from './config.js';
import { showToast, escapeHtml } from './utils.js';

/**
 * 切換修改使用者名稱表單
 * @param {boolean} show - 是否顯示
 */
export function toggleEditName(show) {
    const section = document.getElementById('edit-name-section');
    const input = document.getElementById('edit-name-input');
    const errorEl = document.getElementById('edit-name-error');

    if (show) {
        section.classList.remove('hidden');
        const currentName = document.getElementById('user-name-display').textContent;
        if (input && currentName !== '-') {
            input.value = currentName;
        }
        input?.focus();
    } else {
        section.classList.add('hidden');
        if (input) input.value = '';
        if (errorEl) errorEl.classList.add('hidden');
    }
}

/**
 * 儲存使用者名稱
 */
export async function saveProfileName() {
    const input = document.getElementById('edit-name-input');
    const errorEl = document.getElementById('edit-name-error');
    const newName = input?.value.trim();

    // 驗證
    if (!newName) {
        if (errorEl) {
            errorEl.textContent = '使用者名稱不能為空';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (newName.length > 50) {
        if (errorEl) {
            errorEl.textContent = '使用者名稱不能超過 50 個字元';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const response = await apiCall(`${backendUrl}/api/user/profile`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '更新失敗');

        // 更新顯示
        const displayEl = document.getElementById('user-name-display');
        if (displayEl) displayEl.textContent = escapeHtml(newName);

        // 更新右上角使用者名稱
        const userDisplayEl = document.getElementById('user-display');
        if (userDisplayEl) userDisplayEl.textContent = escapeHtml(newName);

        showToast('使用者名稱更新成功', 'success');
        toggleEditName(false);

        // 發送使用者資料更新事件
        EventBus.emit(EVENTS.USER_PROFILE_UPDATED, { name: newName });

    } catch (error) {
        console.error('更新使用者名稱失敗:', error);
        if (errorEl) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        }
    }
}

/**
 * 切換修改密碼表單
 * @param {boolean} show - 是否顯示
 */
export function toggleChangePassword(show) {
    const section = document.getElementById('change-password-section');
    const currentPwdInput = document.getElementById('current-password-input');
    const newPwdInput = document.getElementById('new-password-input');
    const confirmPwdInput = document.getElementById('confirm-password-input');
    const errorEl = document.getElementById('change-password-error');
    const checker = document.getElementById('change-password-strength-checker');

    if (show) {
        section.classList.remove('hidden');
        currentPwdInput?.focus();

        // 監聽新密碼輸入，顯示強度檢查器
        if (newPwdInput) {
            newPwdInput.addEventListener('input', handlePasswordStrengthCheck);
        }
    } else {
        section.classList.add('hidden');
        if (checker) checker.classList.add('hidden');
        if (currentPwdInput) currentPwdInput.value = '';
        if (newPwdInput) newPwdInput.value = '';
        if (confirmPwdInput) confirmPwdInput.value = '';
        if (errorEl) errorEl.classList.add('hidden');
    }
}

/**
 * 處理密碼強度檢查（即時驗證）
 */
function handlePasswordStrengthCheck() {
    const newPwd = document.getElementById('new-password-input')?.value || '';
    const checker = document.getElementById('change-password-strength-checker');

    if (!newPwd) {
        if (checker) checker.classList.add('hidden');
        return;
    }

    if (checker) checker.classList.remove('hidden');

    // 基本檢查項目
    const checks = {
        length: newPwd.length >= 12,
        uppercase: /[A-Z]/.test(newPwd),
        lowercase: /[a-z]/.test(newPwd),
        digit: /[0-9]/.test(newPwd),
        special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPwd),
        repeating: !(/(.)\1{2,}/.test(newPwd)), // 無 3 個以上重複字符
        sequential: !(/abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789/i.test(newPwd)),
        keyboard: !(/qwer|asdf|zxcv|qaz|wsx|edc/i.test(newPwd)),
        common: !(/password|123456|admin|user|test/i.test(newPwd)),
        personal: true, // 簡化版，實際需要檢查 email/name
        pinyin: !(/zhang|wang|li|zhao|chen|yang/i.test(newPwd)),
        math: true, // 簡化版
        entropy: newPwd.length >= 12 // 簡化版
    };

    // 更新檢查項目顯示
    Object.keys(checks).forEach(key => {
        const el = document.getElementById(`change-check-${key}`);
        if (el) {
            const icon = el.querySelector('i');
            if (checks[key]) {
                icon.className = 'fas fa-check-circle text-green-500 mr-1.5';
            } else {
                icon.className = 'fas fa-times-circle text-red-500 mr-1.5';
            }
        }
    });

    // 計算強度
    const passedCount = Object.values(checks).filter(v => v).length;
    const strengthPercent = (passedCount / Object.keys(checks).length) * 100;

    const progressBar = document.getElementById('change-strength-progress');
    const strengthText = document.getElementById('change-strength-text');

    if (progressBar) {
        progressBar.style.width = `${strengthPercent}%`;

        if (strengthPercent < 40) {
            progressBar.className = 'h-full bg-red-500 transition-all duration-300';
            if (strengthText) strengthText.textContent = '弱';
        } else if (strengthPercent < 70) {
            progressBar.className = 'h-full bg-yellow-500 transition-all duration-300';
            if (strengthText) strengthText.textContent = '中';
        } else {
            progressBar.className = 'h-full bg-green-500 transition-all duration-300';
            if (strengthText) strengthText.textContent = '強';
        }
    }
}

/**
 * 儲存新密碼
 */
export async function saveNewPassword() {
    const currentPwd = document.getElementById('current-password-input')?.value;
    const newPwd = document.getElementById('new-password-input')?.value;
    const confirmPwd = document.getElementById('confirm-password-input')?.value;
    const errorEl = document.getElementById('change-password-error');

    // 基本驗證
    if (!currentPwd || !newPwd || !confirmPwd) {
        if (errorEl) {
            errorEl.textContent = '請填寫所有欄位';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (newPwd !== confirmPwd) {
        if (errorEl) {
            errorEl.textContent = '新密碼與確認密碼不符';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (newPwd.length < 12) {
        if (errorEl) {
            errorEl.textContent = '新密碼至少需要 12 個字元';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const response = await apiCall(`${backendUrl}/api/user/password`, {
            method: 'PUT',
            body: JSON.stringify({
                current_password: currentPwd,
                new_password: newPwd
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '修改失敗');

        showToast('密碼修改成功', 'success');
        toggleChangePassword(false);

        // 發送密碼修改完成事件
        EventBus.emit(EVENTS.USER_PASSWORD_CHANGED);

    } catch (error) {
        console.error('修改密碼失敗:', error);
        if (errorEl) {
            errorEl.textContent = error.message;
            errorEl.classList.remove('hidden');
        }
    }
}

/**
 * 載入使用者資料
 */
export async function loadUserProfile() {
    try {
        const response = await apiCall(`${backendUrl}/api/user/profile`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || '載入失敗');

        // 更新顯示
        const nameDisplay = document.getElementById('user-name-display');
        const emailDisplay = document.getElementById('user-email-display');

        if (nameDisplay) nameDisplay.textContent = escapeHtml(data.name || '-');
        if (emailDisplay) emailDisplay.textContent = escapeHtml(data.email || '-');

    } catch (error) {
        console.error('載入使用者資料失敗:', error);
    }
}

/**
 * 初始化設定模組
 */
export function initSettings() {
    // 監聽頁面載入事件
    EventBus.on(EVENTS.PAGE_LOAD, ({ page }) => {
        if (page === 'settings') {
            loadUserProfile();
        }
    });

    // 暴露到全局（供 HTML onclick 使用）
    window.toggleEditName = toggleEditName;
    window.saveProfileName = saveProfileName;
    window.toggleChangePassword = toggleChangePassword;
    window.saveNewPassword = saveNewPassword;

    console.log('✅ [Settings] 個人設定模組已初始化');
}
