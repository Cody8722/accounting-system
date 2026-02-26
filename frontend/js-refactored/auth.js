/**
 * 認證模組 - 處理登入、註冊、登出、密碼管理等功能
 *
 * 功能：
 * - 登入/註冊模態框管理
 * - 登入/註冊表單處理
 * - 忘記密碼/重設密碼
 * - 個人資料修改
 * - 登出處理
 * - 密碼強度即時驗證
 */

import { EventBus, EVENTS } from './events.js';
import { apiCall, api, getAuthToken, setAuthToken, removeAuthToken, getUserData, setUserData } from './api.js';
import { backendUrl } from './config.js';
import { showToast, showConfirm } from './utils.js';

// 防止重複處理 401 的標誌（從 api.js 移過來）
let is401Handling = false;

/**
 * 重設密碼的 token（從 URL 獲取）
 */
let _resetToken = null;

/**
 * 認證狀態標誌
 */
let isAuthenticated = false;

/**
 * 顯示登入模態框
 */
export function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    if (!loginModal) return;

    // 若 modal 已經顯示中，不重置表單（避免清掉使用者正在輸入的密碼）
    const alreadyVisible = !loginModal.classList.contains('hidden');
    loginModal.classList.remove('hidden');
    if (registerModal) registerModal.classList.add('hidden');

    const forgotModal = document.getElementById('forgot-password-modal');
    const resetModal = document.getElementById('reset-password-modal');
    if (forgotModal) forgotModal.classList.add('hidden');
    if (resetModal) resetModal.classList.add('hidden');

    if (loginError) loginError.classList.add('hidden');

    if (!alreadyVisible && loginForm) {
        loginForm.reset();
        // 載入記住的帳號
        const rememberedEmail = localStorage.getItem('rememberedEmail');
        const rememberCheckbox = document.getElementById('remember-me');
        if (rememberedEmail) {
            const emailInput = document.getElementById('login-email');
            if (emailInput) emailInput.value = rememberedEmail;
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
    }

    EventBus.emit(EVENTS.AUTH_MODAL_OPENED, { type: 'login' });
}

/**
 * 顯示註冊模態框
 */
export function showRegisterModal() {
    const registerModal = document.getElementById('register-modal');
    const loginModal = document.getElementById('login-modal');
    const registerForm = document.getElementById('register-form');
    const registerError = document.getElementById('register-error');

    if (!registerModal) return;

    registerModal.classList.remove('hidden');
    if (loginModal) loginModal.classList.add('hidden');
    if (registerError) registerError.classList.add('hidden');
    if (registerForm) registerForm.reset();

    EventBus.emit(EVENTS.AUTH_MODAL_OPENED, { type: 'register' });
}

/**
 * 隱藏所有認證模態框
 */
export function hideAuthModals() {
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const forgotModal = document.getElementById('forgot-password-modal');
    const resetModal = document.getElementById('reset-password-modal');

    if (loginModal) loginModal.classList.add('hidden');
    if (registerModal) registerModal.classList.add('hidden');
    if (forgotModal) forgotModal.classList.add('hidden');
    if (resetModal) resetModal.classList.add('hidden');

    EventBus.emit(EVENTS.AUTH_MODAL_CLOSED);
}

/**
 * 更新用戶顯示
 */
export function updateUserDisplay() {
    const user = getUserData();
    if (user) {
        const nameDisplay = document.getElementById('user-name-display');
        const emailDisplay = document.getElementById('user-email-display');

        if (nameDisplay) nameDisplay.textContent = user.name || '-';
        if (emailDisplay) emailDisplay.textContent = user.email || '-';

        EventBus.emit(EVENTS.USER_DISPLAY_UPDATED, user);
    }
}

/**
 * 檢查 token 是否有效
 * @returns {Promise<boolean>} 是否有效
 */
export async function verifyToken() {
    const token = getAuthToken();
    if (!token) return false;

    try {
        const response = await apiCall(`${backendUrl}/api/auth/verify`, {
            cache: 'no-store'
        });

        if (response.ok) {
            const data = await response.json();
            setUserData(data.user);
            return true;
        }
        return false;
    } catch (error) {
        console.error('驗證token失敗:', error);
        return false;
    }
}

/**
 * 顯示忘記密碼模態框
 */
