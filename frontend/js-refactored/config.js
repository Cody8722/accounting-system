/**
 * 配置模組 - 管理應用程式的配置和常量
 *
 * 功能：
 * - 後端 URL 自動偵測
 * - 開發環境檢測
 * - 分類資料管理
 * - 分類圖標映射
 */

/**
 * 自動偵測後端 URL
 * @returns {string} 後端 API URL
 */
export function detectBackendUrl() {
    const hostname = window.location.hostname;

    // 本地開發環境
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:5001';
    }

    // Zeabur 生產環境
    // 前端: accounting-system.zeabur.app
    // 後端: accounting-system-ghth.zeabur.app
    if (hostname === 'accounting-system.zeabur.app') {
        return 'https://accounting-system-ghth.zeabur.app';
    }

    // 通用 Zeabur 環境（備用）
    if (hostname.includes('zeabur.app')) {
        // 嘗試將 frontend 替換成 backend
        const backendHostname = hostname.replace('frontend', 'backend');
        return `https://${backendHostname}`;
    }

    // 預設值
    return 'http://localhost:5001';
}

/**
 * 檢測是否為開發環境
 * @returns {boolean} 是否為開發環境
 */
export function isDevelopment() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');
}

/**
 * 後端 URL（自動偵測）
 */
export const backendUrl = detectBackendUrl();

/**
 * 條件化日誌輸出（僅在開發環境輸出）
 * @param {...any} args - 要輸出的參數
 */
export function debugLog(...args) {
    if (isDevelopment()) {
        console.log(...args);
    }
}

/**
 * 分類資料
 * 包含支出和收入的所有分類
 */
export const categoryData = {
    expense: {
        '🍔 飲食': ['早餐', '午餐', '晚餐', '點心', '飲料', '宵夜', '聚餐'],
        '🚗 交通': ['公車/捷運', '計程車/Uber', '加油', '停車費'],
        '🏠 居住': ['房租', '水電瓦斯', '網路/電話', '管理費'],
        '🛍️ 購物': ['服飾', '日用品', '美妝保養', '電子產品'],
        '💊 醫療': ['看診', '藥品', '保健食品'],
        '🎮 娛樂': ['電影/展覽', '運動健身', '旅遊'],
        '💻 訂閱': ['Claude Pro', 'ChatGPT Plus', 'GitHub Copilot', 'Midjourney', 'Netflix', 'Spotify', 'YouTube Premium', '雲端空間', '其他訂閱'],
        '📚 教育': ['書籍', '課程/學費'],
        '👨‍👩‍👧 家庭': ['孝親費', '育兒', '寵物'],
        '💰 其他': ['其他支出']
    },
    income: {
        '💵 收入': ['薪資', '兼職/打工', '獎金/年終', '零用錢', '紅包/禮金', '獎學金', '投資收益', '退稅/補助', '二手拍賣', '其他收入']
    }
};

/**
 * 取得分類項目的圖標
 * @param {string} item - 分類項目名稱
 * @returns {string} 對應的 emoji 圖標
 */
export function getItemIcon(item) {
    const iconMap = {
        // 飲食
        '早餐': '☕',
        '午餐': '🍱',
        '晚餐': '🍽️',
        '點心': '🍪',
        '飲料': '🥤',
        '宵夜': '🌙',
        '聚餐': '🍻',
        // 交通
        '公車/捷運': '🚇',
        '計程車/Uber': '🚕',
        '加油': '⛽',
        '停車費': '🅿️',
        // 居住
        '房租': '🏡',
        '水電瓦斯': '💡',
        '網路/電話': '📡',
        '管理費': '🔧',
        // 購物
        '服飾': '👔',
        '日用品': '🧴',
        '美妝保養': '💄',
        '電子產品': '📱',
        // 醫療
        '看診': '🏥',
        '藥品': '💊',
        '保健食品': '💚',
        // 娛樂
        '電影/展覽': '🎬',
        '運動健身': '💪',
        '旅遊': '✈️',
        // 訂閱
        'Claude Pro': '🤖',
        'ChatGPT Plus': '💬',
        'GitHub Copilot': '👨‍💻',
        'Midjourney': '🎨',
        'Netflix': '📺',
        'Spotify': '🎵',
        'YouTube Premium': '▶️',
        '雲端空間': '☁️',
        '其他訂閱': '📱',
        // 教育
        '書籍': '📚',
        '課程/學費': '🎓',
        // 家庭
        '孝親費': '❤️',
        '育兒': '👶',
        '寵物': '🐕',
        // 其他
        '其他支出': '📝',
        // 收入
        '薪資': '💰',
        '兼職/打工': '💼',
        '獎金/年終': '🎁',
        '零用錢': '💰',
        '紅包/禮金': '🧧',
        '獎學金': '🎓',
        '投資收益': '📈',
        '退稅/補助': '💸',
        '二手拍賣': '🏷️',
        '其他收入': '💸'
    };

    return iconMap[item] || '📌';
}

// 開發環境下輸出配置資訊
if (isDevelopment()) {
    console.log('⚙️ [Config] 後端 URL:', backendUrl);
    console.log('⚙️ [Config] 開發模式:', isDevelopment());
    console.log('⚙️ [Config] 分類數量:',
        Object.keys(categoryData.expense).length + Object.keys(categoryData.income).length);
}
