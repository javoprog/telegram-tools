import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.core.security import decode_access_token
from backend.app.services.rule_engine import rule_engine

logger = logging.getLogger("websocket")
router = APIRouter(prefix="/api/ws", tags=["WebSocket"])


@router.websocket("/events")
async def websocket_events_endpoint(websocket: WebSocket) -> None:
    offered_protocols = [
        item.strip()
        for item in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if item.strip()
    ]
    token = None
    selected_protocol = None
    if len(offered_protocols) >= 2 and offered_protocols[0].lower() == "bearer":
        token = offered_protocols[1]
        selected_protocol = "bearer"
    if token is None:
        authorization = websocket.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            token = authorization[7:].strip()
    # Query parameter is retained for non-browser clients that cannot set either
    # headers or WebSocket subprotocols.
    if token is None:
        token = websocket.query_params.get("token")
    if not token or decode_access_token(token) != "admin":
        await websocket.close(code=4401, reason="Authentication required")
        return

    await websocket.accept(subprotocol=selected_protocol)
    rule_engine.add_ws_subscriber(websocket)
    try:
        while True:
            if await websocket.receive_text() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.warning("WebSocket client error: %s", exc)
    finally:
        rule_engine.remove_ws_subscriber(websocket)
