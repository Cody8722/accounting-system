# ── Stage 1: 安裝相依套件 ─────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# 安裝編譯工具（pymongo C extension 等需要 gcc）
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc \
    && rm -rf /var/lib/apt/lists/*

# 先複製 requirements，利用 Docker layer cache
COPY requirements.txt .

# 安裝到使用者目錄，final stage 不需要 gcc
RUN pip install --no-cache-dir --user -r requirements.txt

# ── Stage 2: 最終映像 ─────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# 從 builder 複製已安裝的套件
COPY --from=builder /root/.local /root/.local

# 只複製執行所需的程式碼（排除測試、快取、文件）
COPY main.py auth.py gunicorn.conf.py start.sh manage_password_rules.py ./

ENV PATH=/root/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

CMD ["gunicorn", "-c", "gunicorn.conf.py", "main:app"]
