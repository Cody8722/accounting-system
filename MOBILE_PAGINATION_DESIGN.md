# 📱 手機版分頁系統 - 詳細設計文檔

**日期:** 2026-02-11
**版本:** 2.0
**類型:** 大型 UI 重構

---

## 🎯 設計目標

將現有的**單頁滾動**設計重構為**多頁面 Tab Bar** 設計，提升手機版使用體驗。

### 主要變更
- ❌ 移除：5個導航項（首頁、記帳、記錄、統計、預算）
- ✅ 改為：4個獨立頁面（記帳、記錄、分析、設定）
- ✅ 記帳頁成為**預設首頁**
- ✅ 添加自定義數字鍵盤
- ✅ 添加滑動刪除 + 長按選單
- ✅ 所有頁面顯示離線狀態
- ✅ 桌面版改為左側邊欄

---

## 📐 最終頁面架構

```
┌─────────────────────────────────┐
│  [離線狀態提示條] (動態顯示)     │ ← 橘色/藍色/綠色
├─────────────────────────────────┤
│  [頁面標題]                      │ ← 固定頂部欄
├─────────────────────────────────┤
│                                 │
│  [當前頁面內容]                  │ ← 可滾動區域
│  (記帳/記錄/分析/設定)            │
│                                 │
├─────────────────────────────────┤
│  ➕    📝    📊    ⚙️          │ ← 底部導航 (手機版)
│ 記帳  記錄  分析  設定           │    或左側邊欄 (桌面版)
└─────────────────────────────────┘
```

---

## 📄 頁面 1: 記帳頁（首頁）

### 佈局設計

```
┌─────────────────────────────────┐
│  個人記帳本            2/11 (二)  │
├─────────────────────────────────┤
│ 💰$12,500  💸$8,320  🏦$4,180   │ ← 簡潔統計（單行）
│  本月收入    本月支出     結餘     │
├─────────────────────────────────┤
│ 類型選擇                         │
│ [💸 支出]  [💰 收入]            │ ← 切換按鈕
├─────────────────────────────────┤
│                                 │
│         $  0                    │ ← 金額顯示區
│         ▂▂▂▂▂▂                  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │   1      2      3           │ │
│ │                             │ │
│ │   4      5      6           │ │ ← 自定義數字鍵盤
│ │                             │ │
│ │   7      8      9           │ │
│ │                             │ │
│ │   .      0      ⌫           │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 分類  [🍔 飲食-午餐]  [選擇 ▼]  │
│ 日期  [2026-02-11]  [📅]       │
│ 類型  [固定支出 ▼]              │
│ 描述  [______________]          │
├─────────────────────────────────┤
│        [✓ 新增記帳]             │ ← 大按鈕
├─────────────────────────────────┤
│ 📋 今日記錄 (3筆)               │
│ ┌─────────────────────────────┐ │
│ │ 🍔 午餐           -$120     │ │
│ │ 飲食-午餐  12:30            │ │
│ ├─────────────────────────────┤ │
│ │ 🚇 捷運           -$50      │ │
│ │ 交通-捷運  09:00            │ │
│ └─────────────────────────────┘ │
│        [查看全部記錄 →]         │
├─────────────────────────────────┤
│  ➕    📝    📊    ⚙️          │
│ 記帳  記錄  分析  設定           │
└─────────────────────────────────┘
```

### HTML ID/Class 結構

```html
<!-- 頁面容器 -->
<div id="page-add" class="page active">
  <!-- 頂部統計 -->
  <div class="page-header">
    <div class="compact-stats">
      <div class="stat-item">
        <i class="fas fa-arrow-up"></i>
        <span id="compact-income">$0</span>
        <small>本月收入</small>
      </div>
      <div class="stat-item">
        <i class="fas fa-arrow-down"></i>
        <span id="compact-expense">$0</span>
        <small>本月支出</small>
      </div>
      <div class="stat-item">
        <i class="fas fa-piggy-bank"></i>
        <span id="compact-balance">$0</span>
        <small>結餘</small>
      </div>
    </div>
  </div>

  <!-- 記帳表單 -->
  <div class="page-content">
    <!-- 類型切換 -->
    <div class="type-toggle">
      <button id="btn-expense" class="active">💸 支出</button>
      <button id="btn-income">💰 收入</button>
    </div>

    <!-- 金額顯示 -->
    <div class="amount-display">
      <span class="currency">$</span>
      <span id="amount-value">0</span>
    </div>

    <!-- 自定義數字鍵盤 -->
    <div class="custom-keyboard">
      <button class="key" data-key="1">1</button>
      <button class="key" data-key="2">2</button>
      <button class="key" data-key="3">3</button>
      <button class="key" data-key="4">4</button>
      <button class="key" data-key="5">5</button>
      <button class="key" data-key="6">6</button>
      <button class="key" data-key="7">7</button>
      <button class="key" data-key="8">8</button>
      <button class="key" data-key="9">9</button>
      <button class="key" data-key=".">.</button>
      <button class="key" data-key="0">0</button>
      <button class="key delete" data-key="backspace">
        <i class="fas fa-backspace"></i>
      </button>
    </div>

    <!-- 其他欄位 -->
    <div class="form-fields">
      <!-- ... -->
    </div>

    <!-- 今日記錄預覽 -->
    <div class="today-records">
      <h3>📋 今日記錄 (<span id="today-count">0</span>筆)</h3>
      <div id="today-records-list"></div>
      <button onclick="switchPage('records')">查看全部記錄 →</button>
    </div>
  </div>
</div>
```

