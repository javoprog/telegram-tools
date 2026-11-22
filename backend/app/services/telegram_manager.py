import asyncio
import inspect
import logging
import time
from collections.abc import Callable
from typing import Any

from telethon import TelegramClient, events
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberBannedError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession
from telethon.tl.types import Channel, Chat, User

from backend.app.core.config import settings
from backend.app.services.encryption import SessionEncryptionError, decrypt_string

logger = logging.getLogger("telegram_manager")


class TelegramManagerError(RuntimeError):
    pass


class TelegramAuthError(TelegramManagerError):
    pass


class TelegramFloodWaitError(TelegramAuthError):
    def __init__(self, seconds: int):
        self.seconds = int(seconds)
        super().__init__(f"Too many Telegram requests. Retry in {self.seconds} seconds")


class TelegramSessionError(TelegramManagerError):
    pass


class TelegramClientManager:
    """Owns one authorized Telethon client per application account."""

    def __init__(self) -> None:
        self.clients: dict[int, TelegramClient] = {}
        self.pending_auth: dict[str, dict[str, Any]] = {}
        self.message_handlers: list[Callable[..., Any]] = []
        self._client_locks: dict[int, asyncio.Lock] = {}
        self._auth_locks: dict[str, asyncio.Lock] = {}
        # Dialog list cache: account_id -> (monotonic fetch time, dialogs).
        # Fetching every dialog is expensive and quickly hits Telegram's
        # GetDialogsRequest flood limits, so pages share one cached copy.
        self._dialogs_cache: dict[int, tuple[float, list[dict[str, Any]]]] = {}
        self._dialog_locks: dict[int, asyncio.Lock] = {}
        self._warmup_tasks: set[asyncio.Task[None]] = set()

    def register_message_handler(self, handler: Callable[..., Any]) -> None:
        if handler not in self.message_handlers:
            self.message_handlers.append(handler)

    async def get_credentials(self) -> tuple[int, str]:
        """Return only the global application credentials from configuration."""
        try:
            return settings.telegram_credentials()
        except RuntimeError as exc:
            raise TelegramManagerError(str(exc)) from exc

    def _auth_lock(self, phone_number: str) -> asyncio.Lock:
        return self._auth_locks.setdefault(phone_number, asyncio.Lock())

    def _client_lock(self, account_id: int) -> asyncio.Lock:
        return self._client_locks.setdefault(account_id, asyncio.Lock())

    def _dialog_lock(self, account_id: int) -> asyncio.Lock:
        return self._dialog_locks.setdefault(account_id, asyncio.Lock())

    async def _disconnect(self, client: TelegramClient | None) -> None:
        if client is None:
            return
        try:
            if client.is_connected():
                await client.disconnect()
        except Exception:
            logger.exception("Failed to disconnect a Telethon client")

    async def cancel_pending_auth(self, phone_number: str) -> None:
        auth_data = self.pending_auth.pop(phone_number, None)
        if auth_data:
            await self._disconnect(auth_data.get("client"))

    async def request_phone_code(self, phone_number: str) -> dict[str, Any]:
        """Create a temporary StringSession and ask Telegram to deliver a code."""
        async with self._auth_lock(phone_number):
            await self.cancel_pending_auth(phone_number)
            api_id, api_hash = await self.get_credentials()
            client = TelegramClient(StringSession(), api_id, api_hash)

            try:
                await client.connect()
                sent_code = await client.send_code_request(phone_number)
            except FloodWaitError as exc:
                await self._disconnect(client)
                raise TelegramFloodWaitError(exc.seconds) from exc
            except PhoneNumberInvalidError as exc:
                await self._disconnect(client)
                raise TelegramAuthError("Telegram rejected the phone number") from exc
            except PhoneNumberBannedError as exc:
                await self._disconnect(client)
                raise TelegramAuthError(
                    "This phone number is banned by Telegram"
                ) from exc
            except Exception as exc:
                await self._disconnect(client)
                raise TelegramAuthError(
                    "Unable to request a Telegram login code"
                ) from exc

            self.pending_auth[phone_number] = {
                "client": client,
                "phone_code_hash": sent_code.phone_code_hash,
            }
            return {
                "status": "awaiting_code",
                "phone_number": phone_number,
                "phone_code_hash": sent_code.phone_code_hash,
                "message": "Confirmation code sent",
            }

    async def _completed_auth_result(
        self,
        phone_number: str,
        client: TelegramClient,
    ) -> dict[str, Any]:
        me = await client.get_me()
        if me is None:
            raise TelegramAuthError("Telegram did not return the authorized user")

        session_string = client.session.save()
        result = {
            "status": "connected",
            "session_string": session_string,
            "user": {
                "id": me.id,
                "first_name": me.first_name,
                "last_name": me.last_name,
                "username": me.username,
                "phone": me.phone,
            },
        }
        self.pending_auth.pop(phone_number, None)
        await self._disconnect(client)
        return result

    async def verify_code(self, phone_number: str, code: str) -> dict[str, Any]:
        """Verify a Telegram code and preserve the temporary client for 2FA."""
        async with self._auth_lock(phone_number):
            auth_data = self.pending_auth.get(phone_number)
            if auth_data is None:
                raise TelegramAuthError(
                    "No active login session for this phone number. Request a new code"
                )

            client: TelegramClient = auth_data["client"]
            try:
                if not client.is_connected():
                    await client.connect()
                await client.sign_in(
                    phone=phone_number,
                    code=code,
                    phone_code_hash=auth_data["phone_code_hash"],
                )
                return await self._completed_auth_result(phone_number, client)
            except SessionPasswordNeededError:
                return {
                    "status": "awaiting_password",
                    "phone_number": phone_number,
                    "message": "Telegram 2FA password required",
                }
            except PhoneCodeInvalidError as exc:
                raise TelegramAuthError("Invalid confirmation code") from exc
            except PhoneCodeExpiredError as exc:
                await self.cancel_pending_auth(phone_number)
                raise TelegramAuthError(
                    "Confirmation code expired. Request a new code"
                ) from exc
            except FloodWaitError as exc:
                raise TelegramFloodWaitError(exc.seconds) from exc
            except TelegramManagerError:
                raise
            except Exception as exc:
                raise TelegramAuthError("Unable to verify the Telegram code") from exc

    async def verify_2fa_password(
        self,
        phone_number: str,
        password: str,
    ) -> dict[str, Any]:
        """Complete an authorization that requires Telegram cloud password."""
        async with self._auth_lock(phone_number):
            auth_data = self.pending_auth.get(phone_number)
            if auth_data is None:
                raise TelegramAuthError(
                    "No active login session for this phone number. Request a new code"
                )

            client: TelegramClient = auth_data["client"]
            try:
                if not client.is_connected():
                    await client.connect()
                await client.sign_in(password=password)
                return await self._completed_auth_result(phone_number, client)
            except PasswordHashInvalidError as exc:
                raise TelegramAuthError("Incorrect Telegram 2FA password") from exc
            except FloodWaitError as exc:
                raise TelegramFloodWaitError(exc.seconds) from exc
            except TelegramManagerError:
                raise
            except Exception as exc:
                raise TelegramAuthError(
                    "Unable to verify the Telegram 2FA password"
                ) from exc

    async def start_client_session(
        self,
        account_id: int,
        session_encrypted: str,
    ) -> TelegramClient:
        """Decrypt, authorize and attach the incoming-message listener."""
        async with self._client_lock(account_id):
            existing = self.clients.get(account_id)
            if existing is not None and existing.is_connected():
                return existing
            if existing is not None:
                self.clients.pop(account_id, None)
                await self._disconnect(existing)

            try:
                session_string = decrypt_string(session_encrypted)
            except SessionEncryptionError as exc:
                raise TelegramSessionError(str(exc)) from exc
            if not session_string:
                raise TelegramSessionError("Telegram session is empty")

            api_id, api_hash = await self.get_credentials()
            client = TelegramClient(StringSession(session_string), api_id, api_hash)

            try:
                await client.connect()
                if not await client.is_user_authorized():
                    raise TelegramSessionError(
                        f"Telegram session for account {account_id} is no longer authorized"
                    )

                @client.on(events.NewMessage(incoming=True))
                async def on_new_message(event) -> None:
                    for handler in tuple(self.message_handlers):
                        try:
                            result = handler(account_id, client, event)
                            if inspect.isawaitable(result):
                                await result
                        except Exception:
                            logger.exception(
                                "Incoming message handler failed for account %s",
                                account_id,
                            )

                self.clients[account_id] = client
                logger.info("Telethon client started for account %s", account_id)
                self._schedule_dialogs_warmup(account_id)
                return client
            except Exception as exc:
                await self._disconnect(client)
                if isinstance(exc, TelegramSessionError):
                    raise
                raise TelegramSessionError(
                    f"Failed to start Telegram session for account {account_id}"
                ) from exc

    async def stop_client_session(self, account_id: int) -> None:
        async with self._client_lock(account_id):
            client = self.clients.pop(account_id, None)
            self.invalidate_dialogs(account_id)
            await self._disconnect(client)
            if client is not None:
                logger.info("Telethon client stopped for account %s", account_id)

    @staticmethod
    def _dialogs_ttl() -> float:
        return max(0.0, float(settings.DIALOGS_CACHE_TTL_SECONDS))

    @staticmethod
    def _copy_dialogs(dialogs: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [dict(dialog) for dialog in dialogs]

    def _fresh_cached_dialogs(
        self, account_id: int, not_older_than: float | None = None
    ) -> list[dict[str, Any]] | None:
        cached = self._dialogs_cache.get(account_id)
        ttl = self._dialogs_ttl()
        if cached is None or ttl <= 0:
            return None
        fetched_at, dialogs = cached
        if time.monotonic() - fetched_at >= ttl:
            return None
        if not_older_than is not None and fetched_at < not_older_than:
            return None
        return self._copy_dialogs(dialogs)

    def invalidate_dialogs(self, account_id: int) -> None:
        self._dialogs_cache.pop(account_id, None)

    def _schedule_dialogs_warmup(self, account_id: int) -> None:
        """Fill the dialog cache in the background so the first page load is fast."""
        if self._dialogs_ttl() <= 0:
            return
        task = asyncio.create_task(self._warm_dialogs(account_id))
        self._warmup_tasks.add(task)
        task.add_done_callback(self._warmup_tasks.discard)

    async def _warm_dialogs(self, account_id: int) -> None:
        try:
            dialogs = await self.get_dialogs(account_id)
            logger.info(
                "Dialog cache warmed for account %s (%s chats)", account_id, len(dialogs)
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "Dialog cache warm-up failed for account %s", account_id, exc_info=True
            )

    async def get_dialogs(
        self, account_id: int, force_refresh: bool = False
    ) -> list[dict[str, Any]]:
        """Return the account's dialogs, cached for DIALOGS_CACHE_TTL_SECONDS.

        Concurrent callers share a single Telegram fetch. With force_refresh the
        cache is bypassed, but a refresh that finished after this call started
        is reused. If Telegram fails (e.g. flood wait) a stale copy is served.
        """
        requested_at = time.monotonic()
        if not force_refresh:
            cached = self._fresh_cached_dialogs(account_id)
            if cached is not None:
                return cached

        async with self._dialog_lock(account_id):
            cached = self._fresh_cached_dialogs(
                account_id, not_older_than=requested_at if force_refresh else None
            )
            if cached is not None:
                return cached

            try:
                dialogs = await self._fetch_dialogs(account_id)
            except TelegramManagerError:
                stale = self._dialogs_cache.get(account_id)
                if stale is not None and account_id in self.clients:
                    logger.warning(
                        "Serving stale dialog cache for account %s after fetch failure",
                        account_id,
                    )
                    return self._copy_dialogs(stale[1])
                raise

            if self._dialogs_ttl() > 0 and account_id in self.clients:
                self._dialogs_cache[account_id] = (time.monotonic(), dialogs)
            return self._copy_dialogs(dialogs)

    async def _fetch_dialogs(self, account_id: int) -> list[dict[str, Any]]:
        client = self.clients.get(account_id)
        if client is None or not client.is_connected():
            raise TelegramSessionError(f"Account {account_id} is not connected")

        dialogs: list[dict[str, Any]] = []
        try:
            async for dialog in client.iter_dialogs(limit=None):
                entity = dialog.entity
                chat_type = "user"
                is_creator = False
                is_admin = False

                if isinstance(entity, Channel):
                    chat_type = "channel" if entity.broadcast else "supergroup"
                    is_creator = bool(getattr(entity, "creator", False))
                    is_admin = (
                        is_creator or getattr(entity, "admin_rights", None) is not None
                    )
                elif isinstance(entity, Chat):
                    chat_type = "group"
                    is_creator = bool(getattr(entity, "creator", False))
                    is_admin = (
                        is_creator or getattr(entity, "admin_rights", None) is not None
                    )
                elif isinstance(entity, User):
                    chat_type = "bot" if entity.bot else "user"

                dialogs.append(
                    {
                        "id": str(dialog.id),
                        "title": dialog.name or "Unnamed",
                        "type": chat_type,
                        "username": getattr(entity, "username", None),
                        "unread_count": dialog.unread_count,
                        "is_admin": is_admin,
                        "is_creator": is_creator,
                    }
                )
        except Exception as exc:
            raise TelegramSessionError(
                f"Failed to load dialogs for account {account_id}"
            ) from exc
        return dialogs

    def _connected_client(self, account_id: int) -> TelegramClient:
        client = self.clients.get(account_id)
        if client is None or not client.is_connected():
            raise TelegramSessionError(f"Account {account_id} is not connected")
        return client

    async def send_message(
        self,
        account_id: int,
        target_chat_id: str | int,
        text: str,
        parse_mode: str = "html",
    ) -> Any:
        client = self._connected_client(account_id)
        target: Any = (
            int(target_chat_id)
            if str(target_chat_id).lstrip("-").isdigit()
            else target_chat_id
        )
        return await client.send_message(
            target,
            text,
            parse_mode=parse_mode,
            link_preview=False,
        )

    async def reply_to_message(
        self,
        account_id: int,
        chat_id: str | int,
        reply_to_msg_id: int,
        text: str,
    ) -> Any:
        client = self._connected_client(account_id)
        target: Any = int(chat_id) if str(chat_id).lstrip("-").isdigit() else chat_id
        return await client.send_message(target, text, reply_to=reply_to_msg_id)

    async def shutdown(self) -> None:
        warmup_tasks = list(self._warmup_tasks)
        for task in warmup_tasks:
            task.cancel()
        await asyncio.gather(*warmup_tasks, return_exceptions=True)
        self._warmup_tasks.clear()
        self._dialogs_cache.clear()

        active_clients = list(self.clients.values())
        pending_clients = [
            data.get("client")
            for data in self.pending_auth.values()
            if data.get("client")
        ]
        self.clients.clear()
        self.pending_auth.clear()
        await asyncio.gather(
            *(self._disconnect(client) for client in active_clients + pending_clients),
            return_exceptions=True,
        )


telegram_manager = TelegramClientManager()
