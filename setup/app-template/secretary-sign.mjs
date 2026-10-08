import {Buffer} from 'node:buffer';

// Same HMAC-SHA256 claim format as the original probe-digest.mjs signClaims.
export async function signClaims(claims, secret) {
  const data = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return data + '.' + Buffer.from(signature).toString('base64url');
}
