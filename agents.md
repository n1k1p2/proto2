# Enterprise E2EE Zero-Trust Messenger Architecture

## Abstract
This document outlines the security requirements, cryptographic paradigms, and system architecture for the zero-trust E2EE Corporate Messenger.

## Security Requirements (Zero-Trust)
1. **Blind Courier Server**: The backend architecture MUST act strictly as a blind courier. It routes and stores encrypted blobs and metadata but NEVER has access to the plaintext content of messages or the private keys of the users.
2. **End-to-End Encryption (E2EE)**: Every message must be encrypted on the sender's client device and decrypted exclusively on the recipient's authenticated client device.
3. **Cryptographic Primitives**: 
   - Operations utilize `tweetnacl` to leverage Curve25519 for public-key cryptography.
   - Symmetric payloads (like images) use AES-256-GCM securely wrapped with E2EE.
4. **Media Security**: Media attachments (images) are symmetrically encrypted locally on the sender's machine before being uploaded to the backend. The symmetric key and IV are packed and encrypted inside the E2EE WebSocket payload so only the dedicated recipient can retrieve and decipher the media blob.
5. **Session & Transport**: The system uses JWT for standard authentication, and standard HTTPS/WSS protocols ensure transport layer security (TLS) atop the E2EE properties.

## Architecture
**Backend (Python/FastAPI)**
- **Framework**: High-performance asynchronous FastAPI server using Uvicorn.
- **Database**: PostgreSQL (via Async SQLAlchemy & `asyncpg`).
- **Real-time Engine**: WebSockets manager `consumers.py` routes live events (new messages, indicators).
- **Blob Storage**: Secure opaque binary storage for media attachments.

**Frontend (React/TypeScript)**
- **Framework**: Vite-based React application natively typed in TypeScript.
- **State Management**: React Hooks combined with WebSocket listeners for instant optimistic updates.
- **Local Storage**: Curve25519 identity keypairs are generated client-side and safely stored purely within the browser profile (LocalStorage).

**Deployment**
- Fully dockerized environment via `docker-compose.yml` encapsulating both the PostgreSQL DB and the FastAPI runtime for atomic reproducible deployments.
