import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from backend.app.api import (
    auth_router,
    chats_router,
    logs_router,
    rules_router,
    settings_router,
    ws_router,
)
from backend.app.core.config import settings
from backend.app.core.database import AsyncSessionLocal, close_db, init_db
from backend.app.models.account import Account, AccountStatus
from backend.app.services.telegram_manager import telegram_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app")


async def _restore_active_accounts() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Account)
            .where(
                Account.status == AccountStatus.CONNECTED,
                Account.is_active.is_(True),
            )
            .order_by(Account.id)
        )
        accounts = list(result.scalars().all())
        missing_sessions = [account for account in accounts if not account.session_string]
        for account in missing_sessions:
            logger.error(
                "Active Telegram account %s (ID %s) has no stored session",
                account.phone_number,
                account.id,
            )
            account.status = AccountStatus.ERROR
            account.is_active = False
        if missing_sessions:
            await db.commit()

        sessions = [
            (account.id, account.phone_number, account.session_string)
            for account in accounts
            if account.session_string
        ]

        if not sessions:
            return

        logger.info("Restoring %s active Telegram account(s)", len(sessions))
        restored = await asyncio.gather(
            *(
                telegram_manager.start_client_session(account_id, encrypted_session)
                for account_id, _phone, encrypted_session in sessions
            ),
            return_exceptions=True,
        )

        changed = False
        for (account_id, phone_number, _session), outcome in zip(sessions, restored):
            if isinstance(outcome, Exception):
                logger.error(
                    "Could not restore Telegram account %s (ID %s): %s",
                    phone_number,
                    account_id,
                    outcome,
                )
                account = await db.get(Account, account_id)
                if account is not None:
                    account.status = AccountStatus.ERROR
                    account.is_active = False
                    changed = True
            else:
                logger.info(
                    "Telegram account %s (ID %s) restored",
                    phone_number,
                    account_id,
                )
        if changed:
            await db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings.validate_runtime()
    logger.info("Initializing database")
    await init_db()
    try:
        await _restore_active_accounts()
        yield
    finally:
        logger.info("Shutting down Telegram clients")
        await telegram_manager.shutdown()
        await close_db()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(chats_router)
app.include_router(rules_router)
app.include_router(logs_router)
app.include_router(settings_router)
app.include_router(ws_router)

frontend_paths = [
    Path("/app/frontend/dist"),
    Path(__file__).resolve().parents[2] / "frontend" / "dist",
]
frontend_dist = next((path for path in frontend_paths if path.exists()), None)

if frontend_dist:
    logger.info("Serving frontend files from %s", frontend_dist)
    app.mount(
        "/assets",
        StaticFiles(directory=str(frontend_dist / "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")

else:

    @app.get("/")
    async def root() -> dict[str, str]:
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "status": "Backend running. Frontend build not found.",
            "docs": "/docs",
        }
