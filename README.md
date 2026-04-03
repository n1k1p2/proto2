# Proto2 E2EE Messenger

A secure, zero-trust, end-to-end encrypted messaging application built with React and FastAPI. 

## Architecture

The project relies on a strictly zero-trust "blind courier" model. The backend routes messages and persists encrypted payloads without any ability to decrypt the contents. All private keys are generated and stored exclusively on client devices.

### Technology Stack
- **Backend:** Python, FastAPI, Uvicorn, PostgreSQL (asyncpg)
- **Frontend:** React, TypeScript, Vite
- **Cryptography:** Curve25519 (via tweetnacl) for public-key operations, AES-256-GCM for media blob encryption
- **Infrastructure:** Docker and Docker Compose

## Security Features

- **End-to-End Encryption (E2EE):** Direct peer-to-peer encryption for text and media payloads.
- **Client-Side Media Encryption:** Images are encrypted symmetrically on the client before upload. The symmetric key is then enclosed securely within the standard E2EE payload sent to the recipient.
- **Zero-Trust Server:** The database only stores ciphertext and opaque binary media wrappers.

## Setup and Deployment

The application is fully containerized and intended to be run via Docker Compose.

1. Clone the repository.
2. Build and start the infrastructure:
   ```bash
   docker compose up --build -d
   ```
3. The API will be available on port 8000. PostgreSQL runs on port 5432.
4. For frontend development, navigate to the `client-app` directory and start the Vite dev server:
   ```bash
   cd client-app
   npm install
   npm run dev
   ```

## Internal Services

- `api`: The core FastAPI application handling HTTP endpoints and WebSockets for real-time delivery.
- `db`: PostgreSQL instance configured via docker-compose.
