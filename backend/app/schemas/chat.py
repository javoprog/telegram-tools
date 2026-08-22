from typing import Literal

from pydantic import BaseModel

ChatType = Literal["channel", "supergroup", "group", "user", "bot"]
ChatTypeFilter = Literal["channel", "supergroup", "group", "user"]


class ChatDialog(BaseModel):
    id: str
    title: str
    type: ChatType
    username: str | None = None
    unread_count: int = 0
    is_creator: bool = False
    is_admin: bool = False


class ChatListResponse(BaseModel):
    total: int
    chats: list[ChatDialog]
