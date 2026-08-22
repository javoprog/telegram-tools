# Codex Prompt: Sprint 01 — Core Architecture, App-Level TG API & Multi-Account MTProto Auth

## Роль:
Ты — Senior Backend & Python / Telegram MTProto инженер (FastAPI, Telethon, SQLAlchemy Async, SQLite WAL, WebSockets, Fernet Encryption).

## Контекст проекта:
Веб-приложение **Telegram Tools** — монолитная платформа для мониторинга сообщений в чатах и группах по триггер-словам, автоответов и пересылки уведомлений. Работает через MTProto Userbot API (позволяет слушать чаты, где запрещены боты).

## Архитектурные требования:
1. **Глобальные Telegram API Credentials**:
   - `TG_API_ID` и `TG_API_HASH` принадлежат самому приложению и задаются **строго через `.env`** (не запрашиваются у пользователя).
2. **Многопользовательский режим (Multi-Account)**:
   - Поддержка нескольких независимых Telegram-аккаунтов (номеров телефонов).
   - Для каждого аккаунта сохраняется зашифрованная сессия (`session_string` через `cryptography.fernet`).
   - У каждого аккаунта свои правила мониторинга, независимый Telethon Client и свои логи.
3. **Безопасность**:
   - Веб-панель защищена мастер-паролем `ADMIN_PASSWORD` (JWT bearer токены).
   - Все Telethon-сессии в БД шифруются с использованием `APP_SECRET_KEY`.

---

## Задачи реализации:

### 1. Структура конфигурации и БД (`backend/app/core/`):
- `config.py`:
  - Чтение `TG_API_ID`, `TG_API_HASH`, `APP_SECRET_KEY`, `ADMIN_PASSWORD`, `DATA_DIR` (`/app/data`), `DATABASE_URL` (`sqlite+aiosqlite:////app/data/app.db`).
- `database.py`:
  - Асинхронный SQLAlchemy сессионный фабрикатор с включением `PRAGMA journal_mode=WAL` и `PRAGMA busy_timeout=5000` для SQLite.
- `security.py`:
  - JWT токен генерация/верификация + хэширование паролей (Passlib / bcrypt).
- `services/encryption.py`:
  - Fernet AES шифрование/дешифрование строк сессий по ключу `APP_SECRET_KEY`.

### 2. Модели данных SQLAlchemy 2.0 (`backend/app/models/`):
- `Account`:
  - `id`: Integer PK
  - `phone_number`: String (unique)
  - `telegram_user_id`: BigInteger
  - `first_name`, `last_name`, `username`: String
  - `session_string`: Text (Encrypted)
  - `status`: Enum (`disconnected`, `awaiting_code`, `awaiting_password`, `connected`, `error`)
  - `phone_code_hash`: String
  - `is_active`: Boolean
  - `created_at`, `updated_at`: DateTime
- `Rule`:
  - `id`: Integer PK
  - `account_id`: FK -> `accounts.id` (связь с конкретным аккаунтом)
  - `name`: String
  - `description`: Text
  - `is_active`: Boolean
  - `source_chat_ids`: Text (JSON Array: `["-100123", "456"]` или `["*"]`)
  - `target_chat_id`: String (Куда слать алерт)
  - `trigger_words`: Text (JSON Array ключевых слов)
  - `exclude_words`: Text (JSON Array минус-слов)
  - `match_mode`: String (`any`, `all`, `regex`, `exact`)
  - `case_sensitive`: Boolean
  - `action_type`: String (`forward_alert`, `auto_reply`, `webhook`, `both`)
  - `alert_template`, `reply_template`: Text
  - `reply_delay_seconds`: Integer (default 2)
  - `webhook_url`: String
  - `cooldown_seconds`: Integer (антиспам)
- `TriggerLog`:
  - `id`: Integer PK
  - `rule_id`: FK -> `rules.id`
  - `account_id`: FK -> `accounts.id`
  - `source_chat_id`, `source_chat_title`: String
  - `sender_id`: BigInteger, `sender_name`, `sender_username`: String
  - `message_id`: BigInteger, `message_text`, `message_link`: Text
  - `matched_words`: Text (JSON Array)
  - `action_status`: String (`success`, `alert_error`, `reply_error`)
  - `created_at`: DateTime (индексировано)

### 3. MTProto Client Manager (`backend/app/services/telegram_manager.py`):
- Управление пулом активных клиентов `Dict[int, TelegramClient]` по `account_id`.
- Пошаговый флоу авторизации:
  1. `request_phone_code(phone_number)`: создает временный `StringSession()`, подключается к MTProto, отправляет код в Telegram/SMS, сохраняет `phone_code_hash`. Обрабатывает `FloodWaitError`.
  2. `verify_code(phone_number, code)`: проверяет код. Если нужен 2FA, переводит в статус `awaiting_password`. При успехе шифрует сессию и сохраняет аккаунт со статусом `connected`.
  3. `verify_2fa_password(phone_number, password)`: завершает вход с облачным паролем.
- Фоновый запуск клиентов:
  - Метод `start_client_session(account_id, session_encrypted)` поднимает сессию и вешает декоратор `events.NewMessage(incoming=True)`.
  - Автоматический старт всех активных аккаунтов при запуске приложения в FastAPI `lifespan`.
- Получение диалогов:
  - Метод `get_dialogs(account_id)` возвращает каналы, супергруппы, группы и личные чаты с метаданными (`id`, `title`, `type`, `username`, `is_admin`, `is_creator`).

### 4. REST API Эндпоинты (`backend/app/api/auth.py`):
- `POST /api/auth/login` (мастер-пароль админа -> JWT токен)
- `GET /api/auth/me`
- `GET /api/auth/telegram/accounts` (список подключенных аккаунтов)
- `POST /api/auth/telegram/request-code` (отправка кода на телефон)
- `POST /api/auth/telegram/verify-code` (ввод кода)
- `POST /api/auth/telegram/verify-2fa` (ввод 2FA пароля)
- `POST /api/auth/telegram/disconnect/{account_id}` (отключение и деактивация)

## Критерии приёмки:
1. `TG_API_ID` и `TG_API_HASH` берутся только из переменных окружения.
2. Сессии Telegram сохраняются в зашифрованном виде.
3. Полностью работает авторизация нового аккаунта (включая обработку 2FA и ошибок неверного кода).
4. При перезапуске сервера все активные аккаунты автоматически восстанавливают сессию в фоне.
