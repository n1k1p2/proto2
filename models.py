import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, BigInteger
from sqlalchemy.orm import declarative_base, relationship
from sqlalchemy.dialects.postgresql import UUID

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False) 
    is_admin = Column(Integer, default=0)
    
    devices = relationship("Device", back_populates="user", cascade="all, delete-orphan")

class Device(Base):
    __tablename__ = "devices"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    identity_key_pub = Column(String, nullable=False)
    
    signed_prekey_pub = Column(String, nullable=False)
    signed_prekey_sig = Column(String, nullable=False)
    
    user = relationship("User", back_populates="devices")
    onetime_keys = relationship("OneTimeKey", back_populates="device", cascade="all, delete-orphan")

class OneTimeKey(Base):
    __tablename__ = "onetime_keys"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id"), nullable=False)
    
    key_id = Column(Integer, nullable=False)
    pub_key = Column(String, nullable=False)
    
    device = relationship("Device", back_populates="onetime_keys")

class EncryptedMessage(Base):
    __tablename__ = "encrypted_messages"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sender_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    recipient_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    payload = Column(String, nullable=False) 
    timestamp = Column(DateTime, default=datetime.utcnow)
    delivered = Column(Integer, default=0)

class EncryptedMediaMetadata(Base):
    __tablename__ = "encrypted_media_metadata"
    blob_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    uploader_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    file_path = Column(String, nullable=False) 
    file_size_bytes = Column(BigInteger, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
