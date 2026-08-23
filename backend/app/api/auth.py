from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import get_db
from backend.app.models.account import Account, AccountStatus
from backend.app.schemas.account import (
    AccountResponse,
    AuthStatusResponse,
    RequestPhoneCode,
    Verify2FAPassword,
    VerifyPhoneCode,
)
from backend.app.services.encryption import encrypt_string
from backend.app.services.telegram_manager import (
    TelegramAuthError,
    TelegramFloodWaitError,
    TelegramManagerError,
    telegram_manager,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _telegram_http_error(exc: TelegramManagerError) -> HTTPException:
    if isinstance(exc, TelegramFloodWaitError):
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(exc),
            headers={"Retry-After": str(exc.seconds)},
        )
    if isinstance(exc, TelegramAuthError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


async def _account_by_phone(db: AsyncSession, phone_number: str) -> Account | None:
    result = await db.execute(select(Account).where(Account.phone_number == phone_number))
    return result.scalar_one_or_none()


async def _current_account(db: AsyncSession) -> Account | None:
    result = await db.execute(
        select(Account)
        .where(
            Account.status == AccountStatus.CONNECTED,
            Account.is_active.is_(True),
        )
        .order_by(Account.id.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _save_connected_account(
    db: AsyncSession,
    phone_number: str,
    auth_result: dict[str, Any],
) -> Account:
    account = await _account_by_phone(db, phone_number)
    user = auth_result["user"]
    encrypted_session = encrypt_string(auth_result["session_string"])

    if account is None:
        account = Account(phone_number=phone_number)
        db.add(account)
        await db.flush()

    previous_result = await db.execute(
        select(Account).where(Account.id != account.id, Account.is_active.is_(True))
    )
    previous_accounts = list(previous_result.scalars().all())
    for previous in previous_accounts:
        previous.status = AccountStatus.DISCONNECTED
        previous.is_active = False
        previous.phone_code_hash = None

    account.telegram_user_id = user["id"]
    account.first_name = user.get("first_name")
    account.last_name = user.get("last_name")
    account.username = user.get("username")
    account.session_string = encrypted_session
    account.phone_code_hash = None
    account.status = AccountStatus.CONNECTED
    account.is_active = True
    await db.commit()
    await db.refresh(account)

    for previous in previous_accounts:
        await telegram_manager.stop_client_session(previous.id)

    try:
        await telegram_manager.stop_client_session(account.id)
        await telegram_manager.start_client_session(account.id, encrypted_session)
    except TelegramManagerError as exc:
        account.status = AccountStatus.ERROR
        account.is_active = False
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telegram authorization succeeded, but the listener could not be started",
        ) from exc

    return account


@router.get("/me")
async def get_me() -> dict[str, str]:
    return {"status": "ready", "user": "user"}


@router.get("/telegram/account", response_model=AccountResponse | None)
async def get_telegram_account(db: AsyncSession = Depends(get_db)) -> Account | None:
    return await _current_account(db)


@router.get("/telegram/accounts", response_model=list[AccountResponse])
async def list_telegram_accounts(
    db: AsyncSession = Depends(get_db),
) -> list[Account]:
    """Compatibility alias that exposes at most the single active account."""
    account = await _current_account(db)
    return [account] if account is not None else []


@router.post("/telegram/request-code", response_model=AuthStatusResponse)
async def request_code(
    request: RequestPhoneCode,
    db: AsyncSession = Depends(get_db),
) -> AuthStatusResponse:
    if await _current_account(db) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Disconnect the current Telegram account before connecting another one",
        )

    pending_result = await db.execute(
        select(Account).where(
            Account.phone_number != request.phone_number,
            Account.status.in_(
                [AccountStatus.AWAITING_CODE, AccountStatus.AWAITING_PASSWORD]
            ),
        )
    )
    for pending in pending_result.scalars().all():
        await telegram_manager.cancel_pending_auth(pending.phone_number)
        pending.status = AccountStatus.DISCONNECTED
        pending.phone_code_hash = None

    account = await _account_by_phone(db, request.phone_number)
    try:
        auth_result = await telegram_manager.request_phone_code(request.phone_number)
    except TelegramManagerError as exc:
        raise _telegram_http_error(exc) from exc

    if account is None:
        account = Account(phone_number=request.phone_number)
        db.add(account)
    account.status = AccountStatus.AWAITING_CODE
    account.phone_code_hash = auth_result["phone_code_hash"]
    account.is_active = False
    await db.commit()
    await db.refresh(account)

    return AuthStatusResponse(
        status=AccountStatus.AWAITING_CODE,
        phone_number=request.phone_number,
        message="Confirmation code sent to Telegram or SMS",
        account=AccountResponse.model_validate(account),
    )


@router.post("/telegram/verify-code", response_model=AuthStatusResponse)
async def verify_code(
    request: VerifyPhoneCode,
    db: AsyncSession = Depends(get_db),
) -> AuthStatusResponse:
    try:
        auth_result = await telegram_manager.verify_code(
            request.phone_number,
            request.code.strip().replace(" ", ""),
        )
    except TelegramManagerError as exc:
        raise _telegram_http_error(exc) from exc

    if auth_result["status"] == AccountStatus.AWAITING_PASSWORD.value:
        account = await _account_by_phone(db, request.phone_number)
        if account is None:
            account = Account(phone_number=request.phone_number)
            db.add(account)
        account.status = AccountStatus.AWAITING_PASSWORD
        account.is_active = False
        await db.commit()
        await db.refresh(account)
        return AuthStatusResponse(
            status=AccountStatus.AWAITING_PASSWORD,
            phone_number=request.phone_number,
            message="Telegram 2FA password required",
            account=AccountResponse.model_validate(account),
        )

    account = await _save_connected_account(db, request.phone_number, auth_result)
    return AuthStatusResponse(
        status=AccountStatus.CONNECTED,
        phone_number=request.phone_number,
        message="Telegram account connected",
        account=AccountResponse.model_validate(account),
    )


@router.post("/telegram/verify-2fa", response_model=AuthStatusResponse)
async def verify_2fa(
    request: Verify2FAPassword,
    db: AsyncSession = Depends(get_db),
) -> AuthStatusResponse:
    try:
        auth_result = await telegram_manager.verify_2fa_password(
            request.phone_number,
            request.password,
        )
    except TelegramManagerError as exc:
        raise _telegram_http_error(exc) from exc

    account = await _save_connected_account(db, request.phone_number, auth_result)
    return AuthStatusResponse(
        status=AccountStatus.CONNECTED,
        phone_number=request.phone_number,
        message="Telegram account connected with 2FA",
        account=AccountResponse.model_validate(account),
    )


@router.post("/telegram/disconnect/{account_id}")
async def disconnect_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | int]:
    account = await db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    await telegram_manager.cancel_pending_auth(account.phone_number)
    await telegram_manager.stop_client_session(account_id)
    account.status = AccountStatus.DISCONNECTED
    account.is_active = False
    account.phone_code_hash = None
    await db.commit()
    return {"status": AccountStatus.DISCONNECTED.value, "account_id": account_id}
