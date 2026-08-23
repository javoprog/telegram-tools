async def get_current_user() -> str:
    """Return the local application user without requiring a bearer token.

    Telegram Tools is a password-free, self-hosted application. Deployments that
    need access control can add it at the reverse-proxy layer.
    """
    return "user"