export function showForgotPasswordModal() {
    const loginModal = document.getElementById('login-modal');
    const registerModal = document.getElementById('register-modal');
    const resetModal = document.getElementById('reset-password-modal');
    const forgotModal = document.getElementById('forgot-password-modal');

    if (loginModal) loginModal.classList.add('hidden');
    if (registerModal) registerModal.classList.add('hidden');
    if (resetModal) resetModal.classList.add('hidden');

    if (forgotModal) {
        const emailInput = document.getElementById('forgot-email');
        const errorEl = document.getElementById('forgot-error');
        const successEl = document.getElementById('forgot-success');

        if (emailInput) emailInput.value = '';
        if (errorEl) errorEl.classList.add('hidden');
        if (successEl) successEl.classList.add('hidden');

        forgotModal.classList.remove('hidden');
    }
}

/**
 * 提交忘記密碼請求
 */
export async function submitForgotPassword() {
    const email = document.getElementById('forgot-email').value.trim();
    const errEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');

    if (errEl) errEl.classList.add('hidden');
    if (successEl) successEl.classList.add('hidden');

    if (!email) {
        if (errEl) {
            errEl.textContent = '請輸入 Email';
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const resp = await fetch(`${backendUrl}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await resp.json();

        if (successEl) {
            successEl.textContent = data.message || '重設連結已寄出';
            successEl.classList.remove('hidden');
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = '網路錯誤，請稍後再試';
            errEl.classList.remove('hidden');
        }
    }
}

/**
 * 提交重設密碼
 */
export async function submitResetPassword() {
    const newPassword = document.getElementById('reset-new-password').value;
    const confirmPassword = document.getElementById('reset-confirm-password').value;
    const errEl = document.getElementById('reset-error');

    if (errEl) errEl.classList.add('hidden');

    if (!newPassword || !confirmPassword) {
        if (errEl) {
            errEl.textContent = '請填寫所有欄位';
            errEl.classList.remove('hidden');
        }
        return;
    }

    if (newPassword !== confirmPassword) {
        if (errEl) {
            errEl.textContent = '兩次密碼不一致';
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const resp = await fetch(`${backendUrl}/api/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: _resetToken, new_password: newPassword })
        });
        const data = await resp.json();

        if (resp.ok) {
            const resetModal = document.getElementById('reset-password-modal');
            if (resetModal) resetModal.classList.add('hidden');
            showLoginModal();
            showToast(data.message || '密碼已重設，請重新登入', 'success', 4000);
        } else {
            if (errEl) {
                errEl.textContent = data.error || '重設失敗';
                errEl.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = '網路錯誤，請稍後再試';
            errEl.classList.remove('hidden');
        }
    }
}

/**
 * 設置重設密碼 token
 */
export function setResetToken(token) {
    _resetToken = token;
}

/**
 * 切換編輯名稱區塊
 */
export function toggleEditName(show) {
    const section = document.getElementById('edit-name-section');
    const errEl = document.getElementById('edit-name-error');

    if (show) {
        toggleChangePassword(false);
        const user = getUserData();
        const nameInput = document.getElementById('edit-name-input');
        if (nameInput) nameInput.value = user ? (user.name || '') : '';
        if (errEl) errEl.classList.add('hidden');
        if (section) section.classList.remove('hidden');
    } else {
        if (section) section.classList.add('hidden');
    }
}

/**
 * 切換修改密碼區塊
 */
export function toggleChangePassword(show) {
    const section = document.getElementById('change-password-section');
    const errEl = document.getElementById('change-password-error');

    if (show) {
        toggleEditName(false);
        const currentPwd = document.getElementById('current-password-input');
        const newPwd = document.getElementById('new-password-input');
        const confirmPwd = document.getElementById('confirm-password-input');

        if (currentPwd) currentPwd.value = '';
        if (newPwd) newPwd.value = '';
        if (confirmPwd) confirmPwd.value = '';
        if (errEl) errEl.classList.add('hidden');
        if (section) section.classList.remove('hidden');
    } else {
        if (section) section.classList.add('hidden');
    }
}

/**
 * 儲存個人名稱
 */
