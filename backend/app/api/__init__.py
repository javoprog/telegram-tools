from backend.app.api.auth import router as auth_router
from backend.app.api.chats import router as chats_router
from backend.app.api.logs import router as logs_router
from backend.app.api.rules import router as rules_router
from backend.app.api.ws import router as ws_router

__all__ = [
    "auth_router",
    "chats_router",
    "logs_router",
    "rules_router",
    "ws_router",
]
