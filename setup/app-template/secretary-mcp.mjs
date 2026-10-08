import {authenticate,unauthorized,json,RESOURCE,ORIGIN,hash} from './secretary-auth.mjs';
import {listSteps,getStep,createStep,updateStep} from './secretary-data.mjs';
import {sendDigest} from './secretary-digest.mjs';
import {listCalendarEvents,proposeCalendarChange,confirmCalendarChange} from './secretary-calendar.mjs';
import {OWNER} from './owner-config.mjs';
const str=(description,maxLength=500)=>({type:'string',description,maxLength});
const timestamp={type:['string','null'],description:'含時區的 ISO 8601 時間。null 表示未定；不得猜測官方截止。'};
const statuses={type:'string',enum:['pending','unknown','completed','cancelled']};
const taskProperties={id:str('穩定、唯一的英文 ID；重試沿用同一 ID。',80),title:str('一個可勾選的具體步驟'),activity:str('所屬主活動',200),status:{type:'string',enum:['pending','unknown'],description:'未知進度用 unknown，不以沒有回覆推定未完成。'},priority:{type:'string',enum:['normal','urgent']},due_at:timestamp,not_before:timestamp,source_chat:str('來源 ChatGPT 聊天完整 URL；未知用空字串。',300),detail:str('僅保存必要的備註、來源與期限性質，不存密碼或附件全文。',1500),kind:{type:'string',enum:['task','test'],description:'真實事項與要在信中驗收的示範事項都用 task；test 永遠不進每日信或驗收信。'}};
taskProperties.paused={type:'boolean',description:'暫停追蹤時為 true；保留進度，但不出現在每日信。恢復需本人明確要求。'};
const specs=[
 {name:'list_calendar_events',title:'查看行程與空檔',description:'Read the configured calendar only. Use before suggesting a schedule. Includes recurring instances and all-day events; busy=false means free or declined. Read failures never mean no events.',inputSchema:{type:'object',properties:{start:str('查詢起日 YYYY-MM-DD 或含時區 ISO 時間'),end:str('查詢終點（不包含），最大 31 天')},required:['start','end'],additionalProperties:false},read:true,calendar:true},
 {name:'propose_calendar_change',title:'提出日曆安排並檢查撞期',description:'Prepare a create/update proposal, without writing to Google Calendar. Show the exact title, dates, times, location, description changes, before/after and conflicts to the owner; ask for explicit confirmation. When there is a conflict suggest another time. No guests or recurring-series edits.',inputSchema:{type:'object',properties:{operation:{type:'string',enum:['create','update']},event_id:str('改期時填原事件 ID；新增時省略',1024),title:str('行程標題',300),start:str('含時區 ISO 時間；全天用 YYYY-MM-DD'),end:str('含時區 ISO 結束時間；全天結束日不包含在內'),location:str('行程地點；省略表示改期時保留原地點，空字串表示清除',500),description:str('必要備註或活動來源連結；省略表示保留，不放附件全文',4000)},required:['operation','title','start','end'],additionalProperties:false},read:false,calendar:true,proposal:true},
 {name:'confirm_calendar_change',title:'本人確認後寫入日曆',description:'Write ONLY after the owner explicitly approved this exact proposal. confirmed=true attests that approval. allow_conflict=true additionally requires the owner to accept the displayed overlap. Rechecks conflicts and event version, then reads back. On uncertain results retry the SAME proposal only to reconcile; never create another proposal to repeat the write. Proposals expire after 15 minutes.',inputSchema:{type:'object',properties:{proposal_id:str('剛才展示並經本人確認的 proposal_id'),confirmed:{type:'boolean',const:true},allow_conflict:{type:'boolean',description:'只有本人明確接受已展示的撞期才可設 true'}},required:['proposal_id','confirmed'],additionalProperties:false},read:false,calendar:true,destructive:true},
 {name:'list_steps',title:'讀取秘書共用進度',description:'Use when planning reminders, checking email checkbox completion, or updating tasks from any chat. Read this authoritative shared state first; never infer completion from chat memory. Returns active steps by default.',inputSchema:{type:'object',properties:{include_closed:{type:'boolean'}},additionalProperties:false},read:true},
 {name:'get_step',title:'讀取單一步驟',description:'Use before editing a known step. Returns current status and revision for conflict-safe updates.',inputSchema:{type:'object',properties:{id:str('步驟 ID',80)},required:['id'],additionalProperties:false},read:true},
 {name:'create_step',title:'新增秘書待辦',description:'Use when the owner asks to track a new actionable step. Read existing steps to avoid duplicates. One step per checkbox; do not activate conditional stages or paused activities. Does not send email or change calendar.',inputSchema:{type:'object',properties:taskProperties,required:Object.keys(taskProperties),additionalProperties:false},read:false},
 {name:'update_step',title:'更新完成、延期或取消',description:'Use for an explicit owner progress report, cancellation, reschedule, or task detail change. First get_step; pass its exact revision/status. A conflict requires reading again, never force overwrite a newer email completion. Reopen a completed/cancelled step only when the owner explicitly asks. Does not send email or change calendar.',inputSchema:{type:'object',properties:{id:taskProperties.id,expected_revision:{type:'integer',minimum:1},expected_status:statuses,reopen:{type:'boolean'},patch:{type:'object',properties:{title:taskProperties.title,status:statuses,activity:taskProperties.activity,priority:taskProperties.priority,due_at:timestamp,not_before:timestamp,source_chat:taskProperties.source_chat,detail:taskProperties.detail},minProperties:1,additionalProperties:false}},required:['id','expected_revision','expected_status','patch'],additionalProperties:false},read:false},
 {name:'preview_daily_overview',title:'預覽下一封總覽',description:'Use to inspect the next daily overview and verify completed steps are excluded. Reads only the owner configured personal calendar for today. Does not send email.',inputSchema:{type:'object',properties:{},additionalProperties:false},read:true},
 {name:'get_service_status',title:'檢查寄送與排程',description:'Use to verify recent daily delivery receipts and configuration. SMTP acceptance is not proof the owner read the email. No secrets returned.',inputSchema:{type:'object',properties:{},additionalProperties:false},read:true}
];
specs.find(s=>s.name==='update_step').inputSchema.properties.patch.properties.paused=taskProperties.paused;
export const mcpTools=specs.map(({read,calendar,proposal,destructive,...s})=>({...s,annotations:{readOnlyHint:read,destructiveHint:!!destructive,idempotentHint:!proposal,openWorldHint:!!calendar},securitySchemes:[{type:'oauth2',scopes:[read?'secretary.read':'secretary.write']}]}));
export async function serviceStatus(env) {
 // Booleans only: whether secrets exist and match the owner settings, never their values.
 return {service:'AI秘書進度',daily_time:'09:00 Asia/Taipei',schedule_enabled:env.DAILY_ENABLED==='true',calendar_connected:!!env.CALENDAR_REFRESH_TOKEN,calendar_unresolved:(await env.DB.prepare("SELECT id,status,updated_at FROM calendar_proposals WHERE status IN ('applying','uncertain') ORDER BY updated_at DESC LIMIT 10").all()).results,mail_credentials_installed:!!(env.GMAIL_CLIENT_ID&&env.GMAIL_CLIENT_SECRET&&env.GMAIL_SMTP_REFRESH_TOKEN),mail_accounts_match_settings:env.GMAIL_SENDER===OWNER.sender&&env.GMAIL_RECIPIENT===OWNER.recipient,recipient:OWNER.recipient,sender:OWNER.sender,calendar:OWNER.calendar,supported_client:'Gmail App / Gmail web; Apple Mail only shows fallback',deliveries:(await env.DB.prepare('SELECT id,day,status,created_at,accepted_at,calendar_checked_at,error_code FROM digest_runs ORDER BY created_at DESC LIMIT 10').all()).results};
}
export async function callTool(name,args,env) {
 if(!args||typeof args!=='object'||Array.isArray(args)) throw Error('INVALID_ARGUMENTS');
 switch(name) {
 case 'list_calendar_events':return listCalendarEvents(env,args);
 case 'propose_calendar_change':return proposeCalendarChange(env,args);
 case 'confirm_calendar_change':return confirmCalendarChange(env,args);
 case 'list_steps':return {steps:await listSteps(env.DB,args.include_closed===true)};
 case 'get_step':return {step:await getStep(env.DB,args.id)};
 case 'create_step':return {step:await createStep(env.DB,args)};
 case 'update_step':return {step:await updateStep(env.DB,args)};
 case 'preview_daily_overview':return sendDigest(env,{preview:true});
 case 'get_service_status':return serviceStatus(env);
 default:throw Error('UNKNOWN_TOOL');
 }
}
export async function handleMcp(request,env) {
 // This connector is registered as OAuth-only. Challenge discovery requests too,
 // so the host establishes the connection before loading any private tools.
 const scopes=await authenticate(request,env);
 if(!scopes) return unauthorized();
 if(request.method==='GET'||request.method==='DELETE') return json({error:'method_not_allowed'},405);
 if(request.method!=='POST') return json({error:'method_not_allowed'},405);
 const raw=await request.text();if(raw.length>20000) return json({error:'request_too_large'},413);
 let input;try {input=JSON.parse(raw);} catch {return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},400);}
 if(input?.jsonrpc!=='2.0'||Array.isArray(input)) return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request'}},400);
 const respond=result=>json({jsonrpc:'2.0',id:input.id,result});
 if(input.method==='initialize') return respond({protocolVersion:'2025-03-26',capabilities:{tools:{listChanged:false}},serverInfo:{name:'ai-secretary-progress',version:'1.0.0'},instructions:`AI秘書共用進度是信內勾選、每日總覽及所有聊天的唯一進度來源。更新前讀取最新 revision/status；只有工具成功才說已保存。未知不等於未完成；已暫停活動不自動恢復。日曆工具只允許 ${OWNER.calendar}；先提出安排並顯示撞期，取得本人明確確認後才寫入並讀回。每天09:00由此服務寄一封，不另外建立重複排程。`});
 if(input.method==='notifications/initialized'||(!('id'in input)&&input.method?.startsWith('notifications/'))) return new Response(null,{status:202});
 if(input.method==='ping') return respond({});
 if(input.method==='tools/list') return respond({tools:mcpTools});
 if(input.method!=='tools/call') return json({jsonrpc:'2.0',id:input.id,error:{code:-32601,message:'Method not found'}});
 const spec=specs.find(t=>t.name===input.params?.name);if(!spec) return json({jsonrpc:'2.0',id:input.id,error:{code:-32602,message:'Unknown tool'}});
 if(!scopes.includes(spec.read?'secretary.read':'secretary.write')) return unauthorized();
 try {const value=await callTool(spec.name,input.params.arguments||{},env);return respond({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});}
 catch(error) {const code=/^[A-Z_]{1,60}$/.test(error.message)?error.message:'OPERATION_FAILED';return respond({content:[{type:'text',text:code}],isError:true});}
}
export async function handleAdmin(request,env,verifyToken) {
 if(request.method!=='POST') return json({error:'method_not_allowed'},405);
 const raw=await request.text();if(raw.length>100000) return json({error:'request_too_large'},413);
 const claims=await verifyToken((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.SIGNING_SECRET);
 if(!claims||claims.id!=='SECRETARY_ADMIN'||claims.rev!==1||claims.exp>Math.floor(Date.now()/1000)+600||claims.body_hash!==await hash(raw)) return unauthorized();
 try {
  const input=JSON.parse(raw);
  if(input.action==='tool') return json(await callTool(input.name,input.arguments||{},env));
  if(input.action==='send_validation') return json(await sendDigest(env,{validation:true}));
  if(input.action==='send_daily') return json(await sendDigest(env));
  if(input.action==='preview') return json(await sendDigest(env,{preview:true},{includeContent:true}));
  return json({error:'UNKNOWN_ACTION'},400);
 } catch(error) {return json({error:/^[A-Z_]{1,60}$/.test(error.message)?error.message:'OPERATION_FAILED'},400);}
}
