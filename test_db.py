import asyncio
from database import SessionLocal
from models import EncryptedMessage
from sqlalchemy import select

async def main():
    db = SessionLocal()
    result = await db.execute(select(EncryptedMessage).limit(5))
    msgs = result.scalars().all()
    for m in msgs:
        print(f"ID={m.id}, delivered={m.delivered}, sender={m.sender_user_id}")
    await db.close()

asyncio.run(main())
