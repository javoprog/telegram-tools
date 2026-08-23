import re
from datetime import datetime
from string import Formatter
from typing import Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MatchMode = Literal["any", "all", "regex", "exact"]
ActionType = Literal["forward_alert", "auto_reply", "webhook", "both"]
ALERT_TEMPLATE_FIELDS = {
    "rule_name",
    "chat_title",
    "sender_name",
    "sender_username",
    "message_text",
    "matched_words",
    "message_link",
}


def _clean_unique_strings(values: list[str], *, allow_wildcard: bool) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = value.strip()
        if not item or item in seen:
            continue
        if item == "*" and not allow_wildcard:
            raise ValueError("Wildcard is allowed only in source_chat_ids")
        seen.add(item)
        cleaned.append(item)
    if allow_wildcard and "*" in seen:
        return ["*"]
    return cleaned


class RuleBase(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_default=True,
    )

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    is_active: bool = True
    source_chat_ids: list[str] = Field(..., min_length=1)
    target_chat_id: str | None = Field(default=None, max_length=64)
    trigger_words: list[str] = Field(..., min_length=1)
    exclude_words: list[str] = Field(default_factory=list)
    match_mode: MatchMode = "any"
    case_sensitive: bool = False
    action_type: ActionType = "forward_alert"
    alert_template: str | None = None
    reply_template: str | None = None
    reply_delay_seconds: int = Field(default=2, ge=0, le=86_400)
    webhook_url: str | None = Field(default=None, max_length=2048)
    cooldown_seconds: int = Field(default=0, ge=0, le=2_592_000)

    @field_validator("source_chat_ids")
    @classmethod
    def validate_source_chat_ids(cls, values: list[str]) -> list[str]:
        cleaned = _clean_unique_strings(values, allow_wildcard=True)
        if not cleaned:
            raise ValueError("At least one source chat ID or wildcard '*' is required")
        return cleaned

    @field_validator("trigger_words")
    @classmethod
    def validate_trigger_words(cls, values: list[str]) -> list[str]:
        cleaned = _clean_unique_strings(values, allow_wildcard=False)
        if not cleaned:
            raise ValueError("At least one trigger word is required")
        return cleaned

    @field_validator("exclude_words")
    @classmethod
    def validate_exclude_words(cls, values: list[str]) -> list[str]:
        return _clean_unique_strings(values, allow_wildcard=False)

    @field_validator("alert_template")
    @classmethod
    def validate_alert_template(cls, value: str | None) -> str | None:
        if not value:
            return value
        try:
            fields = {
                field_name
                for _literal, field_name, _format_spec, _conversion in Formatter().parse(
                    value
                )
                if field_name
            }
        except ValueError as exc:
            raise ValueError(f"Invalid alert_template: {exc}") from exc
        unsupported = fields - ALERT_TEMPLATE_FIELDS
        if unsupported:
            raise ValueError(
                "Unsupported alert_template fields: " + ", ".join(sorted(unsupported))
            )
        return value

    @model_validator(mode="after")
    def validate_rule_configuration(self) -> "RuleBase":
        if self.match_mode == "regex":
            for pattern in self.trigger_words:
                try:
                    re.compile(pattern)
                except re.error as exc:
                    raise ValueError(
                        f"Invalid regular expression {pattern!r}: {exc}"
                    ) from exc

        if self.webhook_url:
            parsed = urlparse(self.webhook_url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("webhook_url must be a valid HTTP or HTTPS URL")

        if self.action_type in {"forward_alert", "both"} and not self.target_chat_id:
            raise ValueError("target_chat_id is required for alert actions")
        if self.action_type in {"auto_reply", "both"} and not self.reply_template:
            raise ValueError("reply_template is required for auto-reply actions")
        if self.action_type == "webhook" and not self.webhook_url:
            raise ValueError("webhook_url is required for webhook actions")
        return self


class RuleCreate(RuleBase):
    pass


class RuleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    is_active: bool | None = None
    source_chat_ids: list[str] | None = None
    target_chat_id: str | None = Field(default=None, max_length=64)
    trigger_words: list[str] | None = None
    exclude_words: list[str] | None = None
    match_mode: MatchMode | None = None
    case_sensitive: bool | None = None
    action_type: ActionType | None = None
    alert_template: str | None = None
    reply_template: str | None = None
    reply_delay_seconds: int | None = Field(default=None, ge=0, le=86_400)
    webhook_url: str | None = Field(default=None, max_length=2048)
    cooldown_seconds: int | None = Field(default=None, ge=0, le=2_592_000)


class RuleResponse(RuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None