### JavaScript 功能

```javascript
// 自定義鍵盤邏輯
let currentAmount = '0';

document.querySelectorAll('.custom-keyboard .key').forEach(key => {
  key.addEventListener('click', () => {
    const value = key.dataset.key;

    if (value === 'backspace') {
      currentAmount = currentAmount.slice(0, -1) || '0';
    } else if (value === '.') {
      if (!currentAmount.includes('.')) {
        currentAmount += '.';
      }
    } else {
      if (currentAmount === '0') {
        currentAmount = value;
      } else {
        currentAmount += value;
      }
    }

    updateAmountDisplay();
  });
});

function updateAmountDisplay() {
  const formatted = formatCurrency(currentAmount);
  document.getElementById('amount-value').textContent = formatted;
}

// 載入今日記錄
async function loadTodayRecords() {
  const today = new Date().toISOString().split('T')[0];
  // ... API 調用
}
```

---

## 📄 頁面 2: 記錄頁

### 佈局設計

```
┌─────────────────────────────────┐
│  記帳記錄           [🔍 篩選]    │
├─────────────────────────────────┤
│ ╔═════════════════════════════╗ │
│ ║ 篩選器 (可折疊)              ║ │
│ ║ 開始日期: [____]             ║ │
│ ║ 結束日期: [____]             ║ │
│ ║ 類型: [全部 ▼]              ║ │
│ ║ 分類: [全部 ▼]              ║ │
│ ║ [查詢] [清除]               ║ │
│ ╚═════════════════════════════╝ │
├─────────────────────────────────┤
│ 📅 今天 (2/11)                  │
│ ┌─────────────────────────────┐ │
│ │ 🍔 午餐             -$120   │ │ ← 可滑動/長按
│ │ 飲食-午餐  12:30            │ │
│ ├─────────────────────────────┤ │
│ │ 🚇 捷運             -$50    │ │
│ │ 交通-捷運  09:00            │ │
│ └─────────────────────────────┘ │
│ 📅 昨天 (2/10)                  │
│ ┌─────────────────────────────┐ │
│ │ 💰 薪水            +$30000  │ │
│ │ 收入-薪水  10:00            │ │
│ └─────────────────────────────┘ │
│                                 │
│        [載入更多...]            │
├─────────────────────────────────┤
│  ➕    📝    📊    ⚙️          │
│ 記帳  記錄  分析  設定           │
└─────────────────────────────────┘
```

### 滑動刪除實作

```javascript
// 使用 Hammer.js 或自己實作
class SwipeToDelete {
  constructor(element) {
    this.element = element;
    this.startX = 0;
    this.currentX = 0;
    this.isSwiping = false;

    element.addEventListener('touchstart', this.onTouchStart.bind(this));
    element.addEventListener('touchmove', this.onTouchMove.bind(this));
    element.addEventListener('touchend', this.onTouchEnd.bind(this));
  }

  onTouchStart(e) {
    this.startX = e.touches[0].clientX;
    this.isSwiping = true;
  }

  onTouchMove(e) {
    if (!this.isSwiping) return;

    this.currentX = e.touches[0].clientX;
    const diff = this.startX - this.currentX;

    if (diff > 0) { // 向左滑
      this.element.style.transform = `translateX(-${diff}px)`;
    }
  }

  onTouchEnd(e) {
    const diff = this.startX - this.currentX;

    if (diff > 80) { // 滑動超過 80px
      // 顯示刪除按鈕
      this.showDeleteButton();
    } else {
      // 回彈
      this.element.style.transform = 'translateX(0)';
    }

    this.isSwiping = false;
  }

  showDeleteButton() {
    this.element.classList.add('swiped');
    // 顯示刪除按鈕
  }
}
```

