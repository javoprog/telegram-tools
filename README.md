# 🚀 Telegram Tools: MTProto Listener & Autoresponder

Полнофункциональное веб-приложение (монолит) для мониторинга Telegram-сообщений по ключевым словам и триггерам, автоответов и пересылки уведомлений в отдельную группу/канал. Работает через официальный **Telegram MTProto API** (Userbot), что позволяет слушать закрытые чаты, где запрещены боты.

Готово к развертыванию в 1 клик на **Coolify**.

---

## 🌟 Основные возможности

- 📱 **MTProto Авторизация**: Авторизация по номеру телефона, коду из Telegram/SMS и паролю 2FA.
- 🎯 **Гибкий движок триггеров**:
  - Логика соответствия: `Любое слово (ANY)`, `Все слова (ALL)`, `Регулярные выражения (Regex)`, `Точное совпадение слова (Word boundary)`.
  - Минус-слова / исключения (blacklist).
  - Чувствительность к регистру (Case-sensitive).
- 💬 **Выбор источников и получателей**:
  - Визуальный выбор групп, каналов и личных чатов по названию — без ручного ввода ID.
  - Прослушивание всех чатов (`*`) или конкретных диалогов.
  - Пересылка красивых отчетов со ссылкой на оригинальное сообщение в целевой чат.
- 🤖 **Автоответчик (Auto-reply)**:
  - Автоматический ответ автору сообщения в исходный чат с настраиваемой задержкой (антибан) и кулдауном.
- 🌐 **Webhooks**:
  - Отправка JSON POST на внешние сервисы (n8n, Make, Zapier, собственный бэкенд).
- ⚡ **Real-time Live Stream**:
  - Живой стрим пойманных сообщений по WebSockets с подсветкой триггеров.
- 🔒 **Безопасность**:
  - Сессии Telegram хранятся в зашифрованном виде (AES/Fernet).
  - Приложение работает с одним активным аккаунтом и не хранит пароль веб-панели.

---

## 🛠 Стек технологий

- **Backend**: Python 3.11, FastAPI, Telethon (MTProto), SQLAlchemy (Async), SQLite WAL, WebSockets.
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons.
- **Деплой**: Multi-stage Docker Monolith (Node.js собирает фронтенд, Python раздает API и статику).

---

## 🚢 Деплой на Coolify

1. В Coolify создайте новый ресурс: **Application** -> **Public/Private Git Repository** (или Dockerfile).
2. Укажите репозиторий проекта.
3. Выберите тип сборки: **Dockerfile** (или **Docker Compose**).
4. Укажите переменные окружения (`Environment Variables`):
   ```env
   TG_API_ID=ваш-api-id-с-my.telegram.org
   TG_API_HASH=ваш-api-hash-с-my.telegram.org
   APP_SECRET_KEY=сгенерируйте-надежный-секретный-ключ-32-символа
   PORT=8000
   ```
   `TG_API_ID` и `TG_API_HASH` являются общими ключами приложения: они обязательны и не принимаются через веб-интерфейс.
5. Настройте Persistent Storage (Persistent Volume) в Coolify:
   - **Host Path / Volume Name**: `tg_data`
   - **Mount Path**: `/app/data`
6. Нажмите **Deploy**. Приложение запустится на указанном вами домене.

---

## 💻 Локальный запуск через Docker Compose

```bash
# 1. Скопируйте файл окружения
cp .env.example .env

# Заполните TG_API_ID, TG_API_HASH и APP_SECRET_KEY

# 2. Запустите через Docker Compose
docker-compose up --build -d
```

После этого веб-интерфейс будет доступен по адресу: `http://localhost:8000`.

---

## 📁 Структура проекта

```
telegram-tools/
├── backend/
│   ├── app/
│   │   ├── api/             # REST & WebSocket эндпоинты (auth, chats, rules, logs, ws)
│   │   ├── core/            # Конфигурация, безопасность, база данных SQLite WAL
│   │   ├── models/          # SQLAlchemy модели (Account, Rule, TriggerLog)
│   │   ├── schemas/         # Pydantic схемы валидации
│   │   ├── services/        # Telethon Client Manager, Rule Match Engine, Encryption
│   │   └── main.py          # FastAPI приложение, фоновые слушатели, SPA fallback
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # API клиент
│   │   ├── components/      # Navbar, Modal, ChatPickerModal
│   │   ├── pages/           # RulesPage, LogsPage, ChatsPage, AuthPage
│   │   ├── types/           # TypeScript интерфейсы
│   │   ├── App.tsx          # Главный роутер и WebSocket клиент
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── Dockerfile               # Multi-stage Docker сборка
├── docker-compose.yml
├── .env.example
└── README.md
```
