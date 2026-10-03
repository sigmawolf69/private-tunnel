const utf8 = new TextEncoder();
export const b64 = bytes => {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text);
};
export const unb64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
export async function seal(pem, password, operation, body) {
  const der = unb64(pem.replace(/-----[^-]+-----|\s/g, ''));
  const publicKey = await crypto.subtle.importKey('spki', der, {name:'RSA-OAEP', hash:'SHA-256'}, false, ['encrypt']);
  const keys = crypto.getRandomValues(new Uint8Array(64));
  const requestKey = await crypto.subtle.importKey('raw', keys.slice(0,32), 'AES-GCM', false, ['encrypt']);
  const responseKey = await crypto.subtle.importKey('raw', keys.slice(32), 'AES-GCM', false, ['decrypt']);
  const wrapped = await crypto.subtle.encrypt('RSA-OAEP', publicKey, keys);
  keys.fill(0);
  const id = crypto.randomUUID();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({name:'AES-GCM', iv:nonce, additionalData:utf8.encode('private-tunnel/v1/request')}, requestKey, utf8.encode(JSON.stringify({id,time:Date.now(),password,operation,body})));
  return {envelope:{key:b64(wrapped),nonce:b64(nonce),data:b64(data)}, async open(reply) {
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(reply.nonce),additionalData:utf8.encode('private-tunnel/v1/response/'+id)},responseKey,unb64(reply.data));
    const result = JSON.parse(new TextDecoder().decode(plain));
    if (result.id !== id) throw new Error('Response identity mismatch');
    return result;
  }};
}
