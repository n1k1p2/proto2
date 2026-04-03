from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives import serialization
import base64

def generate_key_bundle():
    identity_priv = ed25519.Ed25519PrivateKey.generate()
    identity_pub = identity_priv.public_key()
    
    identity_pub_b64 = base64.b64encode(identity_pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )).decode('utf-8')
    
    signed_prekey_priv = x25519.X25519PrivateKey.generate()
    signed_prekey_pub = signed_prekey_priv.public_key()
    
    signed_prekey_pub_bytes = signed_prekey_pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    signed_prekey_pub_b64 = base64.b64encode(signed_prekey_pub_bytes).decode('utf-8')
    
    signature = identity_priv.sign(signed_prekey_pub_bytes)
    signature_b64 = base64.b64encode(signature).decode('utf-8')
    
    onetime_keys = []
    for _ in range(3):
        otk_priv = x25519.X25519PrivateKey.generate()
        otk_pub_bytes = otk_priv.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw
        )
        onetime_keys.append(base64.b64encode(otk_pub_bytes).decode('utf-8'))
        
    print("\n[JSON PAYLOAD FOR SERVER (/auth/publish_keys)]:")
    print("{")
    print(f'  "identity_key_pub": "{identity_pub_b64}",')
    print(f'  "signed_prekey_pub": "{signed_prekey_pub_b64}",')
    print(f'  "signed_prekey_sig": "{signature_b64}",')
    print('  "onetime_keys": [')
    for i, otk in enumerate(onetime_keys):
        comma = "," if i < len(onetime_keys) - 1 else ""
        print(f'    {{"key_id": {i}, "pub_key": "{otk}"}}{comma}')
    print('  ]')
    print("}")

if __name__ == "__main__":
    generate_key_bundle()
