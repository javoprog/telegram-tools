import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.models.account import AccountStatus


def normalize_phone_number(value: str) -> str:
    phone = re.sub(r"[\s()\-]", "", value.strip())
    if not re.fullmatch(r"\+[1-9]\d{6,14}", phone):
        raise ValueError("Phone number must be in international format, for example +79991234567")
    return phone


class RequestPhoneCode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone_number: str = Field(
        ...,
        description="Phone number with country code, for example +79991234567",
    )

    _normalize_phone = field_validator("phone_number", mode="before")(normalize_phone_number)


class VerifyPhoneCode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone_number: str
    code: str = Field(..., min_length=1, max_length=16)

    _normalize_phone = field_validator("phone_number", mode="before")(normalize_phone_number)


class Verify2FAPassword(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone_number: str
    password: str = Field(..., min_length=1)

    _normalize_phone = field_validator("phone_number", mode="before")(normalize_phone_number)


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phone_number: str
    telegram_user_id: int | None = None
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    status: AccountStatus
    is_active: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AuthStatusResponse(BaseModel):
    status: AccountStatus
    phone_number: str | None = None
    message: str | None = None
    account: AccountResponse | None = None
