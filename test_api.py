import urllib.request
import json

data = json.dumps({"username": "n1k1p", "password": "26042009Cc"}).encode("utf-8")
req = urllib.request.Request("http://localhost:8000/auth/login", data=data, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        token = res["access_token"]
        print("Got token")
        
        req2 = urllib.request.Request("http://localhost:8000/auth/recent_chats", headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req2) as resp2:
            print(resp2.read().decode())
except Exception as e:
    print(e)
