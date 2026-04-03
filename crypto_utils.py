from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature
import base64

def verify_ed25519_signature(pub_key_base64: str, message_base64: str, signature_base64: str) -> bool:
    try:
        pub_key_bytes = base64.b64decode(pub_key_base64)
        message_bytes = base64.b64decode(message_base64)
        signature_bytes = base64.b64decode(signature_base64)
        
        public_key = Ed25519PublicKey.from_public_bytes(pub_key_bytes)
        public_key.verify(signature_bytes, message_bytes)
        return True
    except InvalidSignature:
        return False
    except Exception:
        return False