export async function saveProfileName() {
    const name = document.getElementById('edit-name-input').value.trim();
    const errEl = document.getElementById('edit-name-error');

    if (!name) {
        if (errEl) {
            errEl.textContent = '使用者名稱不能為空';
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const response = await apiCall(`${backendUrl}/api/user/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            const userData = getUserData();
            if (userData) {
                userData.name = name;
                setUserData(userData);
            }
            updateUserDisplay();
            toggleEditName(false);
            showToast('使用者名稱已更新', 'success');

            EventBus.emit(EVENTS.USER_PROFILE_UPDATED, { name });
        } else {
            if (errEl) {
                errEl.textContent = data.error || '更新失敗';
                errEl.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = '網路錯誤，請稍後再試';
            errEl.classList.remove('hidden');
        }
    }
}

/**
 * 儲存新密碼
 */
export async function saveNewPassword() {
    const currentPassword = document.getElementById('current-password-input').value;
    const newPassword = document.getElementById('new-password-input').value;
    const confirmPassword = document.getElementById('confirm-password-input').value;
    const errEl = document.getElementById('change-password-error');

    if (!currentPassword || !newPassword || !confirmPassword) {
        if (errEl) {
            errEl.textContent = '請填寫所有欄位';
            errEl.classList.remove('hidden');
        }
        return;
    }

    if (newPassword !== confirmPassword) {
        if (errEl) {
            errEl.textContent = '新密碼與確認密碼不一致';
            errEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const response = await apiCall(`${backendUrl}/api/user/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ old_password: currentPassword, new_password: newPassword })
        });

        const data = await response.json();

        if (response.ok && !data.error) {
            toggleChangePassword(false);
            showToast('密碼已更新', 'success');

            EventBus.emit(EVENTS.USER_PASSWORD_CHANGED);
        } else {
            if (errEl) {
                errEl.textContent = data.error || '更新失敗';
                errEl.classList.remove('hidden');
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = '網路錯誤，請稍後再試';
            errEl.classList.remove('hidden');
        }
    }
}

/**
 * 處理登出
 */
export async function handleLogout() {
    if (!await showConfirm('確定要登出嗎？', '登出', '取消', false)) return;

    try {
        // 呼叫登出API（記錄登出）
        await apiCall(`${backendUrl}/api/auth/logout`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('登出API錯誤:', error);
    }

    // 清除本地token和用戶資料
    removeAuthToken();
    isAuthenticated = false;

    // 發送登出事件
    EventBus.emit(EVENTS.AUTH_LOGOUT);

    // 跳轉到登入頁
    const mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.style.display = 'none';
    showLoginModal();

    console.log('✅ 已登出');
}

/**
 * 處理登入表單提交
 */
export async function handleLogin(e) {
    if (e) e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const loginError = document.getElementById('login-error');

    if (!email || !password) {
        if (loginError) {
            loginError.textContent = '請輸入Email和密碼';
            loginError.classList.remove('hidden');
        }
        return;
    }

    if (loginError) {
        loginError.textContent = '登入中...';
        loginError.classList.remove('hidden');
        loginError.classList.remove('text-red-500');
        loginError.classList.add('text-gray-500');
    }

    try {
        const response = await apiCall(`${backendUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // 儲存token和用戶資料
            setAuthToken(data.token);
            setUserData(data.user);
            is401Handling = false;    // 登入成功，重置 401 guard
            isAuthenticated = true;   // 解鎖 Router onPageLoad

            // 處理「記住我」功能
            const rememberMe = document.getElementById('remember-me');
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('rememberedEmail', email);
            } else {
                localStorage.removeItem('rememberedEmail');
            }

            // 隱藏登入modal，顯示主內容
            hideAuthModals();
            const mainContent = document.getElementById('main-content');
            if (mainContent) mainContent.style.display = 'block';

            // 更新用戶顯示
            updateUserDisplay();

            // 發送登入成功事件
            EventBus.emit(EVENTS.AUTH_LOGIN_SUCCESS, data.user);

            console.log('✅ 登入成功:', data.user.email);
        } else {
            if (loginError) {
                loginError.textContent = data.error || '登入失敗';
                loginError.classList.remove('text-gray-500');
                loginError.classList.add('text-red-500');
            }
        }
    } catch (error) {
        console.error('登入錯誤:', error);
        if (loginError) {
            loginError.textContent = '網路錯誤，請稍後再試';
            loginError.classList.remove('text-gray-500');
            loginError.classList.add('text-red-500');
        }
    }
}

/**
 * 處理註冊表單提交
 */
export async function handleRegister(e) {
    if (e) e.preventDefault();

    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    const registerError = document.getElementById('register-error');

    if (!name || !email || !password || !passwordConfirm) {
        if (registerError) {
            registerError.textContent = '請填寫所有欄位';
            registerError.classList.remove('hidden');
        }
        return;
    }

    if (password !== passwordConfirm) {
        if (registerError) {
            registerError.textContent = '密碼不一致';
            registerError.classList.remove('hidden');
        }
        return;
    }

    if (registerError) {
        registerError.textContent = '註冊中...';
        registerError.classList.remove('hidden');
        registerError.classList.remove('text-red-500');
        registerError.classList.add('text-gray-500');
    }

    try {
        const response = await apiCall(`${backendUrl}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        // 檢查 Content-Type 是否為 JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('後端返回非JSON回應:', {
                status: response.status,
                statusText: response.statusText,
                contentType: contentType
            });
            const text = await response.text();
            console.error('回應內容:', text.substring(0, 200));

            if (registerError) {
                registerError.textContent = `後端錯誤 (HTTP ${response.status})，請檢查後端服務是否正常運行`;
                registerError.classList.remove('text-gray-500');
                registerError.classList.add('text-red-500');
            }
            return;
        }

        const data = await response.json();

        if (response.ok) {
            if (registerError) {
                registerError.textContent = '✅ 註冊成功！請登入';
                registerError.classList.remove('text-red-500');
                registerError.classList.add('text-green-500');
            }

            // 2秒後切換到登入頁
            setTimeout(() => {
                showLoginModal();
                const loginEmail = document.getElementById('login-email');
                if (loginEmail) loginEmail.value = email;
            }, 2000);
        } else {
            if (registerError) {
                registerError.textContent = data.error || '註冊失敗';
                registerError.classList.remove('text-gray-500');
                registerError.classList.add('text-red-500');
            }
        }
    } catch (error) {
        console.error('註冊錯誤:', error);
        // 顯示更詳細的錯誤訊息
        let errorMsg = '網路錯誤，請稍後再試';
        if (error.message) {
            errorMsg += ` (${error.message})`;
        }
        if (registerError) {
            registerError.textContent = errorMsg;
            registerError.classList.remove('text-gray-500');
            registerError.classList.add('text-red-500');
        }
    }
}

