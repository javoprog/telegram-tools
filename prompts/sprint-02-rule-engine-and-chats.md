# Codex Prompt: Sprint 02 — Telegram Dialogs & Dynamic Rule Match Engine

## Роль:
Ты — Senior Backend Engineer (Python, FastAPI, Telethon, AsyncIO, WebSockets, Regex Engine).

## Контекст проекта:
Веб-приложение **Telegram Tools**. В Sprint 01 реализована MTProto авторизация и мульти-аккаунт менеджер сессий.
Задача данного спринта — создать надежный движок прослушивания сообщений, проверки триггер-слов, генерации алертов в целевой чат, автоответов и трансляции событий в WebSockets.

---

## Задачи реализации:

### 1. Движок сопоставления правил (`backend/app/services/rule_engine.py`):
- **Слушатель событий Telethon**:
  - Подписывается на входящие сообщения через `telegram_manager.register_message_handler`.
  - Извлекает `chat_id`, `sender_id`, имя автора (`sender_name`), `@username`, `message_text`, и формирует ссылку на сообщение `message_link` (например: `https://t.me/c/{chat_id}/{msg_id}` или `https://t.me/{username}/{msg_id}`).
- **Фильтрация и логика сопоставления**:
  - Исходные чаты (`source_chat_ids`): проверка, входит ли ID чата в список прослушиваемых или установлен ли wildcard `*`.
  - Минус-слова (`exclude_words`): если хоть одно минус-слово найдено в тексте сообщения, сообщение **немедленно отбрасывается**.
  - Режимы поиска (`match_mode`):
    - `any`: срабатывает при наличии любого из ключевых слов.
    - `all`: срабатывает только при одновременном наличии всех ключевых слов.
    - `regex`: проверяет валидные регулярные выражения.
    - `exact`: поиск точного совпадения по границам слов (`\bword\b`).
  - Учет регистра (`case_sensitive`): флаг для точного или нечувствительного к регистру поиска.
  - Антиспам кулдаун (`cooldown_seconds`): кэширование последнего срабатывания по ключу `f"{rule_id}_{sender_id}"`.

- **Выполнение действий**:
  - `forward_alert`: отправляет форматированное HTML/Markdown сообщение в `target_chat_id`.
    - Поддерживает плейсхолдеры: `{rule_name}`, `{chat_title}`, `{sender_name}`, `{sender_username}`, `{message_text}`, `{matched_words}`, `{message_link}`.
    - По умолчанию отправляет красивое сообщение со ссылкой на оригинальный пост и цитатой (HTML `<blockquote>`).
  - `auto_reply`: отправляет ответ (`reply_to_msg_id`) автору в исходный чат с задержкой `reply_delay_seconds` (антибан) и шаблоном `{sender_name}`.
  - `webhook`: отправляет асинхронный HTTP POST запрос с JSON телом на `webhook_url`.
- **Логирование и WebSockets**:
  - Запись факта срабатывания в таблицу `trigger_logs`.
  - Немедленная трансляция события `{ type: "new_trigger_log", data: ... }` всем подключенным WebSocket-клиентам дашборда.

### 2. API Эндпоинты диалогов (`backend/app/api/chats.py`):
- `GET /api/chats/dialogs`:
  - Query параметры: `account_id` (опционально), `query` (поиск по названию или username), `chat_type` (`channel`, `supergroup`, `group`, `user`).
  - Возвращает список доступных диалогов с метаданными и количеством непрочитанных.

### 3. API Эндпоинты правил (`backend/app/api/rules.py`):
- `GET /api/rules/` — список правил для выбранного аккаунта или всех аккаунтов.
- `POST /api/rules/` — создание нового правила.
- `GET /api/rules/{id}` — получение деталей правила.
- `PUT /api/rules/{id}` — обновление настроек правила.
- `PATCH /api/rules/{id}/toggle` — мгновенное включение / выключение правила (тумблер).
- `DELETE /api/rules/{id}` — удаление правила.

### 4. API Эндпоинты логов и WebSockets (`backend/app/api/logs.py`, `backend/app/api/ws.py`):
- `GET /api/logs/` — пагинация логов, фильтрация по `rule_id` и текстовому поиску `query`.
- `DELETE /api/logs/clear` — полная очистка истории логов.
- `WebSocket /api/ws/events` — стрим событий в реальном времени.

## Критерии приёмки:
1. При отправке сообщения в отслеживаемый чат с триггер-словом алерт мгновенно уходит в целевой чат с работающей ссылкой на сообщение.
2. Минус-слова блокируют отправку алертов.
3. События без задержки отображаются в WebSocket потоке.
