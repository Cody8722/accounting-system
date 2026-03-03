# Zeabur 部署指南 (Zeabur Deployment Guide)

## 推薦部署方案 (Recommended Deployment) ⭐

### 使用 zbpack.json 配置（非 Docker 方式）

**前端是純靜態 HTML**，不需要 Docker！使用 Zeabur 的靜態網站服務更簡單、更快速。

Frontend is **pure static HTML**, no Docker needed! Using Zeabur's static site service is simpler and faster.

#### 已配置的文件 (Configured Files)

1. **`frontend/zbpack.json`** - 明確指定為靜態網站
   ```json
   {
     "type": "static",
     "static": {
       "output_dir": ".",
       "index": "index.html"
     }
   }
   ```

2. **`backend/zbpack.json`** - 明確指定為 Python 應用
   ```json
   {
     "type": "python",
     "python": {
       "version": "3.11",
       "install_command": "pip install -r requirements.txt",
       "start_command": "gunicorn -c gunicorn.conf.py main:app"
     }
   }
   ```

3. **`frontend/Dockerfile`** 已重命名為 `Dockerfile.backup`
   - 避免 Zeabur 自動檢測為 Docker 部署
   - 如需 Docker 方案可隨時恢復

#### Zeabur 部署步驟 (Deployment Steps)

1. **前端服務 (Frontend Service)**
   - Root Directory: `frontend/`
   - Zeabur 會自動檢測到 `zbpack.json`
   - 類型：Static Site（靜態網站）
   - 無需環境變數

2. **後端服務 (Backend Service)**
   - Root Directory: `backend/`
   - Zeabur 會自動檢測到 `zbpack.json`
   - 類型：Python
   - 環境變數：
     ```
     MONGO_URI=<your-mongodb-uri>
     JWT_SECRET=<your-jwt-secret>
     ADMIN_SECRET=<your-admin-secret>
     PORT=8080
     ```

3. **MongoDB 服務**
   - 使用 Zeabur Marketplace 添加 MongoDB
   - 或使用外部 MongoDB 服務（如 MongoDB Atlas）

---

## 問題診斷 (Problem Diagnosis)

### 錯誤訊息 (Error Message)
```
Error: Cannot find module '/src/index.js'
```

### 原因 (Root Cause)
前端是一個**靜態 HTML/CSS/JS 網站**,應該由 nginx 提供服務,而不是作為 Node.js 應用程式運行。

Zeabur 檢測到 `frontend/package.json` 並嘗試將其作為 Node.js 應用程式運行,但該 package.json 僅包含 Playwright 測試腳本,而非實際的 Node.js 服務器。

The frontend is a **static HTML/CSS/JS site** that should be served by nginx, not run as a Node.js application.

Zeabur detected `frontend/package.json` and tried to run it as a Node.js app, but that package.json only contains Playwright test scripts, not an actual Node.js server.

## 替代解決方案 (Alternative Solutions)

### 方案 A: 使用 Docker（如需要）

如果您希望使用 Docker 部署，可以恢復 Dockerfile：

If you prefer Docker deployment, restore the Dockerfile:

```bash
cd frontend
mv Dockerfile.backup Dockerfile
```

已備份的 `frontend/Dockerfile.backup` 使用 nginx 來提供靜態文件服務:
- 基於 `nginx:alpine` 映像
- 複製所有必要的靜態文件
- 使用自定義 nginx 配置（`nginx-frontend.conf`）
- 暴露端口 80

The backed-up `frontend/Dockerfile.backup` uses nginx to serve static files:
- Based on `nginx:alpine` image
- Copies all necessary static files
- Uses custom nginx configuration (`nginx-frontend.conf`)
- Exposes port 80

**Zeabur 部署步驟 (Docker 方式):**

1. **後端服務 (Backend Service)**
   - 目錄: `backend/`
   - 使用 `backend/Dockerfile`
   - 環境變數:
     ```
     MONGO_URI=<your-mongodb-uri>
     JWT_SECRET=<your-jwt-secret>
     ADMIN_SECRET=<your-admin-secret>
     PORT=8080
     ```

2. **前端服務 (Frontend Service)**
   - 目錄: `frontend/`
   - 恢復 Dockerfile 並使用它
   - 端口: 80
   - 確保在 Zeabur 中選擇 "Dockerfile" 作為構建方式

