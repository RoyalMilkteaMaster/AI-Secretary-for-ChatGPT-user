import {Buffer} from 'node:buffer';
import {OWNER} from './owner-config.mjs';

export const ORIGIN=OWNER.origin;
export const RESOURCE=ORIGIN+'/mcp';
const CLIENT='https://chatgpt.com/oauth/client.json';
const REDIRECT='https://chatgpt.com/connector_platform_oauth_redirect';
const SCOPES=['secretary.read','secretary.write'];
const now=()=>Math.floor(Date.now()/1000);
const random=()=>Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
export const hash=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('base64url');
export const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const bad=()=>json({error:'invalid_request'},400);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function unauthorized() {return json({error:'authorization_required'},401,{'WWW-Authenticate':`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource", scope="${SCOPES.join(' ')}", error="invalid_token", error_description="Connect your private secretary account to continue"`});}
export async function authenticate(request,env) {
 const value=request.headers.get('Authorization')||'';
 if(!/^Bearer [A-Za-z0-9_-]{43}$/.test(value)) return null;
 const token=await env.DB.prepare("SELECT scope FROM oauth_tokens WHERE hash=? AND type='access' AND resource=? AND expires>?").bind(await hash(value.slice(7)),RESOURCE,now()).first();
 return token ? token.scope.split(' ') : null;
}
async function validClient(client,redirect) {
 if(client!==CLIENT||redirect!==REDIRECT) return false;
 // Only fetch OpenAI's exact public metadata URL, never an arbitrary client URL.
 // Workers supports manual/follow, not redirect:error. Manual also ensures an
 // unexpected redirect cannot send discovery to a different host.
 const response=await fetch(CLIENT,{redirect:'manual',signal:AbortSignal.timeout(10000)});
 if(!response.ok) return false;
 const metadata=await response.json();
 return metadata.client_id===CLIENT&&Array.isArray(metadata.redirect_uris)&&metadata.redirect_uris.includes(REDIRECT);
}
function authorizationInput(p) {
 for(const key of ['client_id','redirect_uri','response_type','code_challenge','code_challenge_method','resource','state']) if(p.getAll(key).length!==1) return null;
 const a=Object.fromEntries(p);
 if(a.client_id!==CLIENT||a.redirect_uri!==REDIRECT||a.resource!==RESOURCE||a.response_type!=='code'||a.code_challenge_method!=='S256'||!/^[-_A-Za-z0-9]{43}$/.test(a.code_challenge)||!a.state||a.state.length>2048) return null;
 a.scope=(a.scope||'').split(' ').filter(Boolean).sort().join(' ');
 if(!a.scope||a.scope.split(' ').some(s=>!SCOPES.includes(s)&&s!=='offline_access')) return null;
 return {client_id:a.client_id,redirect_uri:a.redirect_uri,resource:a.resource,response_type:a.response_type,code_challenge:a.code_challenge,code_challenge_method:a.code_challenge_method,state:a.state,scope:a.scope};
}
export async function oauth(request,env,verifyToken) {
 const url=new URL(request.url), path=url.pathname;
 if(path==='/.well-known/oauth-protected-resource'||path==='/.well-known/oauth-protected-resource/mcp') return json({resource:RESOURCE,authorization_servers:[ORIGIN],scopes_supported:SCOPES,resource_name:'AI秘書進度',resource_policy_uri:ORIGIN+'/privacy'});
 if(path==='/.well-known/oauth-authorization-server') return json({issuer:ORIGIN,authorization_endpoint:ORIGIN+'/oauth/authorize',token_endpoint:ORIGIN+'/oauth/token',revocation_endpoint:ORIGIN+'/oauth/revoke',authorization_response_iss_parameter_supported:true,client_id_metadata_document_supported:true,token_endpoint_auth_methods_supported:['none'],response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],scopes_supported:[...SCOPES,'offline_access']});
 if(!path.startsWith('/oauth/')) return null;
 if(path==='/oauth/authorize'&&['GET','POST'].includes(request.method)) {
  if(Number(request.headers.get('Content-Length')||0)>8192) return bad();
  const raw=request.method==='POST'?await request.text():url.searchParams.toString();
  if(raw.length>8192) return bad();
  const p=new URLSearchParams(raw), input=authorizationInput(p);
  if(!input||!await validClient(input.client_id,input.redirect_uri)) return bad();
  const binding=await hash(JSON.stringify(input));
  if(request.method==='GET') {
   const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>連結 AI 秘書進度</title><style>body{max-width:600px;margin:60px auto;padding:24px;font:18px system-ui;line-height:1.7}input,button{font:inherit;padding:12px;box-sizing:border-box;width:100%;margin:8px 0}small{word-break:break-all;color:#666}</style><h1>連結 AI 秘書進度</h1><p>授權 ChatGPT 讀取與更新此帳戶的秘書待辦。只限你的進度資料，不提供 Gmail 密鑰，也不允許任意寄信或刪除日曆。</p><p>由本機擁有者產生一次性連結碼，5 分鐘內有效。請把下方「請求識別」交給本機助手。</p><form method="post" action="/oauth/authorize">${Object.entries(input).map(([k,v])=>`<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<label for="approval">一次性連結碼</label><input id="approval" name="approval" type="password" required autocomplete="off"><button type="submit">授權這次連線</button></form><p>請求識別：</p><small id="request-binding">${binding}</small></html>`;
   return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://chatgpt.com/connector_platform_oauth_redirect; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
  }
  if(request.headers.get('Origin')!==ORIGIN) return bad();
  const approval=p.get('approval'), claims=await verifyToken(approval,env.SIGNING_SECRET);
  if(!claims||claims.id!=='OAUTH_APPROVE'||claims.rev!==1||claims.binding!==binding||claims.exp>now()+600) return json({error:'invalid_approval'},403);
  const used=await env.DB.prepare('INSERT INTO oauth_approvals(hash,expires) VALUES (?,?) ON CONFLICT DO NOTHING RETURNING hash').bind(await hash(approval),claims.exp).first();
  if(!used) return json({error:'approval_already_used'},403);
  const code=random();
  await env.DB.prepare('INSERT INTO oauth_codes(hash,client_id,redirect_uri,challenge,resource,scope,expires) VALUES (?,?,?,?,?,?,?)').bind(await hash(code),input.client_id,input.redirect_uri,input.code_challenge,input.resource,input.scope,now()+120).run();
  const redirect=new URL(input.redirect_uri);redirect.searchParams.set('code',code);redirect.searchParams.set('state',input.state);redirect.searchParams.set('iss',ORIGIN);
  return new Response(null,{status:303,headers:{Location:redirect.toString(),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(request.method!=='POST') return json({error:'method_not_allowed'},405);
 const raw=await request.text(); if(raw.length>8192) return bad();
 const p=new URLSearchParams(raw);
 if(p.get('client_id')!==CLIENT) return bad();
 if(path==='/oauth/revoke') {
  const value=p.get('token');if(value&&/^[-_A-Za-z0-9]{43}$/.test(value)) {
   const row=await env.DB.prepare('SELECT family FROM oauth_tokens WHERE hash=? AND client_id=?').bind(await hash(value),CLIENT).first();
   if(row) await env.DB.prepare('DELETE FROM oauth_tokens WHERE family=?').bind(row.family).run();
  }
  return json({});
 }
 if(path!=='/oauth/token'||p.get('resource')!==RESOURCE) return bad();
 let grant,family;
 if(p.get('grant_type')==='authorization_code') {
  const code=p.get('code'),verifier=p.get('code_verifier');
  if(!code||!verifier||!/^[-._~A-Za-z0-9]{43,128}$/.test(verifier)||p.get('redirect_uri')!==REDIRECT) return bad();
  grant=await env.DB.prepare('DELETE FROM oauth_codes WHERE hash=? AND client_id=? AND redirect_uri=? AND challenge=? AND resource=? AND expires>? RETURNING scope').bind(await hash(code),CLIENT,REDIRECT,await hash(verifier),RESOURCE,now()).first();
  family=random();
 } else if(p.get('grant_type')==='refresh_token') {
  const refresh=p.get('refresh_token');if(!refresh) return bad();
  grant=await env.DB.prepare("DELETE FROM oauth_tokens WHERE hash=? AND type='refresh' AND client_id=? AND resource=? AND expires>? RETURNING scope,family").bind(await hash(refresh),CLIENT,RESOURCE,now()).first();
  family=grant?.family;
 } else return bad();
 if(!grant) return json({error:'invalid_grant'},400);
 if(p.has('scope')&&p.get('scope').split(' ').some(s=>!grant.scope.split(' ').includes(s))) return json({error:'invalid_scope'},400);
 const access=random(),refresh=random();
 await env.DB.batch([
  env.DB.prepare('INSERT INTO oauth_tokens(hash,family,type,client_id,resource,scope,expires) VALUES (?,?,?,?,?,?,?)').bind(await hash(access),family,'access',CLIENT,RESOURCE,grant.scope,now()+3600),
  env.DB.prepare('INSERT INTO oauth_tokens(hash,family,type,client_id,resource,scope,expires) VALUES (?,?,?,?,?,?,?)').bind(await hash(refresh),family,'refresh',CLIENT,RESOURCE,grant.scope,now()+90*86400),
  env.DB.prepare('DELETE FROM oauth_tokens WHERE expires<=?').bind(now()),
  env.DB.prepare('DELETE FROM oauth_codes WHERE expires<=?').bind(now()),
  env.DB.prepare('DELETE FROM oauth_approvals WHERE expires<=?').bind(now())
 ]);
 return json({access_token:access,refresh_token:refresh,token_type:'Bearer',expires_in:3600,scope:grant.scope});
}
