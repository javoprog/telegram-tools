from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import settings
from backend.app.core.database import get_db
from backend.app.core.security import (
    get_current_user,
    get_password_hash,
    verify_password,
)
from backend.app.models.admin_credential import AdminCredential
from backend.app.schemas.settings import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    SettingsResponse,
)

router = APIRouter(prefix="/api/settings", tags=["Settings"])


@router.get("/", response_model=SettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
) -> SettingsResponse:
    """Expose configuration state without returning API credentials or secrets."""
    credential = await db.get(AdminCredential, 1)
    return SettingsResponse(
        telegram_api_configured=bool(settings.TG_API_ID and settings.TG_API_HASH),
        has_admin_password=credential is not None or bool(settings.ADMIN_PASSWORD),
        app_version=settings.VERSION,
        data_dir=settings.DATA_DIR,
    )


@router.put("/password", response_model=ChangePasswordResponse)
async def change_admin_password(
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(get_current_user),
) -> ChangePasswordResponse:
    """Replace the runtime admin password with a durable bcrypt hash."""
    credential = await db.get(AdminCredential, 1)
    stored_password = (
        credential.password_hash if credential is not None else settings.ADMIN_PASSWORD
    )
    if not verify_password(payload.current_password, stored_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current admin password is incorrect",
        )

    password_hash = get_password_hash(payload.new_password)
    if credential is None:
        credential = AdminCredential(id=1, password_hash=password_hash)
        db.add(credential)
    else:
        credential.password_hash = password_hash
    await db.commit()
    return ChangePasswordResponse(
        message="Master password updated. Sign in again with the new password."
    )
