from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, func, case
import bcrypt
import jwt
from datetime import datetime, timedelta
import uuid

from database import get_db
from models import Device, User, OneTimeKey, EncryptedMessage
from crypto_utils import verify_ed25519_signature
from config import settings

router = APIRouter()
security = HTTPBearer()

class RegisterRequest(BaseModel):
    username: str
    password: str

class LoginRequest(BaseModel):
    username: str
    password: str

class ResetPasswordReq(BaseModel):
    password: str

class OnetimeKeyBundle(BaseModel):
    key_id: int
    pub_key: str

class PublishBundleRequest(BaseModel):
    identity_key_pub: str
    signed_prekey_pub: str
    signed_prekey_sig: str
    onetime_keys: List[OnetimeKeyBundle]

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=30)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm="HS256")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: AsyncSession = Depends(get_db)):
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=["HS256"])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalars().first()
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return user
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

@router.post("/auth/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username))
    if result.scalars().first():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    hashed_password = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user = User(username=req.username, password_hash=hashed_password)
    db.add(user)
    await db.commit()
    return {"status": "ok"}

@router.post("/auth/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalars().first()
    if not user or not bcrypt.checkpw(req.password.encode('utf-8'), user.password_hash.encode('utf-8')):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": token, "user_id": str(user.id), "username": user.username, "is_admin": bool(user.is_admin)}

@router.get("/auth/search")
async def search_users(q: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not q:
        return []
    result = await db.execute(select(User).where(User.username.ilike(f"%{q}%")).limit(10))
    users = result.scalars().all()
    return [{"id": str(u.id), "username": u.username} for u in users]

@router.post("/auth/publish_keys", status_code=status.HTTP_201_CREATED)
async def publish_keys(bundle: PublishBundleRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    is_valid = verify_ed25519_signature(
        pub_key_base64=bundle.identity_key_pub,
        message_base64=bundle.signed_prekey_pub,
        signature_base64=bundle.signed_prekey_sig
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST)
    
    user_devices = await db.execute(select(Device.id).where(Device.user_id == current_user.id))
    device_ids = [d for d in user_devices.scalars().all()]
    if device_ids:
        await db.execute(delete(OneTimeKey).where(OneTimeKey.device_id.in_(device_ids)))
        await db.execute(delete(Device).where(Device.id.in_(device_ids)))

    device = Device(user_id=current_user.id, identity_key_pub=bundle.identity_key_pub, signed_prekey_pub=bundle.signed_prekey_pub, signed_prekey_sig=bundle.signed_prekey_sig)
    db.add(device)
    await db.flush()
    for otk in bundle.onetime_keys:
        db.add(OneTimeKey(device_id=device.id, key_id=otk.key_id, pub_key=otk.pub_key))
    await db.commit()
    return {"status": "success", "device_id": str(device.id)}

@router.get("/auth/keys/{user_id}")
async def get_keys(user_id: str, _: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        uid = uuid.UUID(user_id)
    except:
        raise HTTPException(status_code=400)
    result = await db.execute(select(Device).where(Device.user_id == uid))
    device = result.scalars().first()
    if not device:
        raise HTTPException(status_code=404)
    otk_res = await db.execute(select(OneTimeKey).where(OneTimeKey.device_id == device.id).limit(1))
    otk = otk_res.scalars().first()
    return {
        "device_id": str(device.id),
        "identity_key_pub": device.identity_key_pub,
        "signed_prekey_pub": device.signed_prekey_pub,
        "signed_prekey_sig": device.signed_prekey_sig,
        "onetime_key": {"key_id": otk.key_id, "pub_key": otk.pub_key} if otk else None
    }

@router.get("/messages/{partner_id}")
async def get_messages(partner_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        pid = uuid.UUID(partner_id)
    except:
        raise HTTPException(status_code=400)
    
    result = await db.execute(
        select(EncryptedMessage)
        .where(
            ((EncryptedMessage.sender_user_id == current_user.id) & (EncryptedMessage.recipient_user_id == pid)) |
            ((EncryptedMessage.sender_user_id == pid) & (EncryptedMessage.recipient_user_id == current_user.id))
        )
        .order_by(EncryptedMessage.timestamp.asc())
    )
    msgs = result.scalars().all()
    return [{"id": str(m.id), "sender_id": str(m.sender_user_id), "recipient_id": str(m.recipient_user_id), "payload": m.payload, "timestamp": m.timestamp.isoformat()} for m in msgs]

@router.get("/auth/recent_chats")
async def get_recent_chats(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner_id_col = case(
        (EncryptedMessage.sender_user_id == current_user.id, EncryptedMessage.recipient_user_id),
        else_=EncryptedMessage.sender_user_id
    )
    
    subq = (
        select(
            partner_id_col.label("partner_id"),
            EncryptedMessage.payload.label("last_payload"),
            EncryptedMessage.sender_user_id.label("last_sender_id"),
            EncryptedMessage.delivered.label("last_delivered"),
            EncryptedMessage.timestamp.label("last_message_at")
        )
        .distinct(partner_id_col)
        .where(
            (EncryptedMessage.sender_user_id == current_user.id) |
            (EncryptedMessage.recipient_user_id == current_user.id)
        )
        .order_by(partner_id_col, EncryptedMessage.timestamp.desc())
        .subquery()
    )
    
    stmt = select(subq).order_by(subq.c.last_message_at.desc())
    
    result = await db.execute(stmt)
    rows = result.all()
    
    if not rows:
        return []
        
    partner_ids = [row.partner_id for row in rows]
    users_result = await db.execute(select(User).where(User.id.in_(partner_ids)))
    users_dict = {u.id: u for u in users_result.scalars().all()}
    
    devices_result = await db.execute(select(Device).where(Device.user_id.in_(partner_ids)))
    devices_dict = {}
    for d in devices_result.scalars().all():
        if d.user_id not in devices_dict:
            devices_dict[d.user_id] = d
    
    recent_chats = []
    for row in rows:
        u = users_dict.get(row.partner_id)
        d = devices_dict.get(row.partner_id)
        if u:
            recent_chats.append({
                "id": str(u.id),
                "username": u.username,
                "is_admin": u.is_admin,
                "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
                "last_payload": row.last_payload,
                "last_sender_id": str(row.last_sender_id),
                "last_delivered": row.last_delivered,
                "partner_pub": d.signed_prekey_pub if d else None
            })
            
    return recent_chats

@router.get("/admin/users")
async def admin_get_users(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not admin")
    res = await db.execute(select(User))
    users = res.scalars().all()
    return [{"id": str(u.id), "username": u.username, "is_admin": bool(u.is_admin)} for u in users]

@router.post("/admin/users/{user_id}/reset_password")
async def admin_reset_password(user_id: str, req: ResetPasswordReq, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not admin")
    res = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    usr = res.scalars().first()
    if not usr:
        raise HTTPException(status_code=404)
    hashed = bcrypt.hashpw(req.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    usr.password_hash = hashed
    await db.commit()
    return {"status": "ok"}

@router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not admin")
    res = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    usr = res.scalars().first()
    if not usr:
        raise HTTPException(status_code=404)
    await db.delete(usr)
    await db.commit()
    return {"status": "ok"}
