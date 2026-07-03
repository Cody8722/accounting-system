/**
 * config.js — v2 設定：後端 URL 偵測、兩層分類樹、常數。
 * detectBackendUrl() 沿用現行 frontend/js-refactored/config.js 的判斷邏輯，
 * 任何地方都不 hardcode 後端 URL。
 */

/**
 * 純函式：由 hostname + pathname 推導後端 URL（不讀 window，方便單元測試）。
 * @param {string} hostname
 * @param {string} [pathname='/'] 目前路徑；同源部署時用來分流正式/測試
 * @returns {string} 後端 base URL（'' 代表同源根路徑；'/test' 代表同源 /test 前綴）
 */
export function resolveBackendUrl(hostname, pathname = '/') {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5001';
  }
  // Tailscale / 反向代理同源部署：前端與 API 同網域（443），走相對路徑，由 nginx 代理到後端。
  // 部署在 /test/ 底下（測試環境）→ API 走 /test/api；根目錄（正式）→ /api。
  if (hostname.endsWith('.ts.net')) {
    return pathname.startsWith('/test/') ? '/test' : '';
  }
  if (
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    return `http://${hostname}:5001`;
  }
  if (hostname === 'accounting-system.zeabur.app') {
    return 'https://accounting-system-ghth.zeabur.app';
  }
  if (hostname.includes('zeabur.app')) {
    return `https://${hostname.replace('frontend', 'backend')}`;
  }
  return 'http://localhost:5001';
}

export function detectBackendUrl() {
  return resolveBackendUrl(window.location.hostname, window.location.pathname);
}

// 模組載入時計算；於非瀏覽器環境（如 Node 單元測試）安全 fallback，不觸碰 window
export const backendUrl = typeof window !== 'undefined' ? detectBackendUrl() : '';

export function isDevelopment() {
  const h = window.location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.');
}

/**
 * 兩層分類樹（大類 → 細項）。沿用現有分類，故舊記錄可直接落位。
 * 每個大類含 Tabler icon 與代表色；細項預設繼承大類的 icon/色。
 */
export const CATEGORY_TREE = {
  expense: [
    { group: '飲食', icon: 'ti-tools-kitchen-2', color: '#e0894f', items: ['早餐', '午餐', '晚餐', '點心', '飲料', '宵夜', '聚餐'] },
    { group: '交通', icon: 'ti-car', color: '#4f86e0', items: ['公車/捷運', '計程車/Uber', '加油', '停車費'] },
    { group: '居住', icon: 'ti-home', color: '#7d6fe0', items: ['房租', '水電瓦斯', '網路/電話', '管理費'] },
    { group: '購物', icon: 'ti-shopping-bag', color: '#e05fa0', items: ['服飾', '日用品', '美妝保養', '電子產品'] },
    { group: '醫療', icon: 'ti-heartbeat', color: '#e05f5f', items: ['看診', '藥品', '保健食品'] },
    { group: '娛樂', icon: 'ti-device-gamepad-2', color: '#9b5fe0', items: ['電影/展覽', '運動健身', '旅遊'] },
    { group: '訂閱', icon: 'ti-refresh', color: '#5fb0e0', items: ['Netflix', 'Spotify', 'YouTube Premium', '雲端空間', '其他訂閱'] },
    { group: '教育', icon: 'ti-book', color: '#5fbf8a', items: ['書籍', '課程/學費'] },
    { group: '家庭', icon: 'ti-users', color: '#e0a94f', items: ['孝親費', '育兒', '寵物'] },
    { group: '其他', icon: 'ti-dots', color: '#8a8a94', items: ['其他支出'] },
  ],
  income: [
    { group: '收入', icon: 'ti-cash', color: '#3f8f66', items: ['薪資', '兼職/打工', '獎金/年終', '零用錢', '紅包/禮金', '獎學金', '投資收益', '退稅/補助', '二手拍賣', '其他收入'] },
  ],
};

/** 常用細項（手機記帳畫面攤平顯示） */
export const QUICK_LEAVES = {
  expense: ['早餐', '午餐', '晚餐', '飲料', '交通', '購物', '娛樂', '其他支出'],
  income: ['薪資', '零用錢', '獎金/年終', '其他收入'],
};

/** 後端 budget POST 只接受 ALLOWED_CATEGORIES 這些 key */
export const BUDGET_CATEGORIES = [
  '早餐', '午餐', '晚餐', '點心', '飲料',
  '交通', '娛樂', '購物', '醫療', '教育', '居住', '其他',
];

/** leaf → {group, icon, color} 反查表（含系統自動分類 fallback） */
const _leafMap = (() => {
  const m = {};
  for (const type of ['expense', 'income']) {
    for (const g of CATEGORY_TREE[type]) {
      for (const leaf of g.items) {
        m[leaf] = { group: g.group, icon: g.icon, color: g.color, type };
      }
    }
  }
  // 系統自動產生（欠款還款同步）
  m['債務收回'] = { group: '收入', icon: 'ti-arrow-back-up', color: '#3f8f66', type: 'income' };
  m['債務償還'] = { group: '其他', icon: 'ti-arrow-forward-up', color: '#b15c58', type: 'expense' };
  return m;
})();

/**
 * 取得分類的顯示中繼資料；未知葉節點回傳中性預設。
 * @param {string} leaf
 * @returns {{group:string, icon:string, color:string, type:string}}
 */
export function categoryMeta(leaf) {
  return _leafMap[leaf] || { group: '其他', icon: 'ti-tag', color: '#8a8a94', type: 'expense' };
}