### 方案 B: 本地 Docker Compose 部署

如果要在單個容器中部署,可以使用 `docker-compose.yml`:

For deployment in a single container, use `docker-compose.yml`:

```bash
docker-compose up -d
```

這將啟動:
- MongoDB (端口 27017)
- 後端 (端口 5001 -> 8080)
- 前端 (端口 8080 -> 80)

This will start:
- MongoDB (port 27017)
- Backend (port 5001 -> 8080)
- Frontend (port 8080 -> 80)

## 配置要點 (Configuration Notes)

### 前端配置 (Frontend Configuration)
- 確保 `js-refactored/config.js` 中的 API URL 指向正確的後端服務
- 在生產環境中,更新 API 端點為 Zeabur 後端服務的 URL

Ensure `js-refactored/config.js` points to the correct backend service
In production, update API endpoints to your Zeabur backend service URL

### 後端配置 (Backend Configuration)
- 設置正確的 CORS 允許的來源
- 配置 MongoDB 連接字串
- 設置安全的 JWT 和 Admin secrets

Set correct CORS allowed origins
Configure MongoDB connection string
Set secure JWT and Admin secrets

## 測試部署 (Testing Deployment)

### 本地測試 (Local Testing)
```bash
# 使用 Docker Compose
docker-compose up

# 或單獨構建前端
cd frontend
docker build -t accounting-frontend .
docker run -p 8080:80 accounting-frontend
```

### 驗證 (Verification)
1. 訪問前端: `http://localhost:8080`
2. 檢查靜態資源是否正確加載
3. 測試 API 連接

Visit frontend: `http://localhost:8080`
Check if static resources load correctly
Test API connections

## 故障排除 (Troubleshooting)

### 如果 Zeabur 仍然檢測為 Docker:
1. 確認 `frontend/zbpack.json` 文件存在
2. 確認 `frontend/Dockerfile` 已重命名或刪除
3. 重新連接 GitHub 倉庫或重新部署服務
4. 檢查 Zeabur 構建日誌，應該顯示 "Detected: Static Site"

If Zeabur still detects as Docker:
1. Confirm `frontend/zbpack.json` file exists
2. Confirm `frontend/Dockerfile` is renamed or deleted
3. Reconnect GitHub repository or redeploy service
4. Check Zeabur build logs, should show "Detected: Static Site"

### 如果出現 "Cannot find module" 錯誤:
1. 確認使用的是 zbpack.json 配置（推薦）
2. 檢查 Zeabur 服務設置中的 "Root Directory" 是否設置為 `frontend/`
3. 確認前端檢測為 "Static Site" 而非 Node.js
4. 後端檢測為 "Python" 而非 Docker

If "Cannot find module" error occurs:
1. Confirm using zbpack.json configuration (recommended)
2. Check "Root Directory" in Zeabur service settings is set to `frontend/`
3. Verify frontend is detected as "Static Site" not Node.js
4. Verify backend is detected as "Python" not Docker

### 常見問題 (Common Issues)

**Q: 前端可以訪問,但無法連接後端?**
A: 檢查 `js-refactored/config.js` 中的 API_BASE_URL 配置

**Q: Static files not loading?**
A: Verify nginx configuration and file paths in Dockerfile

**Q: CORS errors?**
A: Configure backend CORS settings to allow frontend origin

## 相關文件 (Related Files)

### 推薦配置 (Recommended)
- `frontend/zbpack.json` - 前端靜態網站配置 ⭐
- `backend/zbpack.json` - 後端 Python 配置 ⭐
- `frontend/index.html` - 前端主頁面
- `backend/main.py` - 後端主程式
- `backend/requirements.txt` - Python 依賴

### Docker 相關（備選方案）
- `frontend/Dockerfile.backup` - 前端 Docker 配置（已備份）
- `frontend/nginx-frontend.conf` - Nginx 配置
- `backend/Dockerfile` - 後端 Docker 配置
- `docker-compose.yml` - 本地開發配置
- `nginx.conf` - Docker Compose nginx 配置

### 其他
- `Procfile` - Heroku 格式的啟動配置
- `frontend/package.json` - 僅用於測試（Playwright）
