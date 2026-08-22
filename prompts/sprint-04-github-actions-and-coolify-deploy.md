# Codex Prompt: Sprint 04 — GitHub Actions CI/CD Pipeline & Coolify Deployment

## Роль:
Ты — Senior DevOps & CI/CD инженер (GitHub CLI `gh`, GitHub Actions, GitHub Container Registry GHCR, Docker Multi-stage, Coolify).

## Контекст проекта:
Веб-приложение **Telegram Tools** (монолит: FastAPI + Telethon + React Vite).
Цель спринта — инициализировать репозиторий на GitHub с помощью **GitHub CLI (`gh`)**, настроить автоматическую сборку Docker-образа в **GitHub Actions**, публикацию в **GHCR (GitHub Container Registry)** и автодеплой на **Coolify** через Webhook.

---

## Задачи реализации:

### 1. Подготовка Multi-stage `Dockerfile`:
Создать легковесный и безопасный продакшн `Dockerfile` в корне проекта:
```dockerfile
# =================================================================
# Stage 1: Build React Frontend
# =================================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =================================================================
# Stage 2: Python Backend & Monolith Runner
# =================================================================
FROM python:3.11-slim AS runner

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    DATA_DIR=/app/data \
    DATABASE_URL=sqlite+aiosqlite:////app/data/app.db \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

VOLUME ["/app/data"]

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

### 2. GitHub Actions CI/CD Pipeline (`.github/workflows/deploy.yml`):
Создать пайплайн, аналогичный архитектуре `planny`:
```yaml
name: CI/CD & Deploy to Coolify

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

concurrency:
  group: telegram-tools-production
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    env:
      COOLIFY_WEBHOOK_URL: ${{ secrets.COOLIFY_WEBHOOK_URL }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install Frontend Dependencies
        run: cd frontend && npm ci

      - name: Typecheck & Build Frontend
        run: cd frontend && npm run build

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GitHub Container Registry (GHCR)
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker Monolith Image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: ./Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/telegram-tools:latest
            ghcr.io/${{ github.repository_owner }}/telegram-tools:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trigger Coolify Webhook
        if: env.COOLIFY_WEBHOOK_URL != ''
        continue-on-error: true
        run: |
          curl --fail --show-error --silent --retry 3 "$COOLIFY_WEBHOOK_URL" || echo "Coolify Webhook triggered"
```

---

### 3. Инициализация и Пуш репозитория через GitHub CLI (`gh`):
Выполнить команды:
```bash
# 1. Проверить .gitignore (node_modules, dist, .env, data, *.db, *.session)
git init
git branch -M main
git add .
git commit -m "feat: complete Telegram Tools MTProto Monolith with GitHub Actions & Coolify CI/CD"

# 2. Создать публичный/приватный репозиторий на GitHub через GitHub CLI
gh repo create telegram-tools --public --source=. --remote=origin --push
```

---

### 4. Настройка в панели Coolify:
1. В Coolify добавить сервис: **Application** -> **Docker Image** (или через Webhook).
2. Image: `ghcr.io/<ВАШ_GITHUB_USERNAME>/telegram-tools:latest`.
3. Настроить **Persistent Volume**:
   - **Host Path / Volume**: `tg_data`
   - **Mount Path**: `/app/data`
4. Добавить **Environment Variables**:
   ```env
   TG_API_ID=ваш_api_id_из_my_telegram_org
   TG_API_HASH=ваш_api_hash_из_my_telegram_org
   APP_SECRET_KEY=сгенерируйте-надежный-ключ-32-символа
   ADMIN_PASSWORD=ваш-пароль-на-веб-панель
   PORT=8000
   ```
5. Скопировать **Webhook URL** из Coolify (раздел `Webhooks` / `Automatic Deployment`) и добавить его в GitHub Secrets репозитория:
   - Имя секрета: `COOLIFY_WEBHOOK_URL`.

---

## Критерии приёмки:
1. GitHub Actions успешно собирает образ и пушит в `ghcr.io`.
2. Coolify автоматически подтягивает свежий образ по Webhook.
3. Данные сессий сохраняются в постоянном томе `/app/data` и не сбрасываются при перезапусках контейнера.
