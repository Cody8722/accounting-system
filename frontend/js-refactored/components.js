/**
 * UI 組件模組 - 所有交互組件的實現
 *
 * 組件：
 * - Router: 頁面路由
 * - CustomKeyboard: 自定義數字鍵盤
 * - SwipeToDelete: 滑動刪除
 * - LongPressMenu: 長按選單
 */

import { EventBus, EVENTS } from './events.js';
import { showToast } from './utils.js';

/**
 * 認證狀態標誌（外部設置）
 */
let isAuthenticated = false;

/**
 * 設置認證狀態
 */
export function setAuthenticationStatus(status) {
    isAuthenticated = status;
}

/**
 * Router 類別 - 頁面路由管理
 */
export class Router {
    constructor() {
        this.currentPage = 'add'; // 預設頁面
        this.pages = ['add', 'records', 'analytics', 'settings'];
        this.init();
    }

    init() {
        // 綁定手機版導航
        const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
        mobileNavItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigate(page);
            });
        });

        // 綁定桌面版側邊欄
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                this.navigate(page);
            });
        });

        // 初始化：顯示預設頁面
        this.navigate('add', false);

        console.log('✅ [Router] 路由已初始化');
    }

    navigate(pageName, scrollToTop = true) {
        if (!this.pages.includes(pageName)) {
            console.error(`頁面不存在: ${pageName}`);
            return;
        }

        // 隱藏所有頁面
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // 顯示目標頁面
        const targetPage = document.getElementById(`page-${pageName}`);
        if (targetPage) {
            targetPage.classList.add('active');
            this.currentPage = pageName;

            // 滾動到頂部（iOS Safari 不支援 smooth，需降級處理）
            if (scrollToTop) {
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (e) {
                    window.scrollTo(0, 0);
                }
            }

            // 更新手機版導航高亮
            document.querySelectorAll('.mobile-nav-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.page === pageName) {
                    item.classList.add('active');
                }
            });

            // 更新桌面版側邊欄高亮
            document.querySelectorAll('.sidebar-item').forEach(item => {
                item.classList.remove('active');
                if (item.dataset.page === pageName) {
                    item.classList.add('active');
                }
            });

            // 發送頁面切換事件
            EventBus.emit(EVENTS.PAGE_CHANGED, { page: pageName });

            // 頁面特定初始化
            this.onPageLoad(pageName);
        } else {
            console.error(`找不到頁面元素: page-${pageName}`);
        }
    }

    onPageLoad(pageName) {
        // Router 在 DOMContentLoaded 之前初始化，auth 尚未驗證時不能發 API 請求
        if (!isAuthenticated) return;

        // 發送頁面載入事件
        EventBus.emit(EVENTS.PAGE_LOAD, { page: pageName });
    }

    updateCompactStats() {
        // 同步更新簡潔統計列（不帶動畫，用於初始化）
        const compactIncome = document.getElementById('compact-income');
        const compactExpense = document.getElementById('compact-expense');
        const compactBalance = document.getElementById('compact-balance');

        const totalIncome = document.getElementById('total-income');
        const totalExpense = document.getElementById('total-expense');
        const balance = document.getElementById('balance');

        if (totalIncome && compactIncome) {
            compactIncome.textContent = totalIncome.textContent;
        }
        if (totalExpense && compactExpense) {
            compactExpense.textContent = totalExpense.textContent;
        }
        if (balance && compactBalance) {
            compactBalance.textContent = balance.textContent;
        }
    }
}

/**
 * CustomKeyboard 類別 - 自定義數字鍵盤
 */
export class CustomKeyboard {
    constructor() {
        this.keyboard = document.getElementById('custom-keyboard');
        this.display = document.getElementById('keyboard-display');
        this.targetInput = null;
        this.currentValue = '0';
        this.operator = null;
        this.firstOperand = null;
        this.waitingForOperand = false;
        this.init();
    }

