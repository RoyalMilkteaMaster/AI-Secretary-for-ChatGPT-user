import {publicPage} from './pages.mjs';
import {oauth} from './secretary-auth.mjs';
import {handleMcp,handleAdmin} from './secretary-mcp.mjs';
import {sendDigest} from './secretary-digest.mjs';
import {OWNER} from './owner-config.mjs';
const MAX_AGE = 7 * 86400;
const encoder = new TextEncoder();
const baseHeaders = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};

// Fail closed until prepare.mjs has written validated owner settings, the
// service origin is known and the deployed AMP sender matches them.
export function ownerReady(env) {
  return OWNER.configured===true && !!OWNER.origin && !!OWNER.sender && env.AMP_SENDER===OWNER.sender;
}

function cors(request, url, allowedSender) {
  const sender = request.headers.get('AMP-Email-Sender');
  const origin = request.headers.get('Origin');
  // AMP v2 takes precedence; legacy requests require both Origin and sender.
  if (sender) return sender === allowedSender ? {'AMP-Email-Allow-Sender':sender, 'Vary':'Origin, AMP-Email-Sender'} : null;
  const source = url.searchParams.get('__amp_source_origin');
  if (!['https://mail.google.com','https://amp.gmail.dev'].includes(origin) || source !== allowedSender) return null;
  return {
    'AMP-Email-Allow-Sender':source,
    'Access-Control-Allow-Origin':origin,
    'AMP-Access-Control-Allow-Source-Origin':source,
    'Access-Control-Expose-Headers':'AMP-Access-Control-Allow-Source-Origin',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, AMP-Email-Sender',
    'Vary':'Origin, AMP-Email-Sender'
  };
}

function decode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
}

export async function verifyToken(token, secret, now = Math.floor(Date.now()/1000)) {
  if (typeof token !== 'string' || token.length > 1024 || !secret) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    if (!await crypto.subtle.verify('HMAC',key,decode(parts[1]),encoder.encode(parts[0]))) return null;
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (claims.v !== 1 || typeof claims.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(claims.id) ||
        !Number.isSafeInteger(claims.rev) || claims.rev < 1 || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now || claims.exp > now + MAX_AGE) return null;
    return claims;
  } catch { return null; }
}

export default {
  async scheduled(controller,env) {
    if(env.DAILY_ENABLED!=='true'||!ownerReady(env)) return;
    await sendDigest(env,{time:controller.scheduledTime});
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (body,status=200,extra={}) => new Response(JSON.stringify(body),{status,headers:{...baseHeaders,...extra}});
    if (request.method === 'GET') {
      const page = publicPage(url.pathname);
      if(page) return page;
    }
    if (url.pathname === '/health' && request.method === 'GET') return json({service:'ai-secretary-progress',mode:env.DAILY_ENABLED==='true'?'daily':'integration',configured:ownerReady(env),ok:true});
    if (!ownerReady(env)) return json({error:'服務尚未設定完成'},503);
    if(url.pathname==='/mcp') return handleMcp(request,env);
    if(url.pathname==='/internal/secretary') return handleAdmin(request,env,verifyToken);
    if(url.pathname.startsWith('/oauth/')||url.pathname.startsWith('/.well-known/oauth-')) {
      try {return await oauth(request,env,verifyToken)||new Response(null,{status:404});}
      catch {return new Response(JSON.stringify({error:'authorization_unavailable'}),{status:503,headers:baseHeaders});}
    }
    if (url.pathname !== '/state') return json({error:'找不到服務'},404);
    const headers = cors(request,url,env.AMP_SENDER);
    if (!headers) return json({error:'寄件來源不符'},403);
    const reply = (body,status=200) => json(body,status,headers);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...baseHeaders,...headers}});
    if (!['GET','POST'].includes(request.method)) return reply({error:'不支援此操作'},405);
    if (!env.DB || !env.SIGNING_SECRET) return reply({error:'服務尚未設定完成'},503);
    try {
      let params = url.searchParams;
      if (request.method === 'POST') {
        const type = request.headers.get('Content-Type') || '';
        if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(;|$)/i.test(type)) return reply({error:'資料格式錯誤'},415);
        if (Number(request.headers.get('Content-Length') || 0) > 4096) return reply({error:'資料過大'},413);
        const body = await request.arrayBuffer();
        if (body.byteLength > 4096) return reply({error:'資料過大'},413);
        params = await new Response(body,{headers:{'Content-Type':type}}).formData();
      }
      if (params.getAll('token').length !== 1) return reply({error:'連結無效'},400);
      const token = params.get('token');
      const claims = await verifyToken(token,env.SIGNING_SECRET);
      if (!claims) return reply({error:'郵件已失效，請使用最新郵件'},401);
      if (request.method === 'POST' && (params.getAll('done').length !== 1 || params.get('done') !== '1')) return reply({error:'尚未勾選完成'},400);
      let item;
      if (request.method === 'POST') {
        // Atomic update: retries preserve timestamp, old emails cannot change a new revision.
        item = await env.DB.prepare(`UPDATE steps SET status='completed', completed_at=COALESCE(completed_at, ?)
          WHERE id=? AND revision=? AND status IN ('pending','unknown','completed')
          RETURNING id,title,status,completed_at`).bind(new Date().toISOString(),claims.id,claims.rev).first();
      } else {
        item = await env.DB.prepare(`SELECT id,title,status,completed_at FROM steps
          WHERE id=? AND revision=? AND status IN ('pending','unknown','completed')`).bind(claims.id,claims.rev).first();
      }
      if (!item) return reply({error:'事項已更新或停止，請使用最新郵件'},409);
      return reply({ok:true,items:[{id:item.id,title:item.title,done:item.status==='completed',needs_confirmation:item.status==='unknown',completed_at:item.completed_at || '',token}]});
    } catch {
      // Do not expose SQL, tokens, task data or configuration in errors/logs.
      return reply({error:'暫時無法讀取或保存，請稍後重試；尚未確認完成'},503);
    }
  }
};
