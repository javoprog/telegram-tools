# 📋 Codex Prompts Index — Telegram Tools

Каталог готовых пошаговых спринт-промптов для **Codex**:

| Спринт | Файл промпта | Описание задач |
| :--- | :--- | :--- |
| **Sprint 01** | [`sprint-01-auth-and-multi-account.md`](file:///c:/javoprog/telegram-tools/prompts/sprint-01-auth-and-multi-account.md) | Архитектура монолита, глобальные `TG_API_ID/HASH` в `.env`, шифрование сессий (Fernet), мульти-аккаунт MTProto менеджер. |
| **Sprint 02** | [`sprint-02-rule-engine-and-chats.md`](file:///c:/javoprog/telegram-tools/prompts/sprint-02-rule-engine-and-chats.md) | Движок правил: фильтрация чатов, триггер-слова (ANY/ALL/Regex/Exact), минус-слова, алерты со ссылками, автоответы, вебхуки, WebSockets. |
| **Sprint 03** | [`sprint-03-frontend-dashboard.md`](file:///c:/javoprog/telegram-tools/prompts/sprint-03-frontend-dashboard.md) | Веб-дашборд на React + Tailwind: конструктор правил, живой монитор с подсветкой, обозреватель чатов, мастер MTProto авторизации. |
| **Sprint 04** | [`sprint-04-github-actions-and-coolify-deploy.md`](file:///c:/javoprog/telegram-tools/prompts/sprint-04-github-actions-and-coolify-deploy.md) | Сборка в GitHub Actions, публикация в GHCR, автодеплой на Coolify через Webhook, создание репозитория через GitHub CLI (`gh`). |

---

## 🎯 Инструкция по работе:
1. Передавайте промпты в Codex по очереди (Sprint 01 -> Sprint 02 -> Sprint 03 -> Sprint 04).
2. Каждый промпт содержит четкую роль, архитектурные ограничения, точные структуры файлов и критерии приёмки.
