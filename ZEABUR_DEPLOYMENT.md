# Zeabur 部署指南 (Zeabur Deployment Guide)

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

## 解決方案 (Solution)

### 1. 前端 Dockerfile (Frontend Dockerfile)
已創建 `frontend/Dockerfile` 使用 nginx 來提供靜態文件服務:
- 基於 `nginx:alpine` 映像
- 複製所有必要的靜態文件
- 使用自定義 nginx 配置
- 暴露端口 80

Created `frontend/Dockerfile` that uses nginx to serve static files:
- Based on `nginx:alpine` image
- Copies all necessary static files
- Uses custom nginx configuration
- Exposes port 80

### 2. Nginx 配置 (Nginx Configuration)
創建 `frontend/nginx-frontend.conf`:
- 提供靜態文件服務
- 配置 MIME types
- 啟用 gzip 壓縮
- 設置緩存控制

Created `frontend/nginx-frontend.conf`:
- Serves static files
- Configures MIME types
- Enables gzip compression
- Sets cache control

### 3. Docker Ignore
創建 `frontend/.dockerignore` 排除:
- node_modules
- 測試文件
- 開發工具

Created `frontend/.dockerignore` to exclude:
- node_modules
- Test files
- Development tools

## Zeabur 部署步驟 (Deployment Steps)

### 方案 A: 多服務部署 (Multi-Service Deployment)

在 Zeabur 上分別部署前端和後端作為獨立服務:

Deploy frontend and backend as separate services on Zeabur:

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
   - 使用 `frontend/Dockerfile`
   - 端口: 80
   - 確保在 Zeabur 中選擇 "Dockerfile" 作為構建方式

### 方案 B: 單體部署 (Monolithic Deployment)

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

### 如果仍然出現 "Cannot find module" 錯誤:
1. 確認 Zeabur 使用的是 Dockerfile 而非 package.json
2. 檢查 Zeabur 服務設置中的 "Root Directory" 是否設置為 `frontend/`
3. 確認構建日誌中使用的是 nginx,而非 Node.js

If "Cannot find module" error persists:
1. Confirm Zeabur is using Dockerfile, not package.json
2. Check "Root Directory" in Zeabur service settings is set to `frontend/`
3. Verify build logs show nginx, not Node.js

### 常見問題 (Common Issues)

**Q: 前端可以訪問,但無法連接後端?**
A: 檢查 `js-refactored/config.js` 中的 API_BASE_URL 配置

**Q: Static files not loading?**
A: Verify nginx configuration and file paths in Dockerfile

**Q: CORS errors?**
A: Configure backend CORS settings to allow frontend origin

## 相關文件 (Related Files)
- `frontend/Dockerfile` - 前端 Docker 配置
- `frontend/nginx-frontend.conf` - Nginx 配置
- `backend/Dockerfile` - 後端 Docker 配置
- `docker-compose.yml` - 本地開發配置
- `nginx.conf` - Docker Compose nginx 配置
