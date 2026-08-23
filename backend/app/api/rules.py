import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.account import Account, AccountStatus
from backend.app.models.rule import Rule
from backend.app.schemas.rule import RuleBase, RuleCreate, RuleResponse, RuleUpdate

router = APIRouter(prefix="/api/rules", tags=["Rules"])


def _json_list(raw_value: str) -> list[str]:
    try:
        value = json.loads(raw_value or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    return value if isinstance(value, list) else []


def _rule_data(rule: Rule) -> dict[str, Any]:
    return {
        "name": rule.name,
        "description": rule.description,
        "is_active": rule.is_active,
        "source_chat_ids": _json_list(rule.source_chat_ids),
        "target_chat_id": rule.target_chat_id,
        "trigger_words": _json_list(rule.trigger_words),
        "exclude_words": _json_list(rule.exclude_words),
        "match_mode": rule.match_mode,
        "case_sensitive": rule.case_sensitive,
        "action_type": rule.action_type,
        "alert_template": rule.alert_template,
        "reply_template": rule.reply_template,
        "reply_delay_seconds": rule.reply_delay_seconds,
        "webhook_url": rule.webhook_url,
        "cooldown_seconds": rule.cooldown_seconds,
    }


def _serialize_rule(rule: Rule) -> RuleResponse:
    return RuleResponse.model_validate(
        {
            **_rule_data(rule),
            "id": rule.id,
            "account_id": rule.account_id,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at,
        }
    )


def _validated_rule_update(rule: Rule, request: RuleUpdate) -> RuleBase:
    data = _rule_data(rule)
    data.update(request.model_dump(exclude_unset=True))
    try:
        return RuleBase.model_validate(data)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(include_context=False),
        ) from exc


def _apply_rule_data(rule: Rule, data: RuleBase) -> None:
    rule.name = data.name
    rule.description = data.description
    rule.is_active = data.is_active
    rule.source_chat_ids = json.dumps(data.source_chat_ids, ensure_ascii=False)
    rule.target_chat_id = data.target_chat_id
    rule.trigger_words = json.dumps(data.trigger_words, ensure_ascii=False)
    rule.exclude_words = json.dumps(data.exclude_words, ensure_ascii=False)
    rule.match_mode = data.match_mode
    rule.case_sensitive = data.case_sensitive
    rule.action_type = data.action_type
    rule.alert_template = data.alert_template
    rule.reply_template = data.reply_template
    rule.reply_delay_seconds = data.reply_delay_seconds
    rule.webhook_url = data.webhook_url
    rule.cooldown_seconds = data.cooldown_seconds


async def _active_account_id(db: AsyncSession) -> int | None:
    result = await db.execute(
        select(Account.id)
        .where(
            Account.status == AccountStatus.CONNECTED,
            Account.is_active.is_(True),
        )
        .order_by(Account.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _active_rule(db: AsyncSession, rule_id: int) -> Rule:
    account_id = await _active_account_id(db)
    if account_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Connect a Telegram account first",
        )
    result = await db.execute(
        select(Rule).where(Rule.id == rule_id, Rule.account_id == account_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Rule not found",
        )
    return rule


@router.get("/", response_model=list[RuleResponse])
async def list_rules(
    db: AsyncSession = Depends(get_db),
) -> list[RuleResponse]:
    account_id = await _active_account_id(db)
    if account_id is None:
        return []
    statement = select(Rule).where(Rule.account_id == account_id)
    result = await db.execute(statement.order_by(Rule.id.desc()))
    return [_serialize_rule(rule) for rule in result.scalars().all()]


@router.post("/", response_model=RuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    request: RuleCreate,
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    account_id = await _active_account_id(db)
    if account_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A Telegram account is required",
        )
    rule = Rule(account_id=account_id, name=request.name)
    _apply_rule_data(rule, request)
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _serialize_rule(rule)


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await _active_rule(db, rule_id)
    return _serialize_rule(rule)


@router.put("/{rule_id}", response_model=RuleResponse)
async def update_rule(
    rule_id: int,
    request: RuleUpdate,
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await _active_rule(db, rule_id)

    _apply_rule_data(rule, _validated_rule_update(rule, request))
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)
    return _serialize_rule(rule)


@router.patch("/{rule_id}/toggle", response_model=RuleResponse)
async def toggle_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
) -> RuleResponse:
    rule = await _active_rule(db, rule_id)
    rule.is_active = not rule.is_active
    rule.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rule)
    return _serialize_rule(rule)


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    rule = await _active_rule(db, rule_id)
    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "id": rule_id}
