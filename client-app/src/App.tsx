import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, MoreVertical, Settings, User, LogOut } from 'lucide-react';
import { generateDeviceKeys, encryptSymmetric, decryptSymmetric, exportKeyBase64, importKeyBase64, encryptE2EBase64, decryptE2EBase64 } from './crypto';
import { loginUser, registerUser, searchUsers, publishKeys, getDeviceKeys, uploadMedia, downloadMediaBlob, getMessages, adminGetUsers, adminDeleteUser, adminResetPassword, getRecentChats } from './services/api';
import { MessengerSocket } from './services/socket';
import util from 'tweetnacl-util';
import './index.css';

interface Message {
  id: string;
  senderId: string;
  text?: string;
  imageUrl?: string;
  isMine: boolean;
  timestamp: number;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [myUserId, setMyUserId] = useState<string | null>(() => localStorage.getItem('myUserId'));
  const [isAdmin, setIsAdmin] = useState<boolean>(() => localStorage.getItem('isAdmin') === 'true');
  
  const [keys, setKeys] = useState<any>(() => {
    const k = localStorage.getItem('keys');
    if (!k) return null;
    try {
        const p = JSON.parse(k);
        const toU8 = (obj: any) => new Uint8Array(Object.keys(obj).sort((a,b)=>Number(a)-Number(b)).map(k => obj[k as any]));
        return {
          identityKeyPair: { publicKey: toU8(p.identityKeyPair.publicKey), secretKey: toU8(p.identityKeyPair.secretKey) },
          preKeyPair: { publicKey: toU8(p.preKeyPair.publicKey), secretKey: toU8(p.preKeyPair.secretKey) },
          signedPreKeySignature: toU8(p.signedPreKeySignature),
          onetimeKeys: p.onetimeKeys.map((otk: any) => ({ publicKey: toU8(otk.publicKey), secretKey: toU8(otk.secretKey) }))
        };
    } catch(e) { return null; }
  });

  const [ws, setWs] = useState<MessengerSocket | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const selectedUserRef = useRef<any | null>(null);
  useEffect(() => { selectedUserRef.current = selectedUser; }, [selectedUser]);
  const [recipientKeys, setRecipientKeys] = useState<any | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  const loadAdminUsers = async () => {
    try {
      const users = await adminGetUsers(token!);
      setAdminUsers(users);
    } catch (e) {}
  };

  const handleResetPassword = async (userId: string) => {
    const newPass = prompt("Enter new password for this user:");
    if (!newPass) return;
    try {
      await adminResetPassword(userId, newPass, token!);
      alert("Password reset successfully. WARNING: Mathematical link to old E2EE history is unrecoverably severed.");
    } catch (e) { alert("Failed"); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure?")) return;
    try {
      await adminDeleteUser(userId, token!);
      loadAdminUsers();
    } catch (e) { alert("Failed"); }
  };
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (myUserId && keys) {
      const socket = new MessengerSocket(myUserId, (msgData) => {
        handleIncomingMessage(msgData, keys);
      });
      socket.connect();
      setWs(socket);
    }
  }, [myUserId, keys]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleLogout = () => {
    setToken(null);
    setKeys(null);
    setMessages([]);
    setSelectedUser(null);
    setRecipientKeys(null);
    setMyUserId(null);
    setIsAdmin(false);
    localStorage.removeItem('token');
    localStorage.removeItem('keys');
    localStorage.removeItem('myUserId');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('isAdmin');
    if (ws) {
      ws.disconnect();
      setWs(null);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (authMode === 'register') {
        await registerUser(authForm.username, authForm.password);
        setAuthMode('login');
      } else {
        const res = await loginUser(authForm.username, authForm.password);
        setToken(res.access_token);
        setMyUserId(res.user_id);
        setIsAdmin(res.is_admin);
        localStorage.setItem('token', res.access_token);
        localStorage.setItem('myUserId', res.user_id);
        localStorage.setItem('isAdmin', String(res.is_admin));

        const k = generateDeviceKeys(authForm.password);
        const payload = {
          identity_key_pub: util.encodeBase64(k.identityKeyPair.publicKey),
          signed_prekey_pub: util.encodeBase64(k.preKeyPair.publicKey),
          signed_prekey_sig: util.encodeBase64(k.signedPreKeySignature),
          onetime_keys: k.onetimeKeys.map((otk: any, idx: number) => ({
            key_id: idx,
            pub_key: util.encodeBase64(otk.publicKey)
          }))
        };
        await publishKeys(payload, res.access_token);
        setKeys(k);
        localStorage.setItem('keys', JSON.stringify(k));

        const socket = new MessengerSocket(res.user_id, (msgData) => {
          handleIncomingMessage(msgData, k);
        });
        socket.connect();
        setWs(socket);
      }
    } catch (err) {}
  };

