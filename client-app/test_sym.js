import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
const A = nacl.box.keyPair();
const B = nacl.box.keyPair();
const nonce = nacl.randomBytes(24);
const msg = util.decodeUTF8('hello world');
const box = nacl.box(msg, nonce, B.publicKey, A.secretKey);

const dec_B = nacl.box.open(box, nonce, A.publicKey, B.secretKey);
const dec_A = nacl.box.open(box, nonce, B.publicKey, A.secretKey);

console.log('dec_B', dec_B ? util.encodeUTF8(dec_B) : 'failed');
console.log('dec_A', dec_A ? util.encodeUTF8(dec_A) : 'failed');
