#!/bin/bash
# 啟動腳本 - 優化 Zeabur 部署

echo "🚀 開始啟動應用程式..."
echo "📊 記憶體狀態:"
free -h || echo "無法顯示記憶體狀態"

echo "🔧 Python 版本:"
python --version

echo "📦 已安裝的套件:"
pip list | grep -E "gunicorn|flask|pymongo" || echo "無法列出套件"

echo "🌍 環境變數:"
echo "PORT=${PORT:-8080}"
echo "MONGO_URI=${MONGO_URI:0:20}..." # 只顯示前 20 個字符
echo "TESTING=$TESTING"

# 啟動 Gunicorn
echo "🎯 啟動 Gunicorn..."
exec gunicorn -c gunicorn.conf.py main:app
