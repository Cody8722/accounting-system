# 開發指南

本指南協助新開發者快速建立本地開發環境並開始貢獻程式碼。

## 目錄

- [環境需求](#環境需求)
- [本地開發設定](#本地開發設定)
- [專案結構](#專案結構)
- [開發工作流程](#開發工作流程)
- [測試](#測試)
- [程式碼風格](#程式碼風格)
- [提交規範](#提交規範)
- [常見問題](#常見問題)

---

## 環境需求

### 必要工具
- **Python**: 3.11+
- **MongoDB**: 6.0+
- **Node.js**: 18+ (僅前端開發時需要)
- **Git**: 2.0+

### 推薦工具
- **Docker & Docker Compose**: 簡化環境設定
- **VS Code**: 推薦的編輯器
- **MongoDB Compass**: 資料庫視覺化工具

---

## 本地開發設定

### 方法一：Docker Compose（推薦）

最簡單的啟動方式，一鍵啟動所有服務。

```bash
# 1. Clone 專案
git clone https://github.com/your-repo/accounting-system.git
cd accounting-system

# 2. 複製環境變數檔案
cp backend/.env.example backend/.env

# 3. 編輯 .env 設定
nano backend/.env  # 或使用其他編輯器

# 4. 啟動所有服務
docker-compose up

# 前端: http://localhost:8080
# 後端: http://localhost:5001
```

**停止服務**:
```bash
docker-compose down
```

**查看日誌**:
```bash
docker-compose logs -f backend
```

---

### 方法二：手動設定

適合需要更多控制或調試的情況。

#### 1. 啟動 MongoDB

**使用 Docker**:
```bash
docker run -d \
  --name mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password123 \
  mongo:latest
```

**或使用本地安裝的 MongoDB**:
```bash
mongod --dbpath /your/data/path
```

#### 2. 設定後端

```bash
cd backend

# 建立虛擬環境
python -m venv venv

# 啟動虛擬環境
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 安裝依賴
pip install -r requirements.txt

# 複製並編輯環境變數
cp .env.example .env
nano .env

# 啟動開發伺服器
python main.py
```

#### 3. 設定前端

前端是單一 HTML 檔案，使用靜態伺服器即可。

```bash
cd frontend

# 使用 Python 內建伺服器
python -m http.server 8080

# 或使用 Node.js http-server
npx http-server -p 8080
```

訪問: http://localhost:8080

---

## 專案結構

```
accounting-system/
├── backend/                    # 後端 API
│   ├── main.py                # Flask 主程式
│   ├── auth.py                # 認證相關邏輯
│   ├── gunicorn.conf.py       # Gunicorn 配置
│   ├── manage_password_rules.py # 密碼規則管理工具
│   ├── requirements.txt       # Python 依賴
│   ├── .env.example           # 環境變數範本
│   ├── Dockerfile             # Docker 映像檔定義
│   └── tests/                 # 測試檔案
│       ├── test_api.py        # API 測試
│       ├── test_auth.py       # 認證測試
│       └── test_accounting.py # 記帳功能測試
│
├── frontend/                   # 前端應用
│   ├── index.html             # 主要 HTML（包含所有 JS/CSS）
│   ├── manifest.json          # PWA Manifest
│   ├── service-worker.js      # Service Worker（PWA 離線支援）
│   └── icons/                 # 應用圖標
│
├── docs/                       # 文件
│   ├── API.md                 # API 文件
│   ├── DEVELOPMENT.md         # 本指南
│   └── DEPLOYMENT.md          # 部署指南
│
├── .github/                    # GitHub Actions CI/CD
│   └── workflows/
│       └── main.yml           # CI/CD 配置
│
├── docker-compose.yml          # Docker Compose 配置
├── CHANGELOG.md                # 版本更新日誌
└── README.md                   # 專案說明
```

---

## 環境變數設定

編輯 `backend/.env`:

```bash
# MongoDB 連線
MONGO_URI=mongodb://admin:password123@localhost:27017/

# JWT 密鑰（生產環境請使用強密碼）
JWT_SECRET=your-secret-key-change-in-production

# Admin 密鑰（用於特殊操作）
ADMIN_SECRET=admin-secret-key-change-in-production

# Email 設定（忘記密碼功能）
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@example.com

# 密碼政策（true/false）
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SPECIAL=true
PASSWORD_MAX_REPEATING=2
PASSWORD_MAX_SEQUENTIAL=3
PASSWORD_CHECK_COMMON=true
PASSWORD_CHECK_KEYBOARD=true
PASSWORD_CHECK_PERSONAL_INFO=true
PASSWORD_CHECK_PINYIN=true
PASSWORD_CHECK_MATH_PATTERN=true
PASSWORD_MIN_ENTROPY=3.0

# 環境設定
FLASK_ENV=development  # 或 production
PORT=5001
```

---

## 開發工作流程

### 1. 建立新功能分支

```bash
git checkout -b feature/your-feature-name
```

### 2. 進行開發

- 修改程式碼
- 確保遵循[程式碼風格](#程式碼風格)
- 編寫單元測試

### 3. 執行測試

```bash
cd backend
pytest --cov=. --cov-report=term-missing
```

確保：
- 所有測試通過
- 測試覆蓋率 >= 74%

### 4. 程式碼格式化

```bash
# Black 格式化
black backend/*.py backend/tests/*.py

# 檢查格式
black --check backend/*.py
```

### 5. 提交變更

```bash
git add .
git commit -m "feat: add new feature description"
```

遵循[提交規範](#提交規範)。

### 6. 推送並建立 Pull Request

```bash
git push origin feature/your-feature-name
```

到 GitHub 建立 Pull Request。

---

## 測試

### 執行所有測試

```bash
cd backend
pytest -v
```

### 執行特定測試檔案

```bash
pytest tests/test_auth.py -v
```

### 執行特定測試函數

```bash
pytest tests/test_auth.py::TestLogin::test_login_valid_credentials -v
```

### 查看測試覆蓋率

```bash
pytest --cov=. --cov-report=html
```

然後開啟 `htmlcov/index.html` 查看詳細報告。

### 測試覆蓋率要求

- **最低要求**: 74%
- **目標**: 85%+
- **auth.py**: 90%+
- **main.py**: 70%+

### 編寫測試範例

```python
def test_create_record_success(client, auth_token):
    """測試成功創建記帳記錄"""
    data = {
        "type": "expense",
        "amount": 1000,
        "category": "餐飲",
        "date": "2024-02-24"
    }

    response = client.post(
        "/admin/api/accounting/records",
        json=data,
        headers={"Authorization": f"Bearer {auth_token}"}
    )

    assert response.status_code == 201
    assert "id" in response.get_json()
```

---

## 程式碼風格

### Python (後端)

使用 **Black** 格式化工具：

```bash
# 安裝
pip install black

# 格式化
black backend/*.py backend/tests/*.py

# 檢查
black --check backend/*.py
```

**規範**:
- 每行最多 88 字元（Black 預設）
- 使用 4 空格縮排
- 字串使用雙引號
- 函數和類別之間空兩行
- 使用 Type Hints（可選但推薦）

### JavaScript (前端)

**規範**:
- 使用 2 空格縮排
- 字串使用單引號
- 使用 `const` 和 `let`，避免 `var`
- 箭頭函數優先
- 生產環境不輸出 `console.log`（使用 `debugLog` 替代）

### 命名慣例

**Python**:
- 函數: `snake_case`
- 類別: `PascalCase`
- 常數: `UPPER_CASE`
- 私有變數: `_leading_underscore`

**JavaScript**:
- 函數: `camelCase`
- 類別: `PascalCase`
- 常數: `UPPER_CASE`

---

## 提交規範

使用 [Conventional Commits](https://www.conventionalcommits.org/) 規範：

### 格式

```
<類型>: <簡短描述>

[可選的詳細說明]

[可選的 footer]
```

### 類型

- `feat`: 新功能
- `fix`: Bug 修復
- `docs`: 文件變更
- `style`: 格式調整（不影響程式碼運行）
- `refactor`: 重構（不是新功能也不是修 bug）
- `test`: 測試相關
- `chore`: 建置工具或輔助工具變更

### 範例

```bash
feat: 新增 CSV 匯出功能

- 實作 /admin/api/accounting/export 端點
- 支援日期範圍篩選
- 添加 UTF-8 BOM 以支援 Excel

Closes #123
```

```bash
fix: 修正 iOS 雙擊放大問題

添加 touch-action: manipulation 防止雙擊縮放

Fixes #456
```

---

## API 開發

### 添加新端點

1. **在 `main.py` 中定義路由**:

```python
@app.route("/admin/api/your-endpoint", methods=["GET"])
@limiter.limit("100 per minute")
@require_auth
def your_endpoint():
    """端點描述"""
    try:
        # 實作邏輯
        return jsonify({"data": "..."}), 200
    except Exception as e:
        logger.error(f"錯誤: {e}")
        return jsonify({"error": "錯誤訊息"}), 500
```

2. **編寫測試**:

```python
def test_your_endpoint(client, auth_token):
    """測試你的端點"""
    response = client.get(
        "/admin/api/your-endpoint",
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
```

3. **更新 API 文件**:

在 `docs/API.md` 中添加端點說明。

---

## 前端開發

### 添加新頁面

1. **在 `index.html` 中添加頁面 HTML**:

```html
<div class="page" id="page-new-feature" data-page="new-feature">
    <h1>新功能</h1>
    <!-- 頁面內容 -->
</div>
```

2. **添加導航項目**:

```html
<!-- 側邊欄 -->
<div class="sidebar-item" data-page="new-feature">
    <i class="fas fa-icon"></i>
    <span>新功能</span>
</div>

<!-- 手機底部導航 -->
<div class="mobile-nav-item" data-page="new-feature">
    <i class="fas fa-icon"></i>
    <span>新功能</span>
</div>
```

3. **添加頁面邏輯**:

```javascript
// 在 onPageLoad 函數中添加
if (pageName === 'new-feature') {
    loadNewFeatureData();
}
```

### 調用 API

```javascript
async function loadData() {
    try {
        const response = await apiCall(`${backendUrl}/admin/api/endpoint`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '載入失敗');
        }

        // 處理資料
    } catch (error) {
        console.error('錯誤:', error);
        showMessage(error.message, 'error');
    }
}
```

### 開發模式日誌

使用 `debugLog` 而非 `console.log`：

```javascript
debugLog('這只會在開發環境顯示');
```

開發環境判定：
- `localhost`
- `127.0.0.1`
- `192.168.x.x`

---

## 資料庫管理

### 連接 MongoDB

```bash
# Docker 容器
docker exec -it mongo mongosh -u admin -p password123

# 本地安裝
mongosh mongodb://admin:password123@localhost:27017
```

### 常用命令

```javascript
// 切換資料庫
use accounting_db

// 查看集合
show collections

// 查詢記錄
db.accounting_records.find({type: "expense"}).limit(10)

// 查詢用戶
db.users.find({email: "user@example.com"})

// 刪除記錄
db.accounting_records.deleteOne({_id: ObjectId("...")})

// 統計
db.accounting_records.countDocuments()
```

### 備份資料

```bash
# 備份
docker exec mongo mongodump -u admin -p password123 --out /backup

# 還原
docker exec mongo mongorestore -u admin -p password123 /backup
```

---

## 常見問題

### Q: 為什麼 API 返回 401 Unauthorized?

A: 檢查：
1. Token 是否正確傳遞在 `Authorization` 標頭
2. Token 是否過期（預設 7 天）
3. Token 格式：`Bearer YOUR_TOKEN`

### Q: MongoDB 連線失敗?

A: 檢查：
1. MongoDB 服務是否啟動
2. `.env` 中的 `MONGO_URI` 是否正確
3. 防火牆是否阻擋 27017 port

### Q: 測試覆蓋率不足?

A:
1. 執行 `pytest --cov-report=html` 查看未覆蓋的程式碼
2. 為未測試的函數添加測試
3. 確保測試斷言正確

### Q: Black 格式化失敗?

A:
1. 確保安裝正確版本: `pip install black`
2. 執行: `black backend/*.py --check`
3. 自動修復: `black backend/*.py`

### Q: 前端無法連接後端?

A: 檢查：
1. 後端是否正常啟動（http://localhost:5001/health）
2. CORS 設定是否正確
3. 瀏覽器開發者工具的 Network 標籤

### Q: Docker Compose 啟動失敗?

A:
1. 檢查 port 是否被佔用: `lsof -i :5001` 或 `netstat -ano | findstr 5001`
2. 清理舊容器: `docker-compose down -v`
3. 重新建置: `docker-compose up --build`

---

## 開發建議

### 最佳實踐

1. **經常提交**: 小而頻繁的提交比大而少的提交好
2. **編寫測試**: 先寫測試，後寫程式碼（TDD）
3. **程式碼審查**: PR 前自我審查一次
4. **日誌輸出**: 使用 `logger` 而非 `print`
5. **錯誤處理**: 總是處理可能的異常

### 效能優化

- 資料庫查詢添加索引
- API 回應使用分頁
- 前端避免重複請求
- 使用快取（Redis）

### 安全注意事項

- 永遠驗證用戶輸入
- SQL/NoSQL 注入防護
- XSS 防護
- CSRF Token
- 敏感資訊不存 Git

---

## 相關資源

- [API 文件](./API.md)
- [部署指南](./DEPLOYMENT.md)
- [CHANGELOG](../CHANGELOG.md)
- [Flask 文件](https://flask.palletsprojects.com/)
- [MongoDB 文件](https://docs.mongodb.com/)
- [Pytest 文件](https://docs.pytest.org/)

---

## 貢獻

歡迎貢獻！請：

1. Fork 專案
2. 建立功能分支
3. 提交變更
4. 推送到分支
5. 建立 Pull Request

感謝你的貢獻！ 🎉