### 長按選單實作

```javascript
class LongPressMenu {
  constructor(element) {
    this.element = element;
    this.pressTimer = null;

    element.addEventListener('touchstart', this.onTouchStart.bind(this));
    element.addEventListener('touchend', this.onTouchEnd.bind(this));
    element.addEventListener('touchmove', this.onTouchEnd.bind(this));
  }

  onTouchStart(e) {
    this.pressTimer = setTimeout(() => {
      this.showContextMenu(e);
    }, 800); // 800ms 長按
  }

  onTouchEnd() {
    clearTimeout(this.pressTimer);
  }

  showContextMenu(e) {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = `
      <button onclick="editRecord('${this.element.dataset.id}')">
        <i class="fas fa-edit"></i> 編輯
      </button>
      <button onclick="deleteRecord('${this.element.dataset.id}')">
        <i class="fas fa-trash"></i> 刪除
      </button>
      <button onclick="duplicateRecord('${this.element.dataset.id}')">
        <i class="fas fa-copy"></i> 複製
      </button>
      <button onclick="closeContextMenu()">
        <i class="fas fa-times"></i> 取消
      </button>
    `;

    // 顯示在觸摸位置
    menu.style.top = `${e.touches[0].clientY}px`;
    menu.style.left = `${e.touches[0].clientX}px`;
    document.body.appendChild(menu);
  }
}
```

---

## 📄 頁面 3: 分析頁

### 佈局設計

```
┌─────────────────────────────────┐
│  統計分析                        │
│  [本月 ▼]  [支出 ▼]            │
├─────────────────────────────────┤
│ 💰 本月支出總計                  │
│      $8,320                     │
├─────────────────────────────────┤
│ 📊 支出分類分布                  │
│ ┌─────────────────────────────┐ │
│ │        ◐◑◐                  │ │
│ │      圓餅圖                  │ │
│ │                             │ │
│ │   🍔飲食 40%                │ │
│ │   🏠居住 35%                │ │
│ │   🚇交通 15%                │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 📈 收支趨勢                      │
│ ┌─────────────────────────────┐ │
│ │    ╱╲   ╱╲                 │ │
│ │   ╱  ╲ ╱  ╲                │ │
│ │  ╱    ╲    ╲               │ │
│ │ ─────────────────           │ │
│ │ 1   5   10  15  20          │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ 🏆 支出排行榜                    │
│ ┌─────────────────────────────┐ │
│ │ 🥇 飲食    $3,328           │ │
│ │ 🥈 居住    $2,912           │ │
│ │ 🥉 交通    $1,248           │ │
│ │ 4️⃣  娛樂    $832            │ │
│ │ 5️⃣  其他    $200            │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│  ➕    📝    📊    ⚙️          │
│ 記帳  記錄  分析  設定           │
└─────────────────────────────────┘
```

### 新增：趨勢折線圖

```javascript
function createTrendChart() {
  const ctx = document.getElementById('trendChart');

  // 獲取最近 30 天的數據
  const data = getLast30DaysData();

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.dates,
      datasets: [{
        label: '支出',
        data: data.expenses,
        borderColor: 'rgb(239, 68, 68)',
        tension: 0.1
      }, {
        label: '收入',
        data: data.income,
        borderColor: 'rgb(34, 197, 94)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
        }
      }
    }
  });
}
```

### 新增：排行榜

```javascript
async function loadCategoryRanking() {
  const stats = await fetchStats();
  const categories = Object.entries(stats.category_stats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const html = categories.map((item, index) => {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    return `
      <div class="ranking-item">
        <span class="rank">${medals[index]}</span>
        <span class="category">${item[0]}</span>
        <span class="amount">$${item[1].toFixed(2)}</span>
      </div>
    `;
  }).join('');

  document.getElementById('ranking-list').innerHTML = html;
}
```

---

## 📄 頁面 4: 設定頁

### 佈局設計

