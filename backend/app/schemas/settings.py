from pydantic import BaseModel, ConfigDict, Field, model_validator


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class SettingsResponse(BaseModel):
    telegram_api_configured: bool
    has_admin_password: bool
    app_version: str = "1.0.0"
    data_dir: str
    database_engine: str = "SQLite"
    journal_mode: str = "WAL"


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> "ChangePasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Password confirmation does not match")
        if self.new_password == self.current_password:
            raise ValueError("New password must differ from the current password")
        return self


class ChangePasswordResponse(BaseModel):
    status: str = "updated"
    message: str