    init() {
        if (!this.keyboard) {
            console.warn('⚠️ [CustomKeyboard] 找不到鍵盤元素');
            return;
        }

        // 綁定所有鍵盤按鈕
        const buttons = this.keyboard.querySelectorAll('.keyboard-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                this.handleKey(key);
            });
        });

        // 綁定金額輸入框的點擊事件
        const amountInput = document.getElementById('record-amount');
        if (amountInput) {
            // 阻止手機系統鍵盤彈出
            amountInput.setAttribute('readonly', 'true');
            amountInput.setAttribute('inputmode', 'none');

            amountInput.addEventListener('click', (e) => {
                e.preventDefault();
                this.show(amountInput);
            });

            amountInput.addEventListener('focus', (e) => {
                e.preventDefault();
                this.show(amountInput);
                amountInput.blur(); // 立即失焦，避免系統鍵盤彈出
            });
        }

        // 點擊鍵盤外部關閉
        document.addEventListener('click', (e) => {
            if (this.keyboard.classList.contains('active')) {
                const isKeyboard = this.keyboard.contains(e.target);
                const isInput = e.target === this.targetInput;
                if (!isKeyboard && !isInput) {
                    this.hide();
                }
            }
        });

        console.log('✅ [CustomKeyboard] 鍵盤已初始化');
    }

    show(inputElement) {
        this.targetInput = inputElement;
        this.currentValue = inputElement.value || '0';
        this.updateDisplay();
        this.keyboard.classList.add('active');

        // 向上推動底部導航
        const mobileNav = document.getElementById('mobile-nav');
        if (mobileNav) {
            mobileNav.style.bottom = '320px';
        }

        // 滾動到輸入框位置（iOS Safari 對 smooth 支援不穩定，需降級）
        setTimeout(() => {
            try {
                inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (e) {
                inputElement.scrollIntoView(false);
            }
        }, 100);

        EventBus.emit(EVENTS.KEYBOARD_OPENED);
    }

    hide() {
        this.keyboard.classList.remove('active');
        this.targetInput = null;

        // 恢復底部導航位置
        const mobileNav = document.getElementById('mobile-nav');
        if (mobileNav) {
            mobileNav.style.bottom = '0';
        }

        EventBus.emit(EVENTS.KEYBOARD_CLOSED);
    }

    handleKey(key) {
        if (key === 'confirm') {
            // 確認：更新輸入框並關閉鍵盤
            if (this.targetInput) {
                this.targetInput.value = this.currentValue;
                // 觸發 input 事件，讓其他邏輯知道值已更改
                this.targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            this.resetCalculator();
            this.hide();
        } else if (key === 'backspace') {
            // 刪除：移除最後一個字符
            if (this.currentValue.length > 1) {
                this.currentValue = this.currentValue.slice(0, -1);
            } else {
                this.currentValue = '0';
            }
            this.updateDisplay();
        } else if (key === '=') {
            // 等於：計算結果
            this.calculate();
            this.operator = null;
            this.firstOperand = null;
            this.waitingForOperand = false;
        } else if (['+', '-', '×', '÷'].includes(key)) {
            // 運算符：儲存當前值和運算符
            if (this.operator && !this.waitingForOperand) {
                // 如果已有運算符，先計算之前的結果
                this.calculate();
            }
            this.firstOperand = parseFloat(this.currentValue);
            this.operator = key;
            this.waitingForOperand = true;
            this.updateDisplay();
        } else if (key === '.') {
            // 小數點：只允許一個小數點
            if (this.waitingForOperand) {
                this.currentValue = '0.';
                this.waitingForOperand = false;
            } else if (!this.currentValue.includes('.')) {
                this.currentValue += '.';
            }
            this.updateDisplay();
        } else {
            // 數字鍵
            if (this.waitingForOperand) {
                this.currentValue = key;
                this.waitingForOperand = false;
            } else if (this.currentValue === '0') {
                this.currentValue = key;
            } else {
                // 限制最多 2 位小數
                if (this.currentValue.includes('.')) {
                    const parts = this.currentValue.split('.');
                    if (parts[1] && parts[1].length >= 2) {
                        return; // 已有 2 位小數，不再添加
                    }
                }

                // 限制最大值
                const newValue = this.currentValue + key;
                if (parseFloat(newValue) <= 9999999.99) {
                    this.currentValue = newValue;
                }
            }
            this.updateDisplay();
        }
    }

    calculate() {
        if (this.operator && this.firstOperand !== null) {
            const secondOperand = parseFloat(this.currentValue);
            let result = 0;

            switch (this.operator) {
                case '+':
                    result = this.firstOperand + secondOperand;
                    break;
                case '-':
                    result = this.firstOperand - secondOperand;
                    break;
                case '×':
                    result = this.firstOperand * secondOperand;
                    break;
                case '÷':
                    if (secondOperand === 0) {
                        this.currentValue = '錯誤';
                        this.updateDisplay();
                        setTimeout(() => {
                            this.resetCalculator();
                        }, 1000);
                        return;
                    }
                    result = this.firstOperand / secondOperand;
                    break;
            }

            // 四捨五入到 2 位小數
            result = Math.round(result * 100) / 100;

            // 限制最大值
            if (result > 9999999.99) {
                result = 9999999.99;
            } else if (result < -9999999.99) {
                result = -9999999.99;
            }

            this.currentValue = result.toString();
            this.updateDisplay();
        }
    }

    resetCalculator() {
        this.operator = null;
        this.firstOperand = null;
        this.waitingForOperand = false;
        this.currentValue = '0';
        this.updateDisplay();
    }

    updateDisplay() {
        if (this.display) {
            // 顯示當前值和運算符
            let displayText = this.currentValue;
            if (this.operator && this.waitingForOperand) {
                displayText = `${this.firstOperand} ${this.operator}`;
            } else if (this.operator) {
                displayText = `${this.firstOperand} ${this.operator} ${this.currentValue}`;
            }
            this.display.textContent = displayText;
        }
    }
}

/**
 * SwipeToDelete 類別 - 滑動刪除
 */
export class SwipeToDelete {
    constructor(element) {
        this.element = element;
        this.startX = 0;
        this.currentX = 0;
        this.isDragging = false;
        this.threshold = 80; // 滑動閾值（px）
        this.init();
    }

    init() {
        // 綁定觸控事件
        this.element.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: true });
        this.element.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
        this.element.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: true });
        this.element.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: true });
    }

    onTouchStart(e) {
        this.startX = e.touches[0].clientX;
        this.isDragging = false;
        this.element.classList.add('swiping');
    }

    onTouchMove(e) {
        if (!e.touches[0]) return;

        const currentX = e.touches[0].clientX;
        const diff = this.startX - currentX;

        // 只處理左滑（diff > 0）
        if (diff > 0) {
            this.isDragging = true;

            // 限制最大滑動距離為 120px
            const translateX = Math.min(diff, 120);
            this.element.style.transform = `translateX(-${translateX}px)`;

            // 防止滾動
            if (diff > 10) {
                e.preventDefault();
            }
        } else if (diff < -10) {
            // 右滑：重置位置
            this.element.style.transform = 'translateX(0)';
        }
    }

    onTouchEnd(e) {
        this.element.classList.remove('swiping');

        // 計算最終滑動距離
        const transform = this.element.style.transform;
        const match = transform.match(/translateX\(-?(\d+)px\)/);
        const currentTranslate = match ? parseInt(match[1]) : 0;

        // 如果滑動超過閾值，顯示刪除按鈕
        if (currentTranslate > this.threshold) {
            this.element.style.transform = 'translateX(-100px)';
        } else {
            // 否則重置
            this.element.style.transform = 'translateX(0)';
        }

        // 重置狀態
        this.isDragging = false;
        this.startX = 0;
    }
}

