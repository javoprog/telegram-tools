from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base

if TYPE_CHECKING:
    from backend.app.models.account import Account
    from backend.app.models.log import TriggerLog


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Rule(Base):
    __tablename__ = "rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # JSON arrays are intentionally stored as text for the first SQLite schema.
    source_chat_ids: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    target_chat_id: Mapped[str | None] = mapped_column(String(64))
    trigger_words: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    exclude_words: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    match_mode: Mapped[str] = mapped_column(String(32), default="any", nullable=False)
    case_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    action_type: Mapped[str] = mapped_column(
        String(32), default="forward_alert", nullable=False
    )
    alert_template: Mapped[str | None] = mapped_column(Text)
    reply_template: Mapped[str | None] = mapped_column(Text)
    reply_delay_seconds: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    webhook_url: Mapped[str | None] = mapped_column(String(2048))
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    account: Mapped["Account"] = relationship(back_populates="rules")
    logs: Mapped[list["TriggerLog"]] = relationship(
        back_populates="rule",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
