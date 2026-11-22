from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded only from the process environment or root .env."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PROJECT_NAME: str = "Telegram Tools"
    VERSION: str = "1.0.0"
    DEBUG: bool = False
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Secrets deliberately have no usable fallback values. validate_runtime() is
    # called by FastAPI lifespan so a misconfigured deployment fails closed.
    APP_SECRET_KEY: str = ""

    # These are application-level credentials. They are never accepted from an
    # HTTP request or stored per Telegram account.
    TG_API_ID: int | None = None
    TG_API_HASH: str = ""

    DATA_DIR: str = "/app/data"
    DATABASE_URL: str = "sqlite+aiosqlite:////app/data/app.db"

    # How long the chat (dialog) list is cached per account. Loading every
    # dialog triggers Telegram GetDialogsRequest flood waits on large accounts.
    # 0 disables the cache.
    DIALOGS_CACHE_TTL_SECONDS: int = 600

    @property
    def data_path(self) -> Path:
        return Path(self.DATA_DIR).expanduser().resolve()

    def telegram_credentials(self) -> tuple[int, str]:
        if not self.TG_API_ID or not self.TG_API_HASH.strip():
            raise RuntimeError(
                "TG_API_ID and TG_API_HASH must be configured through environment variables"
            )
        return int(self.TG_API_ID), self.TG_API_HASH.strip()

    def validate_runtime(self) -> None:
        missing: list[str] = []
        if not self.TG_API_ID:
            missing.append("TG_API_ID")
        if not self.TG_API_HASH.strip():
            missing.append("TG_API_HASH")
        if not self.APP_SECRET_KEY.strip():
            missing.append("APP_SECRET_KEY")
        if missing:
            raise RuntimeError(
                "Missing required environment variables: " + ", ".join(missing)
            )
        if len(self.APP_SECRET_KEY.encode("utf-8")) < 32:
            raise RuntimeError("APP_SECRET_KEY must contain at least 32 bytes")


settings = Settings()