/**
 * 密碼強度即時驗證
 */
let passwordValidationTimeout = null;

export async function validatePasswordRealtime() {
    const password = document.getElementById('register-password').value;
    const email = document.getElementById('register-email').value.trim();
    const name = document.getElementById('register-name').value.trim();
    const checker = document.getElementById('password-strength-checker');

    // 如果密碼為空，隱藏檢查器
    if (!password) {
        if (checker) checker.classList.add('hidden');
        return;
    }

    // 顯示檢查器
    if (checker) checker.classList.remove('hidden');

    try {
        const response = await fetch(`${backendUrl}/api/auth/validate-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, email, name })
        });

        const result = await response.json();

        if (response.ok) {
            updatePasswordStrengthUI(result);
        }
    } catch (error) {
        console.error('密碼驗證失敗:', error);
    }
}

/**
 * 更新密碼強度 UI
 */
function updatePasswordStrengthUI(result) {
    const checks = result.checks;
    const passedCount = Object.values(checks).filter(c => c.passed).length;
    const totalCount = Object.keys(checks).length;
    const percentage = Math.round((passedCount / totalCount) * 100);

    // 更新各個檢查項目
    updateCheck('check-length', checks.length);
    updateCheck('check-uppercase', checks.uppercase);
    updateCheck('check-lowercase', checks.lowercase);
    updateCheck('check-digit', checks.digit);
    updateCheck('check-special', checks.special);
    updateCheck('check-repeating', checks.repeating);
    updateCheck('check-sequential', checks.sequential);
    updateCheck('check-keyboard', checks.keyboard_pattern);
    updateCheck('check-common', checks.common_password);
    updateCheck('check-personal', checks.personal_info);
    updateCheck('check-pinyin', checks.chinese_pinyin);
    updateCheck('check-math', checks.math_pattern);
    updateCheck('check-entropy', checks.entropy);

    // 更新進度條
    const progressBar = document.getElementById('strength-progress');
    const strengthText = document.getElementById('strength-text');

    if (progressBar) progressBar.style.width = percentage + '%';

    // 根據通過百分比設置顏色和文字
    if (percentage < 40) {
        if (progressBar) progressBar.className = 'h-full bg-red-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '弱';
            strengthText.className = 'text-xs font-semibold text-red-600';
        }
    } else if (percentage < 70) {
        if (progressBar) progressBar.className = 'h-full bg-yellow-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '中';
            strengthText.className = 'text-xs font-semibold text-yellow-600';
        }
    } else if (percentage < 90) {
        if (progressBar) progressBar.className = 'h-full bg-blue-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '強';
            strengthText.className = 'text-xs font-semibold text-blue-600';
        }
    } else {
        if (progressBar) progressBar.className = 'h-full bg-green-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '非常強';
            strengthText.className = 'text-xs font-semibold text-green-600';
        }
    }
}

/**
 * 更新單個檢查項目
 */
function updateCheck(elementId, checkResult) {
    const element = document.getElementById(elementId);
    if (!element || !checkResult) return;

    const icon = element.querySelector('i');

    if (checkResult.passed) {
        element.classList.remove('failed');
        element.classList.add('passed');
        if (icon) icon.className = 'fas fa-check-circle text-green-500 mr-2';
    } else {
        element.classList.remove('passed');
        element.classList.add('failed');
        if (icon) icon.className = 'fas fa-times-circle text-red-500 mr-2';
    }
}

/**
 * 修改密碼時的密碼強度驗證（即時）
 */
let changePasswordValidationTimeout;

export async function validateChangePasswordRealtime() {
    const password = document.getElementById('new-password-input').value;
    const checker = document.getElementById('change-password-strength-checker');

    // 如果密碼為空，隱藏檢查器
    if (!password) {
        if (checker) checker.classList.add('hidden');
        return;
    }

    // 顯示檢查器
    if (checker) checker.classList.remove('hidden');

    try {
        const response = await fetch(`${backendUrl}/api/auth/validate-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const result = await response.json();

        if (response.ok) {
            updateChangePasswordStrengthUI(result);
        }
    } catch (error) {
        console.error('密碼驗證失敗:', error);
    }
}

/**
 * 更新修改密碼的密碼強度 UI
 */
function updateChangePasswordStrengthUI(result) {
    // 類似 updatePasswordStrengthUI，但使用不同的 element ID
    const checks = result.checks;
    const passedCount = Object.values(checks).filter(c => c.passed).length;
    const totalCount = Object.keys(checks).length;
    const percentage = Math.round((passedCount / totalCount) * 100);

    // 更新進度條
    const progressBar = document.getElementById('change-strength-progress');
    const strengthText = document.getElementById('change-strength-text');

    if (progressBar) progressBar.style.width = percentage + '%';

    // 根據通過百分比設置顏色和文字
    if (percentage < 40) {
        if (progressBar) progressBar.className = 'h-full bg-red-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '弱';
            strengthText.className = 'text-xs font-semibold text-red-600';
        }
    } else if (percentage < 70) {
        if (progressBar) progressBar.className = 'h-full bg-yellow-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '中';
            strengthText.className = 'text-xs font-semibold text-yellow-600';
        }
    } else if (percentage < 90) {
        if (progressBar) progressBar.className = 'h-full bg-blue-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '強';
            strengthText.className = 'text-xs font-semibold text-blue-600';
        }
    } else {
        if (progressBar) progressBar.className = 'h-full bg-green-500 transition-all duration-300';
        if (strengthText) {
            strengthText.textContent = '非常強';
            strengthText.className = 'text-xs font-semibold text-green-600';
        }
    }
}

