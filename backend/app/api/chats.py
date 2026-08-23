from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.account import Account, AccountStatus
from backend.app.schemas.chat import ChatDialog, ChatListResponse, ChatTypeFilter
from backend.app.services.telegram_manager import TelegramManagerError, telegram_manager

router = APIRouter(prefix="/api/chats", tags=["Chats"])


async def _active_account(
    db: AsyncSession,
) -> Account:
    result = await db.execute(
        select(Account)
        .where(
            Account.status == AccountStatus.CONNECTED,
            Account.is_active.is_(True),
        )
        .order_by(Account.id.desc())
        .limit(1)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Telegram account found",
        )

    if (
        account.status != AccountStatus.CONNECTED
        or not account.is_active
        or not account.session_string
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Telegram account is not active",
        )
    return account


@router.get("/dialogs", response_model=ChatListResponse)
async def get_dialogs(
    query: str | None = Query(default=None, max_length=255),
    chat_type: ChatTypeFilter | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> ChatListResponse:
    account = await _active_account(db)
    client = telegram_manager.clients.get(account.id)

    try:
        if client is None or not client.is_connected():
            await telegram_manager.start_client_session(
                account_id=account.id,
                session_encrypted=account.session_string,
            )
        dialogs = await telegram_manager.get_dialogs(account.id)
    except TelegramManagerError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    if query and (normalized_query := query.strip().casefold()):
        dialogs = [
            dialog
            for dialog in dialogs
            if normalized_query in dialog["title"].casefold()
            or normalized_query in (dialog.get("username") or "").casefold()
        ]
    if chat_type is not None:
        dialogs = [dialog for dialog in dialogs if dialog["type"] == chat_type]

    return ChatListResponse(
        total=len(dialogs),
        chats=[ChatDialog.model_validate(dialog) for dialog in dialogs],
    )
