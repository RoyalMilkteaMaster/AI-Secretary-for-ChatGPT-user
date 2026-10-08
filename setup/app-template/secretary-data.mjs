export const taskColumns='s.id,s.title,s.status,s.revision,s.completed_at,d.activity,d.priority,d.due_at,d.not_before,d.source_chat,d.detail,d.kind,d.paused,d.updated_at';
const idPattern=/^[A-Za-z0-9_-]{1,80}$/;
const chatPattern=/^https:\/\/chatgpt\.com\/(?:g\/[a-zA-Z0-9_-]+\/)?c\/[a-zA-Z0-9-]+$/;
const iso=value=>value===null||(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value)));
const checkText=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value);
function details(input) {
 if(!checkText(input.activity,200)||!input.activity.trim()||!['normal','urgent'].includes(input.priority)||!iso(input.due_at)||!iso(input.not_before)||!checkText(input.detail,1500)||!checkText(input.source_chat,300)||(input.source_chat&&!chatPattern.test(input.source_chat))||!['task','test'].includes(input.kind)) throw Error('INVALID_FIELDS');
 if(input.paused!==undefined&&![true,false,0,1].includes(input.paused)) throw Error('INVALID_FIELDS');
 return [input.activity,input.priority,input.due_at,input.not_before,input.source_chat,input.detail,input.kind,input.paused?1:0];
}
export async function listSteps(db,includeClosed=false) {
 return (await db.prepare(`SELECT ${taskColumns} FROM steps s JOIN step_details d ON d.step_id=s.id ${includeClosed?'':"WHERE s.status IN ('pending','unknown')"} ORDER BY COALESCE(d.due_at,'9999'),d.activity,s.id LIMIT 500`).all()).results;
}
export async function getStep(db,id) {return db.prepare(`SELECT ${taskColumns} FROM steps s JOIN step_details d ON d.step_id=s.id WHERE s.id=?`).bind(id).first();}
export async function createStep(db,input) {
 if(!idPattern.test(input.id)||!checkText(input.title,500)||!input.title.trim()||!['pending','unknown'].includes(input.status)) throw Error('INVALID_FIELDS');
 const values=details(input),at=new Date().toISOString();
 const existing=await db.prepare('SELECT id,title FROM steps WHERE id=?').bind(input.id).first();
 if(existing&&existing.title!==input.title) throw Error('ID_ALREADY_EXISTS_READ_FIRST');
 // INSERT OR IGNORE makes a retry idempotent. Never overwrites an existing task.
 await db.batch([
  db.prepare('INSERT INTO steps(id,title,status,revision) VALUES (?,?,?,1) ON CONFLICT(id) DO NOTHING').bind(input.id,input.title,input.status),
  db.prepare('INSERT INTO step_details(step_id,activity,priority,due_at,not_before,source_chat,detail,kind,paused,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(step_id) DO NOTHING').bind(input.id,...values,at)
 ]);
 const saved=await getStep(db,input.id);
 if(saved.title!==input.title) throw Error('ID_ALREADY_EXISTS_READ_FIRST');
 return saved;
}
export async function updateStep(db,input) {
 if(!idPattern.test(input.id)||!Number.isSafeInteger(input.expected_revision)||!['pending','unknown','completed','cancelled'].includes(input.expected_status)) throw Error('INVALID_FIELDS');
 const before=await getStep(db,input.id);if(!before) throw Error('NOT_FOUND');
 if(before.revision!==input.expected_revision||before.status!==input.expected_status) throw Error('CONFLICT_READ_LATEST');
 if(!input.patch||typeof input.patch!=='object'||Array.isArray(input.patch)||Object.keys(input.patch).some(k=>!['title','status','activity','priority','due_at','not_before','source_chat','detail','paused'].includes(k))) throw Error('INVALID_FIELDS');
 const after={...before,...input.patch};
 if(!checkText(after.title,500)||!after.title.trim()||!['pending','unknown','completed','cancelled'].includes(after.status)) throw Error('INVALID_FIELDS');
 if(['completed','cancelled'].includes(before.status)&&['pending','unknown'].includes(after.status)&&input.reopen!==true) throw Error('EXPLICIT_REOPEN_REQUIRED');
 const values=details(after),at=new Date().toISOString();
 // Completing the same step must remain visible in old email. Revisions change
 // for edits/reopening, while completion is guarded by the expected status.
 const nextRevision=after.status==='completed'?before.revision:before.revision+1;
 // Both status and revision guard against a concurrent email checkbox. The
 // details update only matches the revision produced by this transaction.
 const results=await db.batch([
  db.prepare('UPDATE steps SET title=?,status=?,revision=?,completed_at=? WHERE id=? AND revision=? AND status=? RETURNING id').bind(after.title,after.status,nextRevision,after.status==='completed'?(before.completed_at||at):null,input.id,input.expected_revision,input.expected_status),
  db.prepare('UPDATE step_details SET activity=?,priority=?,due_at=?,not_before=?,source_chat=?,detail=?,kind=?,paused=?,updated_at=? WHERE step_id=? AND changes()=1 AND EXISTS (SELECT 1 FROM steps WHERE id=? AND revision=? AND status=? AND title=?)').bind(...values,at,input.id,input.id,nextRevision,after.status,after.title)
 ]);
 if(!results[0].results?.length) throw Error('CONFLICT_READ_LATEST');
 return getStep(db,input.id);
}
export function localDay(time=Date.now()) {return new Date(Number(time)+8*3600000).toISOString().slice(0,10);}
export function category(item,time) {
 const due=item.due_at?Date.parse(item.due_at):Infinity;
 if(item.priority==='urgent'||due<=time+3*86400000) return '急件';
 if(due<=time+14*86400000) return '近期截止';
 return '一般待辦';
}
export async function digestSteps(db,time=Date.now()) {
 return (await listSteps(db)).filter(x=>x.kind==='task'&&!x.paused&&(!x.not_before||Date.parse(x.not_before)<=time));
}