```
┌─────────────────────────────────┐
│  設定                            │
├─────────────────────────────────┤
│ 💰 預算設定                      │
│ ┌─────────────────────────────┐ │
│ │ 🍔 飲食                      │ │
│ │ 本月預算: $5,000             │ │
│ │ [修改]                       │ │
│ ├─────────────────────────────┤ │
│ │ 🚇 交通                      │ │
│ │ 本月預算: $1,500             │ │
│ │ [修改]                       │ │
│ ├─────────────────────────────┤ │
│ │ 🏠 居住                      │ │
│ │ 本月預算: $8,000             │ │
│ │ [修改]                       │ │
│ └─────────────────────────────┘ │
│        [批量設定預算]            │
├─────────────────────────────────┤
│ 👤 帳戶管理                      │
│ ┌─────────────────────────────┐ │
│ │ → 修改密碼                   │ │
│ │ → 數據導出                   │ │
│ │ → 清除所有數據               │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ℹ️ 關於應用                      │
│ ┌─────────────────────────────┐ │
│ │ 版本: 2.0 PWA               │ │
│ │ 最後同步: 剛剛               │ │
│ │ 離線記錄: 0 筆               │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│  ➕    📝    📊    ⚙️          │
│ 記帳  記錄  分析  設定           │
└─────────────────────────────────┘
```

---

## 🎨 CSS 樣式設計

### 頁面系統基礎樣式

```css
/* 頁面容器 */
.page {
  display: none;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.page.active {
  display: flex;
}

/* 頁面內容區（可滾動） */
.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: 80px; /* 為底部導航留空間 */
}

/* 頁面切換動畫 */
.page.slide-in-right {
  animation: slideInRight 0.3s ease-out;
}

.page.slide-out-left {
  animation: slideOutLeft 0.3s ease-out;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}
```

### 簡潔統計樣式

```css
.compact-stats {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-item i {
  font-size: 20px;
}

.stat-item span {
  font-size: 18px;
  font-weight: bold;
}

.stat-item small {
  font-size: 10px;
  color: #6b7280;
}

/* 手機版優化 */
@media (max-width: 768px) {
  .stat-item span {
    font-size: 16px;
  }
}
```

### 自定義鍵盤樣式

```css
.custom-keyboard {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 20px;
  background: #f3f4f6;
  border-radius: 12px;
  margin: 20px 0;
}

.custom-keyboard .key {
  aspect-ratio: 1;
  font-size: 24px;
  font-weight: 600;
  background: white;
  border: none;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;
}

.custom-keyboard .key:active {
  transform: scale(0.95);
  background: #e5e7eb;
}

.custom-keyboard .key.delete {
  background: #fee2e2;
  color: #dc2626;
}

/* 手機版 */
@media (max-width: 768px) {
  .custom-keyboard .key {
    min-height: 56px; /* 觸控友好 */
  }
}
```

### 滑動刪除樣式

```css
.record-item {
  position: relative;
  background: white;
  transition: transform 0.3s;
}

.record-item.swiped {
  transform: translateX(-80px);
}

.record-item .delete-action {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 80px;
  background: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 20px;
}
```

### 長按選單樣式

```css
.context-menu {
  position: fixed;
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 10000;
  overflow: hidden;
  animation: fadeIn 0.2s;
}

.context-menu button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 24px;
  border: none;
  background: white;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s;
}

.context-menu button:hover {
  background: #f3f4f6;
}

.context-menu button i {
  width: 20px;
  text-align: center;
}
```

### 離線狀態提示條

```css
.network-status {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999;
  transform: translateY(-100%);
  transition: transform 0.3s;
}

.network-status.show {
  transform: translateY(0);
}

.network-status.offline {
  background: #f59e0b;
  color: white;
}

.network-status.syncing {
  background: #3b82f6;
  color: white;
}

.network-status.success {
  background: #10b981;
  color: white;
}
```

### 桌面版側邊欄

```css
/* 桌面版 (>1024px) */
@media (min-width: 1024px) {
  body {
    display: flex;
  }

  /* 側邊欄 */
  .desktop-sidebar {
    width: 80px;
    height: 100vh;
    background: white;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
    display: flex;
    flex-direction: column;
    position: fixed;
    left: 0;
    top: 0;
  }

  .desktop-sidebar .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 80px;
    cursor: pointer;
    transition: all 0.2s;
    border-left: 3px solid transparent;
  }

  .desktop-sidebar .nav-item:hover {
    background: #f3f4f6;
  }

  .desktop-sidebar .nav-item.active {
    border-left-color: #7c3aed;
    background: #f3e8ff;
    color: #7c3aed;
  }

  .desktop-sidebar .nav-item i {
    font-size: 32px;
    margin-bottom: 4px;
  }

  .desktop-sidebar .nav-item span {
    font-size: 14px;
  }

  /* 主內容區 */
  .main-content {
    margin-left: 80px;
    flex: 1;
  }

  /* 隱藏手機版導航 */
  .mobile-nav {
    display: none !important;
  }
}
```

---