  const fetchAndDecryptRecentChats = async (t: string, k: any, uid: string) => {
    try {
      const chats = await getRecentChats(t);
      for (const c of chats) {
          c.decryptedText = "Encrypted message";
          if (c.last_payload) {
              try {
                  const parsed = typeof c.last_payload === 'string' ? JSON.parse(c.last_payload) : c.last_payload;
                  let counterpartPubKey = parsed.sender_pub; 
                  if (c.last_sender_id === uid) {
                      counterpartPubKey = parsed.recipient_pub || c.partner_pub;
                  }
                  
                  if (!counterpartPubKey) {
                      c.decryptedText = "Err: No PubKey";
                      continue;
                  }
                  
                  const dec = decryptE2EBase64(parsed.encrypted, parsed.nonce, counterpartPubKey, k.preKeyPair.secretKey);
                  if (dec) {
                      const dp = JSON.parse(dec);
                      c.decryptedText = dp.type === 'image' ? '[Image]' : dp.text;
                  } else {
                      c.decryptedText = `Err: MAC fail ${c.last_sender_id===uid ? 'sent' : 'rcv'} sp=${parsed.sender_pub?.substring(0,4)} rp=${parsed.recipient_pub?.substring(0,4)}`;
                  }
              } catch(e: any) {
                  c.decryptedText = `Err: ${e.message.substring(0, 15)}`;
              }
          }
      }
      setRecentChats(chats);
    } catch(e) {}
  };

  useEffect(() => {
    if (token && keys && myUserId) {
        fetchAndDecryptRecentChats(token, keys, myUserId);
    }
  }, [token, keys, myUserId]);

  const handleIncomingMessage = async (msgData: string, currentKeys: any, senderIdOverride?: string) => {
    try {
      const parsed = JSON.parse(msgData);
      
      let payloadObj = parsed;
      let incomingSenderId = senderIdOverride;
      
      if (parsed.type === "new_message") {
        try {
          payloadObj = typeof parsed.payload === 'string' ? JSON.parse(parsed.payload) : parsed.payload;
          incomingSenderId = parsed.sender_id;
        } catch(e) {}
        fetchAndDecryptRecentChats(localStorage.getItem('token') || '', currentKeys, localStorage.getItem('myUserId') || '');
      }

      // Ignore echoed messages that we sent ourselves (optimistic rendering already handled them)
      if (payloadObj.sender_pub === util.encodeBase64(currentKeys.preKeyPair.publicKey)) {
          return;
      }

      const dec = decryptE2EBase64(payloadObj.encrypted, payloadObj.nonce, payloadObj.sender_pub, currentKeys.preKeyPair.secretKey);
      if (!dec) return;
      const decParsed = JSON.parse(dec);
      
      let imageUrl: string | undefined;
      if (decParsed.type === 'image' && token) {
        try {
          const blob = await downloadMediaBlob(decParsed.blob_id, token);
          const arrayBuffer = await blob.arrayBuffer();
          const aesKey = await importKeyBase64(decParsed.aes_key);
          const decryptedBuffer = await decryptSymmetric(new Uint8Array(arrayBuffer) as any, util.decodeBase64(decParsed.iv), aesKey);
          const decBlob = new Blob([decryptedBuffer as any], { type: decParsed.mimeType || 'image/jpeg' });
          imageUrl = URL.createObjectURL(decBlob);
        } catch (imageErr) {
          console.error("Failed to decrypt real-time image", imageErr);
        }
      }
      
      // Only add to current messages if the incoming message is from the selected user!
      // This prevents messages from bleeding into the wrong chat window!
      const currentUser = selectedUserRef.current;
      if (!currentUser || (incomingSenderId && incomingSenderId !== currentUser.id && incomingSenderId !== 'me')) {
          // If we have an incomingSenderId from WebSocket, and it DOES NOT MATCH selectedUser.id, 
          // we silently discard from setMessages (because it's not the active chat).
          // Notice: getRecentChats was already called, so it pops up in sidebar!
          return;
      }

      setMessages(prev => [...prev, {
        id: Math.random().toString(),
        senderId: senderIdOverride || 'them',
        text: decParsed.text,
        imageUrl: imageUrl,
        isMine: senderIdOverride === 'me',
        timestamp: Date.now()
      }]);
    } catch (e) {}
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!token || q.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await searchUsers(q, token);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  };

