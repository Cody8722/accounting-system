"""
Gunicorn 配置文件
針對 Zeabur 部署優化，解決記憶體和超時問題
"""

import multiprocessing
import os
import logging

# 設定 logging
logger = logging.getLogger(__name__)

# 伺服器綁定
bind = f"0.0.0.0:{os.getenv('PORT', '8080')}"

# Worker 設置（減少 workers 以降低記憶體使用）
# 使用 1 個 worker 以節省記憶體
workers = 1

# Worker 類型
worker_class = "sync"

# 每個 worker 的線程數（使用線程而不是多個 workers）
threads = 2

# 超時設置（增加以避免啟動超時）
timeout = 120  # 從默認的 30 秒增加到 120 秒
graceful_timeout = 30

# 連接設置
keepalive = 5
max_requests = 1000  # Worker 處理這麼多請求後重啟（防止記憶體洩漏）
max_requests_jitter = 100

# 日誌設置
accesslog = "-"  # 輸出到 stdout
errorlog = "-"  # 輸出到 stderr
loglevel = "info"
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Preload 應用（可能導致記憶體使用增加，但啟動更快）
# 在 Zeabur 上先禁用 preload 以減少啟動記憶體
preload_app = False

# Worker 生命週期
worker_tmp_dir = "/dev/shm"  # 使用共享記憶體以提高性能

# 限制請求體大小（防止記憶體攻擊）
limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8190


def on_starting(server):
    """Gunicorn 啟動時執行"""
    logger.info(
        f"Gunicorn 配置: workers={workers}, threads={threads}, timeout={timeout}s"
    )
