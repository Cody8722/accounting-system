# 測試文件說明

## 測試結構

```
tests/
├── __init__.py              # 測試包初始化
├── conftest.py              # 共享 fixtures 和配置
├── test_api.py              # API 端點基礎測試
├── test_auth.py             # 認證系統測試
├── test_accounting.py       # 會計記錄 CRUD 測試
└── README.md                # 本文件
```

## 運行測試

### 安裝依賴

```bash
cd backend
pip install -r requirements-dev.txt
```

### 運行所有測試

```bash
pytest
```

### 運行特定測試文件

```bash
pytest tests/test_auth.py
pytest tests/test_accounting.py
```

### 運行特定測試類或方法

```bash
pytest tests/test_auth.py::TestPasswordValidation
pytest tests/test_auth.py::TestPasswordValidation::test_password_too_short
```

### 生成覆蓋率報告

```bash
# 在終端顯示覆蓋率
pytest --cov=. --cov-report=term-missing

# 生成 HTML 報告
pytest --cov=. --cov-report=html

# 查看 HTML 報告
open htmlcov/index.html
```

### 使用標記運行特定類型的測試

```bash
# 只運行單元測試
pytest -m unit

# 只運行認證相關測試
pytest -m auth

# 跳過慢速測試
pytest -m "not slow"
```

### 詳細輸出

```bash
pytest -v         # 詳細模式
pytest -vv        # 非常詳細
pytest -s         # 顯示 print 輸出
```

## 測試覆蓋範圍

### test_api.py
- 基礎 API 端點測試
- CORS 配置測試
- 錯誤處理測試

### test_auth.py
- 密碼驗證（15+ 場景）
  - 長度、大小寫、數字、特殊字符
  - 重複字符、連續字符、鍵盤模式
  - 常見密碼、個人信息、數學模式
  - 中文拼音、熵值、極端場景
- 註冊功能
  - 有效/無效郵箱
  - 弱密碼/重複郵箱
  - SQL 注入/XSS 攻擊
- 登入功能
  - 正確/錯誤憑證
  - 暴力破解保護
- JWT Token 驗證

### test_accounting.py
- 記錄創建
  - 支出/收入記錄
  - 極端金額（0、負數、超大、超精度）
  - 日期驗證（未來、過去、格式）
  - 字段驗證（缺失、空值、超長）
  - XSS/SQL 注入防護
- 記錄查詢
  - 全部記錄
  - 日期/類型/分類篩選
- 記錄更新和刪除
- 統計功能
- 並發測試

## 極端場景測試

### 數值邊界
- ✅ 金額 = 0
- ✅ 負數金額
- ✅ 999,999,999.99 (最大合理金額)
- ✅ 超過最大金額
- ✅ 多位小數 (100.123456)

### 日期邊界
- ✅ 未來日期
- ✅ 很久以前的日期 (1900-01-01)
- ✅ 無效格式

### 字符串邊界
- ✅ 空字符串
- ✅ 超長字符串 (10,000 字符)
- ✅ Unicode 字符
- ✅ XSS 攻擊向量
- ✅ SQL 注入向量

### 密碼安全
- ✅ 15+ 種密碼模式檢測
- ✅ 常見弱密碼黑名單
- ✅ 個人信息檢測
- ✅ 數學模式檢測
- ✅ 熵值計算

### 認證安全
- ✅ Token 過期
- ✅ 無效 Token
- ✅ 缺失 Token
- ✅ 暴力破解保護
- ✅ 重複註冊防護

## 覆蓋率目標

- **main.py**（主要 API 邏輯）: ≥ 90%
- **auth.py**（認證與密碼驗證）: ≥ 80%

## CI/CD 集成

測試會在以下情況自動運行：
- Push 到 main/develop 分支
- 創建 Pull Request
- Push 到 claude/* 分支

GitHub Actions 會：
1. 運行所有測試
2. 生成覆蓋率報告
3. 檢查覆蓋率（main.py ≥ 90%，auth.py ≥ 80%）
4. 上傳報告到 Codecov
5. 運行代碼質量檢查 (flake8, black)

## 環境變量

測試環境需要以下環境變量：

```bash
MONGO_URI=mongodb://localhost:27017/
JWT_SECRET=test-jwt-secret-key
ADMIN_SECRET=test-admin-secret
```

CI 環境會自動配置這些變量。

## 故障排除

### MongoDB 連接失敗

如果測試需要 MongoDB 連接但失敗，測試會跳過或返回 500 錯誤。在 CI 環境中，MongoDB 作為服務運行。

本地測試時，確保 MongoDB 正在運行：

```bash
# 使用 Docker
docker run -d -p 27017:27017 mongo:7.0

# 或使用本地 MongoDB
brew services start mongodb-community  # macOS
sudo systemctl start mongod            # Linux
```

### Coverage 警告

如果看到 "no data to report" 警告，確保：
1. 已安裝 pytest-cov
2. 在正確的目錄運行測試
3. .coveragerc 配置正確

### Import 錯誤

如果遇到 import 錯誤，確保：
1. 在 backend/ 目錄運行測試
2. 已安裝所有依賴
3. Python path 正確
