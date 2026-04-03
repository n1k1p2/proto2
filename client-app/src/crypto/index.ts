import nacl from 'tweetnacl';
import util from 'tweetnacl-util';

export const generateDeviceKeys = (password?: string) => {
    let identityKeyPair, preKeyPair;
    if (password) {
        const passBytes = util.decodeUTF8(password);
        const hash64 = nacl.hash(passBytes);
        const seed1 = hash64.slice(0, 32);
        const seed2 = hash64.slice(32, 64);
        identityKeyPair = nacl.sign.keyPair.fromSeed(seed1);
        preKeyPair = nacl.box.keyPair.fromSecretKey(seed2);
    } else {
        identityKeyPair = nacl.sign.keyPair();
        preKeyPair = nacl.box.keyPair();
    }
    const signedPreKeySignature = nacl.sign.detached(preKeyPair.publicKey, identityKeyPair.secretKey);
    const onetimeKeys = Array.from({ length: 10 }).map(() => nacl.box.keyPair());
    return { identityKeyPair, preKeyPair, signedPreKeySignature, onetimeKeys };
};

export const encryptSymmetric = async (data: any): Promise<{ ciphertext: Uint8Array, iv: Uint8Array, key: CryptoKey }> => {
    const key = await window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    return { ciphertext: new Uint8Array(ciphertextBuffer), iv, key };
};

export const decryptSymmetric = async (ciphertext: any, iv: Uint8Array, key: CryptoKey): Promise<Uint8Array> => {
    const decryptedBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as any }, key, ciphertext);
    return new Uint8Array(decryptedBuffer);
};

export const exportKeyBase64 = async (key: CryptoKey): Promise<string> => {
    const raw = await window.crypto.subtle.exportKey('raw', key);
    return util.encodeBase64(new Uint8Array(raw));
};

export const importKeyBase64 = async (base64Key: string): Promise<CryptoKey> => {
    const raw = util.decodeBase64(base64Key);
    return window.crypto.subtle.importKey('raw', raw as any, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
};

export const encryptE2EBase64 = (message: string, recipientPubBase64: string, senderSecretKey: Uint8Array) => {
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const messageUint8 = util.decodeUTF8(message);
    const recipientPublicKey = util.decodeBase64(recipientPubBase64);
    const encrypted = nacl.box(messageUint8, nonce, recipientPublicKey, senderSecretKey);
    return { nonce: util.encodeBase64(nonce), encrypted: util.encodeBase64(encrypted) };
};

export const decryptE2EBase64 = (encryptedBase64: string, nonceBase64: string, senderPubBase64: string, recipientSecretKey: Uint8Array) => {
    const encrypted = util.decodeBase64(encryptedBase64);
    const nonce = util.decodeBase64(nonceBase64);
    const senderPublicKey = util.decodeBase64(senderPubBase64);
    const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);
    if (!decrypted) return null;
    return util.encodeUTF8(decrypted);
};
