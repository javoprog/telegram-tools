import asyncio
import html
import json
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from telethon.tl.types import User

from backend.app.core.database import AsyncSessionLocal
from backend.app.models.log import TriggerLog
from backend.app.models.rule import Rule
from backend.app.services.telegram_manager import telegram_manager

logger = logging.getLogger("rule_engine")


@dataclass(frozen=True, slots=True)
class MessageContext:
    account_id: int
    chat_id: str
    raw_chat_id: int | str
    chat_title: str
    sender_id: int | None
    sender_name: str
    sender_username: str | None
    message_id: int
    message_text: str
    message_link: str


class RuleEngine:
    def __init__(self) -> None:
        # Values are monotonic expiration timestamps keyed by (rule, sender).
        self.cooldown_cache: dict[tuple[int, int], float] = {}
        self.ws_subscribers: set[Any] = set()
        self._cooldown_lock = asyncio.Lock()
        self._broadcast_lock = asyncio.Lock()

    def add_ws_subscriber(self, websocket: Any) -> None:
        self.ws_subscribers.add(websocket)

    def remove_ws_subscriber(self, websocket: Any) -> None:
        self.ws_subscribers.discard(websocket)

    async def broadcast_ws(self, payload: dict[str, Any]) -> None:
        async with self._broadcast_lock:
            subscribers = tuple(self.ws_subscribers)
            if not subscribers:
                return

            results = await asyncio.gather(
                *(
                    asyncio.wait_for(websocket.send_json(payload), timeout=5.0)
                    for websocket in subscribers
                ),
                return_exceptions=True,
            )
            for websocket, result in zip(subscribers, results):
                if isinstance(result, BaseException):
                    self.ws_subscribers.discard(websocket)
                    logger.debug("Removed unavailable WebSocket subscriber: %s", result)

    @staticmethod
    def _matches_keywords(
        text: str,
        triggers: list[str],
        excludes: list[str],
        mode: str,
        case_sensitive: bool,
    ) -> tuple[bool, list[str]]:
        if not text:
            return False, []

        normalized_text = text if case_sensitive else text.casefold()

        # Exclusions always have priority and short-circuit trigger evaluation.
        for exclude in excludes:
            candidate = exclude.strip()
            if not candidate:
                continue
            normalized_exclude = candidate if case_sensitive else candidate.casefold()
            if normalized_exclude in normalized_text:
                return False, []

        usable_triggers = [trigger.strip() for trigger in triggers if trigger.strip()]
        if not usable_triggers:
            return False, []

        flags = 0 if case_sensitive else re.IGNORECASE
        matched: list[str] = []

        if mode == "regex":
            for pattern in usable_triggers:
                try:
                    if re.search(pattern, text, flags=flags):
                        matched.append(pattern)
                except re.error:
                    logger.warning("Skipping invalid regular expression: %r", pattern)
            return bool(matched), matched

        if mode == "exact":
            for trigger in usable_triggers:
                if re.search(rf"\b{re.escape(trigger)}\b", text, flags=flags):
                    matched.append(trigger)
            return bool(matched), matched

        if mode == "all":
            for trigger in usable_triggers:
                normalized_trigger = trigger if case_sensitive else trigger.casefold()
                if normalized_trigger not in normalized_text:
                    return False, []
                matched.append(trigger)
            return True, matched

        if mode == "any":
            for trigger in usable_triggers:
                normalized_trigger = trigger if case_sensitive else trigger.casefold()
                if normalized_trigger in normalized_text:
                    matched.append(trigger)
            return bool(matched), matched

        logger.warning("Skipping rule with unsupported match mode: %s", mode)
        return False, []

    @staticmethod
    def _json_string_list(
        raw_value: str, *, rule_id: int, field_name: str
    ) -> list[str]:
        try:
            value = json.loads(raw_value or "[]")
        except (json.JSONDecodeError, TypeError):
            logger.warning("Rule %s has invalid JSON in %s", rule_id, field_name)
            return []
        if not isinstance(value, list) or not all(
            isinstance(item, str) for item in value
        ):
            logger.warning("Rule %s has a non-string list in %s", rule_id, field_name)
            return []
        return value

    @staticmethod
    def _source_matches(chat_id: str, source_chat_ids: list[str]) -> bool:
        normalized_sources = {
            source.strip() for source in source_chat_ids if source.strip()
        }
        return "*" in normalized_sources or chat_id in normalized_sources

    async def _is_on_cooldown(
        self,
        rule_id: int,
        sender_id: int | None,
        cooldown_seconds: int,
    ) -> bool:
        if cooldown_seconds <= 0 or sender_id is None:
            return False

        now = time.monotonic()
        key = (rule_id, sender_id)
        async with self._cooldown_lock:
            expires_at = self.cooldown_cache.get(key, 0.0)
            if expires_at > now:
                return True
            self.cooldown_cache[key] = now + cooldown_seconds

            # Prevent an unbounded cache on long-running installations.
            if len(self.cooldown_cache) > 10_000:
                self.cooldown_cache = {
                    cache_key: expiry
                    for cache_key, expiry in self.cooldown_cache.items()
                    if expiry > now
                }
        return False

    @staticmethod
    async def _extract_message_context(
        account_id: int, event: Any
    ) -> MessageContext | None:
        message = getattr(event, "message", None)
        if message is None:
            return None

        message_text = (
            getattr(message, "message", None)
            or getattr(message, "text", None)
            or getattr(event, "raw_text", None)
            or ""
        )
        chat_id = getattr(event, "chat_id", None)
        message_id = getattr(message, "id", None)
        if not message_text or chat_id is None or message_id is None:
            return None

        sender = await event.get_sender()
        sender_id = getattr(event, "sender_id", None) or getattr(
            message, "sender_id", None
        )
        sender_username = getattr(sender, "username", None) if sender else None
        if sender:
            first_name = getattr(sender, "first_name", None) or ""
            last_name = getattr(sender, "last_name", None) or ""
            sender_name = " ".join(
                part for part in (first_name, last_name) if part
            ).strip()
            sender_name = sender_name or getattr(sender, "title", None) or "Unknown"
        else:
            sender_name = "Unknown"

        chat = await event.get_chat()
        if chat:
            chat_first_name = getattr(chat, "first_name", None) or ""
            chat_last_name = getattr(chat, "last_name", None) or ""
            chat_title = (
                getattr(chat, "title", None)
                or " ".join(
                    part for part in (chat_first_name, chat_last_name) if part
                ).strip()
                or getattr(chat, "username", None)
                or "Private Chat"
            )
        else:
            chat_title = "Unknown Chat"

        chat_id_string = str(chat_id)
        chat_username = getattr(chat, "username", None) if chat else None
        message_link = ""
        if chat_username and not isinstance(chat, User):
            message_link = f"https://t.me/{chat_username}/{message_id}"
        elif chat_id_string.startswith("-100") and len(chat_id_string) > 4:
            message_link = f"https://t.me/c/{chat_id_string[4:]}/{message_id}"

        return MessageContext(
            account_id=account_id,
            chat_id=chat_id_string,
            raw_chat_id=chat_id,
            chat_title=str(chat_title),
            sender_id=int(sender_id) if sender_id is not None else None,
            sender_name=str(sender_name),
            sender_username=str(sender_username) if sender_username else None,
            message_id=int(message_id),
            message_text=str(message_text),
            message_link=message_link,
        )

    async def handle_incoming_message(
        self,
        account_id: int,
        _client: Any,
        event: Any,
    ) -> None:
        context = await self._extract_message_context(account_id, event)
        if context is None:
            return

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(Rule).where(
                    Rule.account_id == account_id,
                    Rule.is_active.is_(True),
                )
            )
            rules = list(result.scalars().all())

        matched_rules: list[tuple[Rule, list[str]]] = []
        for rule in rules:
            sources = self._json_string_list(
                rule.source_chat_ids,
                rule_id=rule.id,
                field_name="source_chat_ids",
            )
            if not self._source_matches(context.chat_id, sources):
                continue

            triggers = self._json_string_list(
                rule.trigger_words,
                rule_id=rule.id,
                field_name="trigger_words",
            )
            excludes = self._json_string_list(
                rule.exclude_words,
                rule_id=rule.id,
                field_name="exclude_words",
            )
            is_match, matched_words = self._matches_keywords(
                text=context.message_text,
                triggers=triggers,
                excludes=excludes,
                mode=rule.match_mode,
                case_sensitive=rule.case_sensitive,
            )
            if not is_match:
                continue
            if await self._is_on_cooldown(
                rule.id,
                context.sender_id,
                rule.cooldown_seconds,
            ):
                logger.debug(
                    "Rule %s skipped for sender %s due to cooldown",
                    rule.id,
                    context.sender_id,
                )
                continue
            matched_rules.append((rule, matched_words))

        results = await asyncio.gather(
            *(
                self._process_rule(rule, context, matched_words)
                for rule, matched_words in matched_rules
            ),
            return_exceptions=True,
        )
        for (rule, _matched_words), result in zip(matched_rules, results):
            if isinstance(result, BaseException):
                logger.error(
                    "Failed to persist or broadcast trigger for rule %s",
                    rule.id,
                    exc_info=(type(result), result, result.__traceback__),
                )

    async def _process_rule(
        self,
        rule: Rule,
        context: MessageContext,
        matched_words: list[str],
    ) -> None:
        action_status, error_message = await self._execute_actions(
            rule,
            context,
            matched_words,
        )
        log_entry = await self._save_log(
            rule,
            context,
            matched_words,
            action_status,
            error_message,
        )
        await self.broadcast_ws(
            {
                "type": "new_trigger_log",
                "data": self._log_event_data(log_entry, matched_words),
            }
        )

    async def _execute_actions(
        self,
        rule: Rule,
        context: MessageContext,
        matched_words: list[str],
    ) -> tuple[str, str | None]:
        errors: list[tuple[str, str]] = []

        if rule.action_type in {"forward_alert", "both"}:
            try:
                if not rule.target_chat_id:
                    raise ValueError("target_chat_id is not configured")
                await telegram_manager.send_message(
                    account_id=context.account_id,
                    target_chat_id=rule.target_chat_id,
                    text=self._format_alert_message(
                        template=rule.alert_template,
                        rule_name=rule.name,
                        chat_title=context.chat_title,
                        sender_name=context.sender_name,
                        sender_username=context.sender_username,
                        message_text=context.message_text,
                        matched_words=matched_words,
                        message_link=context.message_link,
                    ),
                    parse_mode="html",
                )
            except Exception as exc:
                logger.exception("Alert action failed for rule %s", rule.id)
                errors.append(("alert_error", str(exc)))

        if rule.action_type in {"auto_reply", "both"}:
            try:
                if not rule.reply_template:
                    raise ValueError("reply_template is not configured")
                if rule.reply_delay_seconds > 0:
                    await asyncio.sleep(rule.reply_delay_seconds)
                await telegram_manager.reply_to_message(
                    account_id=context.account_id,
                    chat_id=context.raw_chat_id,
                    reply_to_msg_id=context.message_id,
                    text=self._format_reply_text(
                        rule.reply_template,
                        context.sender_name,
                        context.sender_username,
                    ),
                )
            except Exception as exc:
                logger.exception("Auto-reply action failed for rule %s", rule.id)
                errors.append(("reply_error", str(exc)))

        if rule.action_type == "webhook":
            try:
                if not rule.webhook_url:
                    raise ValueError("webhook_url is not configured")
                payload = {
                    "event": "trigger_matched",
                    "account_id": context.account_id,
                    "rule": {"id": rule.id, "name": rule.name},
                    "chat": {"id": context.chat_id, "title": context.chat_title},
                    "sender": {
                        "id": context.sender_id,
                        "name": context.sender_name,
                        "username": context.sender_username,
                    },
                    "message": {
                        "id": context.message_id,
                        "text": context.message_text,
                        "link": context.message_link,
                    },
                    "matched_words": matched_words,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                async with httpx.AsyncClient(timeout=10.0) as http_client:
                    response = await http_client.post(rule.webhook_url, json=payload)
                    response.raise_for_status()
            except Exception as exc:
                logger.exception("Webhook action failed for rule %s", rule.id)
                errors.append(("webhook_error", str(exc)))

        if not errors:
            return "success", None
        return errors[0][0], "; ".join(
            f"{status}: {message}" for status, message in errors
        )

    @staticmethod
    async def _save_log(
        rule: Rule,
        context: MessageContext,
        matched_words: list[str],
        action_status: str,
        error_message: str | None,
    ) -> TriggerLog:
        log_entry = TriggerLog(
            rule_id=rule.id,
            account_id=context.account_id,
            rule_name=rule.name,
            source_chat_id=context.chat_id,
            source_chat_title=context.chat_title,
            sender_id=context.sender_id,
            sender_name=context.sender_name,
            sender_username=context.sender_username,
            message_id=context.message_id,
            message_text=context.message_text,
            message_link=context.message_link,
            matched_words=json.dumps(matched_words, ensure_ascii=False),
            action_status=action_status,
            error_message=error_message,
        )
        async with AsyncSessionLocal() as db:
            db.add(log_entry)
            await db.commit()
            await db.refresh(log_entry)
        return log_entry

    @staticmethod
    def _log_event_data(
        log_entry: TriggerLog,
        matched_words: list[str],
    ) -> dict[str, Any]:
        return {
            "id": log_entry.id,
            "rule_id": log_entry.rule_id,
            "account_id": log_entry.account_id,
            "rule_name": log_entry.rule_name,
            "source_chat_id": log_entry.source_chat_id,
            "source_chat_title": log_entry.source_chat_title,
            "sender_id": log_entry.sender_id,
            "sender_name": log_entry.sender_name,
            "sender_username": log_entry.sender_username,
            "message_id": log_entry.message_id,
            "message_text": log_entry.message_text,
            "message_link": log_entry.message_link,
            "matched_words": matched_words,
            "action_status": log_entry.action_status,
            "error_message": log_entry.error_message,
            "created_at": log_entry.created_at.isoformat(),
        }

    @staticmethod
    def _format_alert_message(
        template: str | None,
        rule_name: str,
        chat_title: str,
        sender_name: str,
        sender_username: str | None,
        message_text: str,
        matched_words: list[str],
        message_link: str,
    ) -> str:
        sender_username_text = (
            f"@{sender_username}" if sender_username else "нет username"
        )
        values = {
            "rule_name": html.escape(rule_name),
            "chat_title": html.escape(chat_title),
            "sender_name": html.escape(sender_name),
            "sender_username": html.escape(sender_username_text),
            "message_text": html.escape(message_text),
            "matched_words": ", ".join(
                f"<code>{html.escape(word)}</code>" for word in matched_words
            ),
            "message_link": html.escape(message_link, quote=True),
        }

        if template:
            try:
                return template.format_map(values)
            except (KeyError, ValueError) as exc:
                raise ValueError(f"Invalid alert_template: {exc}") from exc

        lines = [
            f"🔔 <b>Сработало правило:</b> <code>{values['rule_name']}</code>",
            f"💬 <b>Чат:</b> {values['chat_title']}",
            f"👤 <b>Автор:</b> {values['sender_name']} ({values['sender_username']})",
            f"🎯 <b>Ключевые слова:</b> {values['matched_words']}",
            "",
            f"📝 <b>Сообщение:</b>\n<blockquote>{values['message_text']}</blockquote>",
        ]
        if message_link:
            lines.append(
                f'\n👉 <a href="{values["message_link"]}">Перейти к сообщению</a>'
            )
        return "\n".join(lines)

    @staticmethod
    def _format_reply_text(
        template: str,
        sender_name: str,
        sender_username: str | None,
    ) -> str:
        return template.replace("{sender_name}", sender_name).replace(
            "{sender_username}",
            sender_username or "",
        )


rule_engine = RuleEngine()
telegram_manager.register_message_handler(rule_engine.handle_incoming_message)
