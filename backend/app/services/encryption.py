import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from backend.app.core.config import settings


class SessionEncryptionError(ValueError):
    """Raised when a Telegram session cannot be encrypted or decrypted."""


def _fernet_key() -> bytes:
    secret = settings.APP_SECRET_KEY.strip()
    if not secret:
        raise SessionEncryptionError("APP_SECRET_KEY is not configured")

    # Accept a native Fernet key when supplied. Otherwise derive a stable,
    # 32-byte key from the application secret.
    candidate = secret.encode("utf-8")
    try:
        Fernet(candidate)
        return candidate
    except (TypeError, ValueError):
        digest = hashlib.sha256(candidate).digest()
        return base64.urlsafe_b64encode(digest)


def _get_fernet() -> Fernet:
    return Fernet(_fernet_key())


def encrypt_string(plain_text: str) -> str:
    if not plain_text:
        return ""
    return _get_fernet().encrypt(plain_text.encode("utf-8")).decode("ascii")


def decrypt_string(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        return _get_fernet().decrypt(cipher_text.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError, UnicodeEncodeError, ValueError) as exc:
        raise SessionEncryptionError(
            "Telegram session cannot be decrypted with APP_SECRET_KEY"
        ) from exc
