import {signClaims} from './secretary-sign.mjs';
import {sendCloudMail} from './cloud-smtp.mjs';
import {digestSteps,category,localDay} from './secretary-data.mjs';
import {ORIGIN} from './secretary-auth.mjs';
import {OWNER} from './owner-config.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const formatTime=value=>new Date(value).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
export async function renderDigest(items,calendar,secret,{time=Date.now(),validation=false}={}) {
 const day=localDay(time), groups=['急件','近期截止','一般待辦'];
 const summary=i=>`${i.activity}｜${i.title}${i.status==='unknown'?'（進度待確認）':''}${i.due_at?' · '+(Date.parse(i.due_at)<time?'原期限 ':'截止 ')+formatTime(i.due_at):''}`;
 let n=0;
 const sections=await Promise.all(groups.map(async group=>{
  const rows=items.filter(i=>category(i,time)===group);
  const amp=await Promise.all(rows.map(async i=>{
   const ix=n++,token=await signClaims({v:1,id:i.id,rev:i.revision,exp:Math.floor(Date.now()/1000)+7*86400},secret);
   return `<section class="task"><p class="meta">${escape(i.activity)}${i.due_at?' · '+(Date.parse(i.due_at)<time?'原期限 ':'截止 ')+escape(formatTime(i.due_at)):''}</p>${i.detail?`<p class="detail">${escape(i.detail)}</p>`:''}<amp-list id="list${ix}" src="${ORIGIN}/state?token=${token}" width="auto" height="150" layout="fixed-height" binding="no"><div placeholder>讀取最新進度中…</div><div fallback>暫時無法讀取，請稍後重開。</div><template type="amp-mustache">{{#needs_confirmation}}<p class="meta">進度待確認：完成後才勾選。</p>{{/needs_confirmation}}{{#done}}<label class="done"><input type="checkbox" checked disabled><span>{{title}}</span></label><p class="saved">完成已保存</p>{{/done}}{{^done}}<form id="form${ix}" method="post" action-xhr="${ORIGIN}/state" on="submit-success:list${ix}.refresh"><input type="hidden" name="token" value="{{token}}"><label><input type="checkbox" name="done" value="1" required on="change:form${ix}.submit"><span>{{title}}</span></label><div submitting>正在保存…</div><div submit-success>完成已保存</div><div submit-error>保存未成功，請重試。</div></form>{{/done}}</template></amp-list>${i.source_chat?`<a class="chat" href="${escape(i.source_chat)}">回原聊天補充、延期或取消</a>`:''}</section>`;
  }));
  return {amp:`<h2>${group} · ${rows.length}</h2>${amp.join('')||'<p>目前沒有。</p>'}`,html:`<h2>${group} · ${rows.length}</h2><ul>${rows.map(i=>`<li>${escape(summary(i))}</li>`).join('')||'<li>目前沒有。</li>'}</ul>`,text:group+'\n'+(rows.map(summary).join('\n')||'目前沒有。')};
 }));
 const eventLines=calendar.events.map(e=>{
  const startedBeforeToday=e.start.slice(0,10)<day;
  const when=e.all_day?(startedBeforeToday?'進行中（全天）':'全天'):startedBeforeToday?`進行中，至 ${formatTime(e.end)}`:`${formatTime(e.start)}–${formatTime(e.end)}`;
  return `${when}｜${e.title}`;
 });
 const eventHtml='<h2>今日行程 · '+eventLines.length+'</h2><ul>'+(eventLines.map(e=>'<li>'+escape(e)+'</li>').join('')||'<li>今天沒有行程。</li>')+'</ul>';
 const warning=calendar.warning||'';
 const heading=`AI秘書｜${day} ${validation?'總覽驗收':'每日總覽'}`;
 const intro=validation?'這封使用目前真實事項；只有實際完成後才勾選。':'完成哪一步，就勾哪一格。已完成的步驟會從之後的總覽排除。';
 const footer='請使用 Gmail App 或 Gmail 網頁版操作；iPhone 內建「郵件」只會顯示一般版本。互動有效 7 天。';
 const amp=`<!doctype html><html amp4email data-css-strict lang="zh-Hant"><head><meta charset="utf-8"><script async src="https://cdn.ampproject.org/v0.js"></script><script async custom-element="amp-list" src="https://cdn.ampproject.org/v0/amp-list-0.1.js"></script><script async custom-element="amp-form" src="https://cdn.ampproject.org/v0/amp-form-0.1.js"></script><script async custom-template="amp-mustache" src="https://cdn.ampproject.org/v0/amp-mustache-0.2.js"></script><style amp4email-boilerplate>body{visibility:hidden}</style><style amp-custom>body{font-family:Arial,sans-serif;padding:16px;color:#263238;line-height:1.5}h1{font-size:24px}h2{font-size:19px;margin-top:30px}.task{border:1px solid #e1e5ea;border-radius:12px;margin:12px 0;padding:12px}.meta{font-size:13px;color:#5f6368}.detail{font-size:14px}label{display:flex;gap:12px;align-items:flex-start;padding:8px 0}input[type=checkbox]{min-width:24px;width:24px;height:24px}.done,.saved{color:#137333}.done span{text-decoration:line-through}.chat{font-size:13px}.warn,[submit-error]{color:#b91c1c}footer{font-size:12px;color:#666;margin-top:30px}</style></head><body><h1>${heading}</h1><p>${intro}</p>${warning?`<p class="warn">${escape(warning)}</p>`:''}${sections.map(s=>s.amp).join('')}${eventHtml}<footer>${footer}</footer></body></html>`;
 return {subject:heading,amp,html:`<h1>${heading}</h1><p>${intro}</p><p><b>一般郵件版本：請改用 Gmail App 開啟同一封信，才能在信內勾選。</b></p>${warning?'<p>'+escape(warning)+'</p>':''}${sections.map(s=>s.html).join('')}${eventHtml}<p>${footer}</p>`,text:[heading,intro,warning,...sections.map(s=>s.text),'今日行程\n'+(eventLines.join('\n')||'今天沒有行程。'),footer].filter(Boolean).join('\n\n')};
}
export async function calendarForDay(env,day) {
 if(!OWNER.configured||!OWNER.calendar) throw Error('CALENDAR_NOT_CONFIGURED');
 if(!env.CALENDAR_REFRESH_TOKEN) return {events:[],checked_at:null,warning:'今日行程尚未連接雲端日曆，不能視為今天沒有行程。'};
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:env.GMAIL_CLIENT_ID,client_secret:env.GMAIL_CLIENT_SECRET,refresh_token:env.CALENDAR_REFRESH_TOKEN}),signal:AbortSignal.timeout(15000)});
 if(!response.ok) throw Error('CALENDAR_AUTH_FAILED');
 const credential=await response.json();
 const tomorrow=new Date(Date.parse(day+'T00:00:00+08:00')+86400000).toISOString();
 const events=[];let pageToken='';let pages=0;
 do {
  const url=new URL('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(OWNER.calendar)+'/events');
  url.search=new URLSearchParams({timeMin:day+'T00:00:00+08:00',timeMax:tomorrow,timeZone:'Asia/Taipei',singleEvents:'true',orderBy:'startTime',maxResults:'250',fields:'items(id,summary,start,end,status),nextPageToken',...(pageToken?{pageToken}:{})});
  const result=await fetch(url,{headers:{Authorization:'Bearer '+credential.access_token},signal:AbortSignal.timeout(15000)});
  if(!result.ok) throw Error('CALENDAR_READ_FAILED');
  const data=await result.json();
  for(const e of data.items||[]) if(e.status!=='cancelled') events.push({id:e.id,title:e.summary||'未命名行程',start:e.start.dateTime||e.start.date,end:e.end.dateTime||e.end.date,all_day:!!e.start.date});
  pageToken=data.nextPageToken||'';pages++;
  if(pageToken&&pages>=10) throw Error('CALENDAR_INCOMPLETE');
 } while(pageToken);
 return {events,checked_at:new Date().toISOString(),warning:''};
}
export async function sendDigest(env,{time=Date.now(),validation=false,preview=false}={},dependencies={}) {
 const day=localDay(time),id=(validation?'validation:':'daily:')+day;
 const items=await digestSteps(env.DB,time);
 let calendar;
 try {calendar=await (dependencies.calendar||calendarForDay)(env,day);} catch {calendar={events:[],checked_at:null,warning:'今天讀取日曆失敗；下面的待辦進度仍有效，但今日行程尚未確認。'};}
 const content=await renderDigest(items,calendar,env.SIGNING_SECRET,{time,validation});
 if(preview) return {subject:content.subject,items:items.map(i=>({id:i.id,title:i.title,status:i.status,category:category(i,time)})),calendar,...(dependencies.includeContent?{content}:{})};
 const existing=await env.DB.prepare('SELECT id,status,accepted_at FROM digest_runs WHERE id=?').bind(id).first();
 if(existing) return {...existing,duplicate:true};
 const claimed=await env.DB.prepare("INSERT INTO digest_runs(id,day,status,created_at,included_ids,calendar_checked_at) VALUES (?,?,'attempting',?,?,?) ON CONFLICT DO NOTHING RETURNING id").bind(id,day,new Date().toISOString(),JSON.stringify(items.map(i=>i.id)),calendar.checked_at).first();
 if(!claimed) return {id,status:'already_claimed',duplicate:true};
 try {
  await (dependencies.send||sendCloudMail)(env,content);
  const accepted_at=new Date().toISOString();
  await env.DB.prepare("UPDATE digest_runs SET status='accepted',accepted_at=? WHERE id=?").bind(accepted_at,id).run();
  return {id,status:'accepted',accepted_at,included_ids:items.map(i=>i.id),calendar_checked_at:calendar.checked_at,warning:calendar.warning};
 } catch {
  await env.DB.prepare("UPDATE digest_runs SET status='uncertain_or_failed',error_code='MAIL_SEND_FAILED' WHERE id=?").bind(id).run();
  throw Error('MAIL_SEND_FAILED_NO_AUTOMATIC_RETRY');
 }
}
