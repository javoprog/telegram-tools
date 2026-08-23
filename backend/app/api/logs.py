import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.account import Account, AccountStatus
from backend.app.models.log import TriggerLog
from backend.app.schemas.log import LogListResponse, TriggerLogResponse

router = APIRouter(prefix="/api/logs", tags=["Logs"])


def _matched_words(raw_value: str) -> list[str]:
    try:
        value = json.loads(raw_value or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(value, list):
        return []
    return [word for word in value if isinstance(word, str)]


def _serialize_log(log_entry: TriggerLog) -> TriggerLogResponse:
    return TriggerLogResponse(
        id=log_entry.id,
        rule_id=log_entry.rule_id,
        account_id=log_entry.account_id,
        rule_name=log_entry.rule_name,
        source_chat_id=log_entry.source_chat_id,
        source_chat_title=log_entry.source_chat_title,
        sender_id=log_entry.sender_id,
        sender_name=log_entry.sender_name,
        sender_username=log_entry.sender_username,
        message_id=log_entry.message_id,
        message_text=log_entry.message_text,
        message_link=log_entry.message_link,
        matched_words=_matched_words(log_entry.matched_words),
        action_status=log_entry.action_status,
        error_message=log_entry.error_message,
        created_at=log_entry.created_at,
    )


@router.get("/", response_model=LogListResponse)
async def list_logs(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    rule_id: int | None = Query(default=None, gt=0),
    query: str | None = Query(default=None, max_length=500),
    db: AsyncSession = Depends(get_db),
) -> LogListResponse:
    filters = []
    if rule_id is not None:
        filters.append(TriggerLog.rule_id == rule_id)
    account_result = await db.execute(
        select(Account.id)
        .where(
            Account.status == AccountStatus.CONNECTED,
            Account.is_active.is_(True),
        )
        .order_by(Account.id.desc())
        .limit(1)
    )
    account_id = account_result.scalar_one_or_none()
    if account_id is None:
        return LogListResponse(total=0, page=page, page_size=page_size, logs=[])
    filters.append(TriggerLog.account_id == account_id)
    if query and (search_term := query.strip()):
        pattern = f"%{search_term}%"
        filters.append(
            or_(
                TriggerLog.message_text.ilike(pattern),
                TriggerLog.source_chat_title.ilike(pattern),
                TriggerLog.sender_name.ilike(pattern),
                TriggerLog.sender_username.ilike(pattern),
                TriggerLog.rule_name.ilike(pattern),
            )
        )

    count_statement = select(func.count(TriggerLog.id)).where(*filters)
    total = (await db.execute(count_statement)).scalar_one()

    statement = (
        select(TriggerLog)
        .where(*filters)
        .order_by(TriggerLog.created_at.desc(), TriggerLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(statement)
    logs = [_serialize_log(log_entry) for log_entry in result.scalars().all()]
    return LogListResponse(
        total=total,
        page=page,
        page_size=page_size,
        logs=logs,
    )


@router.delete("/clear")
async def clear_logs(
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await db.execute(delete(TriggerLog))
    await db.commit()
    return {"status": "cleared"}
