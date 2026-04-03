import requests
import json
import uuid

API = "http://localhost:8000"

# Register User A
uA = str(uuid.uuid4())
r = requests.post(f"{API}/auth/register", json={"username": f"userA_{uA}", "password": "123"})
assert r.status_code == 201

# Login User A
r = requests.post(f"{API}/auth/login", json={"username": f"userA_{uA}", "password": "123"}).json()
tokenA = r["access_token"]
idA = r["user_id"]

# Register User B
uB = str(uuid.uuid4())
r = requests.post(f"{API}/auth/register", json={"username": f"userB_{uB}", "password": "123"})
assert r.status_code == 201

# Login User B
r = requests.post(f"{API}/auth/login", json={"username": f"userB_{uB}", "password": "123"}).json()
tokenB = r["access_token"]
idB = r["user_id"]

import base64
def mock_keys():
    return {
        "identity_key_pub": "A"*43+"=",
        "signed_prekey_pub": "B"*43+"=",
        "signed_prekey_sig": "C"*86+"==",
        "onetime_keys": [{"key_id": 0, "pub_key": "D"*43+"="}]
    }

# B publish keys (must fail because the signature is invalid mock, wait... let's bypass sig check or just use valid ones?)
# Ah, verify_ed25519_signature might fail. 
# But wait, looking at my device table output.. it worked! The user generated keys!