/**
 * LongPressMenu 類別 - 長按選單
 */
export class LongPressMenu {
    constructor() {
        this.menu = document.getElementById('context-menu');
        this.overlay = document.getElementById('context-menu-overlay');
        this.longPressTimer = null;
        this.longPressDuration = 500; // 長按時間（ms）；iOS 800ms 易與原生選單衝突，縮短至 500ms
        this.currentRecord = null;
        this.currentRecordType = null;
        this.currentRecordAmount = null;
        this.init();
    }

    init() {
        if (!this.menu || !this.overlay) {
            console.warn('⚠️ [LongPressMenu] 找不到選單元素');
            return;
        }

        // 綁定選單項點擊事件
        const menuItems = this.menu.querySelectorAll('.context-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.handleAction(action);
            });
        });

        // 點擊遮罩層關閉選單
        this.overlay.addEventListener('click', () => {
            this.hide();
        });

        console.log('✅ [LongPressMenu] 長按選單已初始化');
    }

    bindToElement(element, recordId) {
        // 綁定長按事件
        element.addEventListener('touchstart', (e) => {
            // 如果是在刪除按鈕上，不觸發長按
            if (e.target.closest('.delete-btn')) return;

            // iOS：多指手勢（縮放等）不觸發長按
            if (e.touches.length > 1) return;

            this.currentRecord = recordId;
            this.currentRecordType = element.dataset.type;
            this.currentRecordAmount = parseFloat(element.dataset.amount);
            element.classList.add('long-pressing');

            // 啟動長按計時器
            this.longPressTimer = setTimeout(() => {
                // 觸發震動反饋
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }

                // 顯示選單
                this.show(e.touches[0].clientX, e.touches[0].clientY);
            }, this.longPressDuration);
        }, { passive: true }); // passive:true 讓 iOS 滾動更流暢

        element.addEventListener('touchmove', (e) => {
            // 移動超過 10px 取消長按
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                element.classList.remove('long-pressing');
            }
        });

        element.addEventListener('touchend', (e) => {
            // 取消長按計時器
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                element.classList.remove('long-pressing');
            }
        });

        element.addEventListener('touchcancel', (e) => {
            // 取消長按計時器
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                element.classList.remove('long-pressing');
            }
        });
    }

    show(x, y) {
        // 計算選單位置（確保不會超出螢幕）
        const menuWidth = 180;
        const menuHeight = 200;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        let left = x;
        let top = y;

        // 右邊界檢查
        if (left + menuWidth > screenWidth) {
            left = screenWidth - menuWidth - 20;
        }

        // 底部邊界檢查
        if (top + menuHeight > screenHeight) {
            top = screenHeight - menuHeight - 20;
        }

        // 左邊界檢查
        if (left < 20) {
            left = 20;
        }

        // 頂部邊界檢查
        if (top < 20) {
            top = 20;
        }

        this.menu.style.left = `${left}px`;
        this.menu.style.top = `${top}px`;
        this.menu.classList.add('active');
        this.overlay.classList.add('active');
    }

    hide() {
        this.menu.classList.remove('active');
        this.overlay.classList.remove('active');
        this.currentRecord = null;

        // 移除所有長按選中效果
        document.querySelectorAll('.record-card.long-pressing').forEach(el => {
            el.classList.remove('long-pressing');
        });
    }

    handleAction(action) {
        if (!this.currentRecord) return;

        switch (action) {
            case 'edit':
                // 發送編輯事件
                EventBus.emit(EVENTS.RECORD_EDIT_REQUESTED, {
                    id: this.currentRecord
                });
                break;
            case 'delete':
                // 發送刪除事件
                EventBus.emit(EVENTS.RECORD_DELETE_REQUESTED, {
                    id: this.currentRecord,
                    type: this.currentRecordType,
                    amount: this.currentRecordAmount
                });
                break;
            case 'copy':
                // 複製記錄資訊到剪貼簿
                this.copyRecordInfo();
                break;
            case 'cancel':
                // 取消：直接關閉選單
                break;
        }

        this.hide();
    }

    copyRecordInfo() {
        // 找到對應的記錄元素
        const recordCard = document.querySelector(`[data-record-id="${this.currentRecord}"]`);
        if (!recordCard) return;

        // 提取記錄資訊
        const amountText = recordCard.querySelector('.font-medium')?.textContent || '';
        const categoryText = recordCard.querySelector('.text-sm')?.textContent || '';
        const dateText = recordCard.querySelector('.text-xs')?.textContent || '';

        const copyText = `${amountText}\n${categoryText}\n${dateText}`;

        // 複製到剪貼簿
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(copyText).then(() => {
                showToast('已複製到剪貼簿', 'success');
            }).catch(err => {
                console.error('複製失敗:', err);
                showToast('複製失敗', 'error');
            });
        } else {
            // 降級方案：使用舊的 execCommand
            const textArea = document.createElement('textarea');
            textArea.value = copyText;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                showToast('已複製到剪貼簿', 'success');
            } catch (err) {
                console.error('複製失敗:', err);
                showToast('複製失敗', 'error');
            }
            document.body.removeChild(textArea);
        }
    }
}

/**
 * 初始化所有組件
 */
export function initComponents() {
    // 初始化 Router
    const router = new Router();
    window.appRouter = router;

    // 初始化自定義鍵盤
    const customKeyboard = new CustomKeyboard();
    window.customKeyboard = customKeyboard;

    // 初始化長按選單
    const longPressMenu = new LongPressMenu();
    window.longPressMenu = longPressMenu;

    // 暴露 SwipeToDelete 類別到全局
    window.SwipeToDelete = SwipeToDelete;

    console.log('✅ [Components] 所有組件已初始化');

    return { router, customKeyboard, longPressMenu };
}