/**
 * 初始化認證模組
 * 設置事件監聽器
 */
export function initAuth() {
    // 登入表單
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // 註冊表單
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // 註冊密碼輸入即時驗證
    const registerPassword = document.getElementById('register-password');
    if (registerPassword) {
        registerPassword.addEventListener('input', () => {
            clearTimeout(passwordValidationTimeout);
            passwordValidationTimeout = setTimeout(validatePasswordRealtime, 500);
        });
    }

    // 修改密碼輸入即時驗證
    const newPasswordInput = document.getElementById('new-password-input');
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', () => {
            clearTimeout(changePasswordValidationTimeout);
            changePasswordValidationTimeout = setTimeout(validateChangePasswordRealtime, 500);
        });
    }

    // 監聽 401 錯誤事件
    window.addEventListener('auth:token-invalid', () => {
        showToast('登入已過期，請重新登入', 'warning');
        showLoginModal();
    });

    // 暴露到全局（供 HTML onclick 使用）
    window.handleLogout = handleLogout;
    window.showRegisterModal = showRegisterModal;
    window.showLoginModal = showLoginModal;
    window.showForgotPasswordModal = showForgotPasswordModal;
    window.submitForgotPassword = submitForgotPassword;
    window.submitResetPassword = submitResetPassword;
    window.saveProfileName = saveProfileName;
    window.toggleEditName = toggleEditName;
    window.saveNewPassword = saveNewPassword;
    window.toggleChangePassword = toggleChangePassword;

    console.log('✅ [Auth] 認證模組已初始化');
}

// 檢查初始認證狀態
if (getAuthToken()) {
    isAuthenticated = true;
    updateUserDisplay();
}