  const selectUser = async (u: any) => {
    if (!token || !keys || !myUserId) return;
    setSelectedUser(u);
    setSearchQuery('');
    setSearchResults([]);
    setMessages([]);
    try {
      const rkeys = await getDeviceKeys(u.id, token);
      setRecipientKeys(rkeys);

      const msgsData = await getMessages(u.id, token);
      const parsedMsgs: Message[] = [];

      for (const m of msgsData) {
        try {
          const parsedPayload = JSON.parse(m.payload);
          const isMine = m.sender_id === myUserId;
          const counterpartPubKey = isMine ? (parsedPayload.recipient_pub || rkeys.signed_prekey_pub) : parsedPayload.sender_pub;
          
          const dec = decryptE2EBase64(parsedPayload.encrypted, parsedPayload.nonce, counterpartPubKey, keys.preKeyPair.secretKey);
          if (!dec) {
            console.error(`Decryption failed! id=${m.id}, isMine=${isMine}, counterPk=${counterpartPubKey.substring(0,10)}...`);
            continue;
          }
          const decParsed = JSON.parse(dec);

          let imageUrl: string | undefined;
          if (decParsed.type === 'image') {
            try {
              const blob = await downloadMediaBlob(decParsed.blob_id, token);
              const arrayBuffer = await blob.arrayBuffer();
              const aesKey = await importKeyBase64(decParsed.aes_key);
              const decryptedBuffer = await decryptSymmetric(new Uint8Array(arrayBuffer) as any, util.decodeBase64(decParsed.iv), aesKey);
              const decBlob = new Blob([decryptedBuffer as any], { type: decParsed.mimeType || 'image/jpeg' });
              imageUrl = URL.createObjectURL(decBlob);
            } catch (imgErr) {
              console.error("Failed to decrypt history image", imgErr);
            }
          }

          parsedMsgs.push({
            id: m.id,
            senderId: isMine ? 'me' : 'them',
            text: decParsed.text,
            imageUrl: imageUrl,
            isMine: isMine,
            timestamp: m.timestamp
          });
        } catch (err) {
            console.error("Failed to parse history payload", err);
        }
      }
      const sorted = parsedMsgs.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sorted);
    } catch (e) {
      console.error("Failed to load user keys or history", e);
      setRecipientKeys(null);
    }
  };

  const sendE2E = (payloadObj: any) => {
    if (!ws || !recipientKeys || !keys || !selectedUser) return;
    const payloadStr = JSON.stringify(payloadObj);
    const { nonce, encrypted } = encryptE2EBase64(payloadStr, recipientKeys.signed_prekey_pub, keys.preKeyPair.secretKey);
    ws.sendPayload(selectedUser.id, JSON.stringify({
      nonce,
      encrypted,
      sender_pub: util.encodeBase64(keys.preKeyPair.publicKey),
      recipient_pub: recipientKeys.signed_prekey_pub
    }));
  };

  const handleSendText = () => {
    if (!inputText.trim() || !recipientKeys) return;
    sendE2E({ type: 'text', text: inputText });
    setMessages(prev => [...prev, { id: Math.random().toString(), senderId: 'me', text: inputText, isMine: true, timestamp: Date.now() }]);
    setInputText('');
  };

  const handleFileUpload = async (file: File) => {
    if (!token || !recipientKeys) return;
    const objectUrl = URL.createObjectURL(file);
    setMessages(prev => [...prev, { id: Math.random().toString(), senderId: 'me', imageUrl: objectUrl, isMine: true, timestamp: Date.now() }]);
    
    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      const { ciphertext, iv, key } = await encryptSymmetric(buffer as any);
      const encryptedBlob = new Blob([ciphertext as any]);
      const { blob_id } = await uploadMedia(encryptedBlob, token);
      const aes_key = await exportKeyBase64(key);
      sendE2E({ type: 'image', blob_id, aes_key, iv: util.encodeBase64(iv), mimeType: file.type });
    } catch (e) {
      console.error("File upload failed", e);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  if (!token) {
    return (
      <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="bg-polygons"></div>
        <div className="glass-panel" style={{ width: '100%' }}>
          <h2 style={{ marginBottom: '8px' }}>Monero</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>{authMode === 'login' ? 'Login to continue.' : 'Create a secure account.'}</p>
          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input type="text" placeholder="Username" className="chat-input" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} value={authForm.username} onChange={e => setAuthForm(prev => ({ ...prev, username: e.target.value }))} />
            <input type="password" placeholder="Password" className="chat-input" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} value={authForm.password} onChange={e => setAuthForm(prev => ({ ...prev, password: e.target.value }))} />
            <button type="submit" className="btn-primary">{authMode === 'login' ? 'Login' : 'Register'}</button>
          </form>
          <button style={{ background: 'none', border: 'none', color: 'var(--accent)', marginTop: '16px', cursor: 'pointer' }} onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>{authMode === 'login' ? 'Need an account? Register' : 'Have an account? Login'}</button>
        </div>
      </div>
    );
  }

  if (token && !keys) {
    handleLogout();
    return null;
  }

  return (
    <div className="app-container">
      {showAdmin && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.95)', zIndex: 100, display: 'flex', flexDirection: 'column', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
            <h2 style={{ color: 'var(--accent)' }}>Admin Dashboard</h2>
            <button className="icon-btn" style={{ padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }} onClick={() => setShowAdmin(false)}>Close</button>
          </div>
          <div style={{ color: 'orange', marginBottom: '16px', fontSize: '13px' }}>
            ⚠️ Zero-Trust Warning: Resetting a user's password generates a new random seed. They will permanently lose the capability to decrypt their older messages.
          </div>
          <div style={{ overflowY: 'auto' }}>
            {adminUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {u.username} {u.is_admin && <span style={{ color: 'var(--accent)', fontSize: '11px', padding: '2px 6px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>ADMIN</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'gray' }}>{u.id}</div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" onClick={() => handleResetPassword(u.id)}>Reset Pass</button>
                  <button className="btn-primary" style={{ background: '#ef4444' }} onClick={() => handleDeleteUser(u.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3 style={{ fontWeight: 600 }}>Monero</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {isAdmin && (
              <button className="icon-btn" onClick={() => { setShowAdmin(true); loadAdminUsers(); }} title="Admin Dashboard">
                <Settings size={20} />
              </button>
            )}
            <button className="icon-btn" onClick={handleLogout}><LogOut size={20} /></button>
          </div>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div style={{ position: 'relative' }}>
            <input type="text" className="search-bar" placeholder="Search users..." value={searchQuery} onChange={e => handleSearch(e.target.value)} />
          </div>
          {searchResults.length > 0 && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {searchResults.map(u => (
                <div key={u.id} onClick={() => selectUser(u)} style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <User size={16} /> <span style={{ fontSize: '14px' }}>{u.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, padding: '0 12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px', overflowY: 'auto' }}>
          {searchResults.length === 0 && !searchQuery && recentChats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px', paddingLeft: '8px' }}>Recent Chats</div>
              {recentChats.map(u => (
                <div key={u.id} onClick={() => selectUser(u)} style={{ padding: '8px', background: selectedUser?.id === u.id ? 'rgba(56, 189, 248, 0.1)' : 'transparent', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #38bdf8, #818cf8)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{u.username}</div>
                      {Number(u.last_delivered) === 0 && u.last_sender_id !== myUserId && (
                        <div style={{ width: 8, height: 8, background: '#38bdf8', borderRadius: '50%' }}></div>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: Number(u.last_delivered) === 0 && u.last_sender_id !== myUserId ? '#e2e8f0' : 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {u.decryptedText || 'E2EE Active'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <div className="chat-area" onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop} style={{ position: 'relative' }}>
        {isDragging && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.8)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 600, color: 'var(--accent)' }}>Drop file to encrypt and send...</div>}
        
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #38bdf8, #818cf8)' }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '16px' }}>{selectedUser.username}</div>
                  <div style={{ fontSize: '13px', color: '#38bdf8' }}>E2EE Session Active</div>
                </div>
              </div>
              <button className="icon-btn"><MoreVertical size={20} /></button>
            </div>
            
            <div className="messages-list">
              <div style={{ textAlign: 'center', margin: '24px 0' }}>
                <span style={{ background: 'rgba(0,0,0,0.3)', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>End-to-End Encrypted Session</span>
              </div>
              {messages.map(m => (
                <div key={m.id} className={`message-bubble ${m.isMine ? 'sender' : 'receiver'}`} style={{ display: 'flex', flexDirection: 'column', gap: m.imageUrl ? '8px' : '0' }}>
                  {m.imageUrl && <img src={m.imageUrl} alt="encrypted media" style={{ maxWidth: '100%', borderRadius: '8px' }} />}
                  {m.text && <span>{m.text}</span>}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            <div className="chat-input-wrapper">
              <div className="chat-input-container">
                <button className="icon-btn" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.onchange = (e: any) => e.target.files && handleFileUpload(e.target.files[0]);
                  input.click();
                }}><Paperclip size={20} /></button>
                <input type="text" className="chat-input" placeholder="Write an encrypted message..." value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendText()} />
                <button className="icon-btn" style={{ color: inputText.trim() ? 'var(--accent)' : '' }} onClick={handleSendText}><Send size={20} /></button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            Select a user to start an encrypted connection
          </div>
        )}
      </div>
    </div>
  );
}