## 🔧 JavaScript 路由系統

### SPA 路由實作

```javascript
// 簡單的 SPA 路由管理器
class Router {
  constructor() {
    this.routes = {
      'add': 'page-add',
      'records': 'page-records',
      'analytics': 'page-analytics',
      'settings': 'page-settings'
    };
    this.currentPage = 'add';
  }

  init() {
    // 初始化：顯示首頁
    this.navigate('add', false);
  }

  navigate(pageName, addAnimation = true) {
    const oldPageId = this.routes[this.currentPage];
    const newPageId = this.routes[pageName];

    if (!newPageId) {
      console.error('Page not found:', pageName);
      return;
    }

    const oldPage = document.getElementById(oldPageId);
    const newPage = document.getElementById(newPageId);

    // 動畫效果
    if (addAnimation) {
      oldPage.classList.add('slide-out-left');
      newPage.classList.add('slide-in-right');

      setTimeout(() => {
        oldPage.classList.remove('active', 'slide-out-left');
        newPage.classList.add('active');
        newPage.classList.remove('slide-in-right');
      }, 300);
    } else {
      oldPage.classList.remove('active');
      newPage.classList.add('active');
    }

    // 更新導航高亮
    this.updateNavigation(pageName);

    // 更新當前頁面
    this.currentPage = pageName;

    // 載入頁面數據
    this.loadPageData(pageName);
  }

  updateNavigation(pageName) {
    document.querySelectorAll('.mobile-nav-item, .desktop-sidebar .nav-item')
      .forEach(item => {
        if (item.dataset.page === pageName) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
  }

  loadPageData(pageName) {
    switch (pageName) {
      case 'add':
        loadTodayRecords();
        updateCompactStats();
        break;
      case 'records':
        loadAllRecords();
        break;
      case 'analytics':
        loadAnalytics();
        break;
      case 'settings':
        loadSettings();
        break;
    }
  }
}

// 全域路由實例
const router = new Router();

// 頁面切換函數
function switchPage(pageName) {
  router.navigate(pageName);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  router.init();
});
```

---

## 📦 實作步驟

### 階段 1: 基礎架構 (30 分鐘)
1. ✅ 創建 4 個頁面容器
2. ✅ 實作 Router 類
3. ✅ 更新底部導航為 4 個項目
4. ✅ 添加桌面版側邊欄

### 階段 2: 記帳頁 (45 分鐘)
1. ✅ 頂部簡潔統計
2. ✅ 自定義數字鍵盤
3. ✅ 今日記錄預覽
4. ✅ 表單提交邏輯

### 階段 3: 記錄頁 (60 分鐘)
1. ✅ 記錄列表重構
2. ✅ 滑動刪除實作
3. ✅ 長按選單實作
4. ✅ 日期分組顯示

### 階段 4: 分析頁 (30 分鐘)
1. ✅ 趨勢折線圖
2. ✅ 排行榜組件

### 階段 5: 設定頁 (20 分鐘)
1. ✅ 重新組織預算設定
2. ✅ 帳戶管理選項

### 階段 6: 全域功能 (30 分鐘)
1. ✅ 離線狀態提示條
2. ✅ 頁面切換動畫
3. ✅ 響應式適配

### 階段 7: 測試 (30 分鐘)
1. ✅ 功能測試
2. ✅ 性能測試
3. ✅ Bug 修復

**總計:** 約 4 小時

---

## ⚠️ 注意事項

### 需要保留的功能
- ✅ 所有 API 調用邏輯
- ✅ 分類選擇器（Modal）
- ✅ 離線同步機制
- ✅ 深色模式
- ✅ PWA 功能

### 需要移除的元素
- ❌ 原有的滾動式佈局
- ❌ 5 個導航項
- ❌ 原有的快速記帳浮動按鈕

### 需要新增的功能
- ➕ SPA 路由系統
- ➕ 自定義數字鍵盤
- ➕ 滑動刪除
- ➕ 長按選單
- ➕ 離線狀態提示條
- ➕ 桌面版側邊欄
- ➕ 頁面切換動畫

---

## 🎯 預期成果

完成後的應用將擁有：

1. **更專業的 App 體驗** - 多頁面結構，類似原生 App
2. **更高的使用效率** - 記帳頁為首頁，減少操作步驟
3. **更好的觸控體驗** - 滑動刪除、長按選單
4. **更完善的反饋** - 離線狀態實時提示
5. **更好的桌面適配** - 左側邊欄，利用大螢幕空間

---

*此文檔作為實作的詳細藍圖，確保所有細節都被正確實現。*
