from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from models import EncryptedMediaMetadata, User
from database import get_db
from auth import get_current_user
import shutil
import os
import uuid

router = APIRouter()
UPLOAD_DIR = "./media_blobs"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/media/upload")
async def upload_encrypted_media(
    file: UploadFile = File(...), 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    file_id = uuid.uuid4()
    file_path = os.path.join(UPLOAD_DIR, str(file_id))
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    file_size = os.path.getsize(file_path)
    
    metadata = EncryptedMediaMetadata(
        blob_id=file_id,
        uploader_id=current_user.id,
        file_path=file_path,
        file_size_bytes=file_size
    )
    db.add(metadata)
    await db.commit()
    
    return {"blob_id": str(file_id)}

@router.get("/media/download/{blob_id}")
async def download_encrypted_media(blob_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        blob_uuid = uuid.UUID(blob_id)
    except ValueError:
        raise HTTPException(status_code=400)

    result = await db.execute(select(EncryptedMediaMetadata).where(EncryptedMediaMetadata.blob_id == blob_uuid))
    metadata = result.scalars().first()
    
    if not metadata or not os.path.exists(metadata.file_path):
        raise HTTPException(status_code=404)
        
    return FileResponse(metadata.file_path)
