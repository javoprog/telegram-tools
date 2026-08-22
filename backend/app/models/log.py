from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base

if TYPE_CHECKING:
    from backend.app.models.account import Account
    from backend.app.models.rule import Rule


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TriggerLog(Base):
    __tablename__ = "trigger_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(
        ForeignKey("rules.id", ondelete="CASCADE"), index=True, nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Snapshot fields keep historical log rows useful when a rule is renamed.
    rule_name: Mapped[str | None] = mapped_column(String(255))
    source_chat_id: Mapped[str] = mapped_column(String(64), nullable=False)
    source_chat_title: Mapped[str | None] = mapped_column(String(255))
    sender_id: Mapped[int | None] = mapped_column(BigInteger)
    sender_name: Mapped[str | None] = mapped_column(String(255))
    sender_username: Mapped[str | None] = mapped_column(String(255))
    message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    message_text: Mapped[str | None] = mapped_column(Text)
    message_link: Mapped[str | None] = mapped_column(Text)
    matched_words: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    action_status: Mapped[str] = mapped_column(
        String(64), default="success", nullable=False
    )
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, index=True, nullable=False
    )

    rule: Mapped["Rule"] = relationship(back_populates="logs")
    account: Mapped["Account"] = relationship(back_populates="logs")
