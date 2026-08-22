from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TriggerLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_id: int
    account_id: int
    rule_name: str | None = None
    source_chat_id: str
    source_chat_title: str | None = None
    sender_id: int | None = None
    sender_name: str | None = None
    sender_username: str | None = None
    message_id: int
    message_text: str | None = None
    message_link: str | None = None
    matched_words: list[str] = Field(default_factory=list)
    action_status: str
    error_message: str | None = None
    created_at: datetime


class LogListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    logs: list[TriggerLogResponse]
