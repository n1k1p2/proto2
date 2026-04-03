
const API_BASE = `http://${window.location.hostname}:8000`;

export interface PublishKeyPayload {
    identity_key_pub: string;
    signed_prekey_pub: string;
    signed_prekey_sig: string;
    onetime_keys: { key_id: number; pub_key: string }[];
}

export const registerUser = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("Register failed");
    return res.json();
};

export const loginUser = async (username: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error("Login failed");
    return res.json();
};

export const searchUsers = async (query: string, token: string) => {
    const res = await fetch(`${API_BASE}/auth/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Search failed");
    return res.json();
};

export const publishKeys = async (payload: PublishKeyPayload, token: string) => {
    const res = await fetch(`${API_BASE}/auth/publish_keys`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Publish failed");
    return res.json();
};

export const getDeviceKeys = async (userId: string, token: string) => {
    const res = await fetch(`${API_BASE}/auth/keys/${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Get keys failed");
    return res.json();
};

export const uploadMedia = async (file: File | Blob, token: string): Promise<{ blob_id: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/media/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
};

export const downloadMediaBlob = async (blobId: string, token: string): Promise<Blob> => {
    const res = await fetch(`${API_BASE}/media/download/${blobId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Download failed");
    return res.blob();
};

export const getMessages = async (partnerId: string, token: string) => {
    const res = await fetch(`${API_BASE}/messages/${partnerId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Fetch messages failed");
    return res.json();
};

export const getRecentChats = async (token: string) => {
    const res = await fetch(`${API_BASE}/auth/recent_chats`, {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
    });
    if (!res.ok) throw new Error("Fetch recent chats failed");
    return res.json();
};

export const adminGetUsers = async (token: string) => {
    const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Admin fetch users failed");
    return res.json();
};

export const adminResetPassword = async (userId: string, password: string, token: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}/reset_password`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password })
    });
    if (!res.ok) throw new Error("Admin reset pass failed");
    return res.json();
};

export const adminDeleteUser = async (userId: string, token: string) => {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Admin delete user failed");
    return res.json();
};
