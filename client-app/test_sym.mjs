import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
const A = nacl.box.keyPair();
const B = nacl.box.keyPair();
const nonce = nacl.randomBytes(24);
const msg = util.decodeUTF8('hello world');
const box = nacl.box(msg, nonce, B.publicKey, A.secretKey);

// Simulate localStorage save and restore
const strA = JSON.stringify(A);
const p = JSON.parse(strA);
const toU8 = (obj) => new Uint8Array(Object.values(obj));
const restoredA = {
    publicKey: toU8(p.publicKey),
    secretKey: toU8(p.secretKey)
};

const dec_B = nacl.box.open(box, nonce, restoredA.publicKey, B.secretKey);
const dec_A = nacl.box.open(box, nonce, B.publicKey, restoredA.secretKey);

console.log('dec_B', dec_B ? util.encodeUTF8(dec_B) : 'failed');
console.log('dec_A', dec_A ? util.encodeUTF8(dec_A) : 'failed');
