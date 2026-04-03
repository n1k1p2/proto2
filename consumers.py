from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict
from database import get_db
from models import EncryptedMessage
import json
import uuid

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_text(message)
            return True
        return False

manager = ConnectionManager()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, db: AsyncSession = Depends(get_db)):
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg_dict = json.loads(data)
                recipient_id = msg_dict.get("recipient_user_id")
                encrypted_payload = msg_dict.get("payload")
                
               
                db_msg = EncryptedMessage(
                    sender_user_id=uuid.UUID(user_id), 
                    recipient_user_id=uuid.UUID(recipient_id), 
                    payload=encrypted_payload
                )
                db.add(db_msg)
                await db.commit()
                
                broadcast_data = {
                    "type": "new_message",
                    "sender_id": user_id,
                    "payload": encrypted_payload
                }
                broadcast_str = json.dumps(broadcast_data)
                
                await manager.send_personal_message(broadcast_str, recipient_id)
                await manager.send_personal_message(broadcast_str, user_id) 
            except json.JSONDecodeError:
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(user_id)
