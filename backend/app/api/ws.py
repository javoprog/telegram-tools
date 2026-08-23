import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.app.services.rule_engine import rule_engine

logger = logging.getLogger("websocket")
router = APIRouter(prefix="/api/ws", tags=["WebSocket"])


@router.websocket("/events")
async def websocket_events_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
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
