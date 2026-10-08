import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIXTURE, kitPath, kitImport, writeConfig, runTool} from './helpers.mjs';

const {offlineFetch} = await kitImport('tools', 'lib', 'offline-hooks.mjs');
const {localD1} = await kitImport('tools', 'lib', 'local-d1.mjs');
writeConfig(FIXTURE);
assert.equal(runTool('prepare.mjs', ['--disable-daily']).status, 0);
const {listCalendarEvents, proposeCalendarChange: propose, confirmCalendarChange: confirm} = await kitImport('work', 'app', 'secretary-calendar.mjs');
const {checkGrantScopes, GRANTS} = await kitImport('tools', 'lib', 'oauth-check.mjs');
const {mcpTools} = await kitImport('work', 'app', 'secretary-mcp.mjs');
const {DB, sqlite} = localD1(['schema.sql', 'production.sql'].map(f => readFileSync(kitPath('schema', f), 'utf8')));
const env = {DB, CALENDAR_REFRESH_TOKEN: 'fictional', GMAIL_CLIENT_ID: 'fictional', GMAIL_CLIENT_SECRET: 'fictional'};
const input = {operation: 'create', title: '安排準備時間', start: '2026-10-20T14:00:00+08:00', end: '2026-10-20T15:00:00+08:00'};
let items = [], stored = new Map(), writes = [], loseReply = false, denyPatch = false, readFails = false, extraPages = false, pauseWrite, writeStatus = 0, mismatch = false, nextPage = false, advanceClock = null;
function reset() {
  sqlite.exec('DELETE FROM calendar_proposals');
  items = []; stored = new Map(); writes = []; loseReply = false; denyPatch = false; readFails = false; extraPages = false; pauseWrite = null; writeStatus = 0; mismatch = false; nextPage = false; advanceClock = null;
}
globalThis.fetch = offlineFetch({
  'https://oauth2.googleapis.com/token': () => Response.json({access_token: 'fictional'}),
  'https://www.googleapis.com/calendar/v3/calendars/': async (url, options) => {
    const u = new URL(url), root = `/calendar/v3/calendars/${FIXTURE.calendar}/events`;
    const path = decodeURIComponent(u.pathname);
    assert.ok(path === root || path.startsWith(root + '/'), 'only the configured calendar');
    const id = path === root ? null : path.slice(root.length + 1);
    if (!options.method || options.method === 'GET') {
      if (readFails) return Response.json({error: 'fake'}, {status: 503});
      if (id) return stored.has(id) ? Response.json(stored.get(id)) : Response.json({}, {status: 404});
      assert.equal(u.searchParams.get('singleEvents'), 'true');
      if (advanceClock) advanceClock();
      const listed = [...items, ...stored.values()];
      return Response.json({items: nextPage && !u.searchParams.has('pageToken') ? [] : listed,
        ...(extraPages || (nextPage && !u.searchParams.has('pageToken')) ? {nextPageToken: 'more'} : {})});
    }
    writes.push({id, ...options});
    assert.equal(u.searchParams.get('sendUpdates'), 'none');
    if (pauseWrite) await pauseWrite;
    if (denyPatch) return Response.json({}, {status: 412});
    if (writeStatus) return Response.json({}, {status: writeStatus});
    const body = JSON.parse(options.body), old = stored.get(id) || {};
    if (options.method === 'PATCH') assert.equal(options.headers['If-Match'], old.etag);
    const value = {...old, ...body, id: id || body.id, etag: '"new-version"', status: 'confirmed'};
    if (options.method === 'PATCH') for (const field of ['start', 'end']) {
      value[field] = {...old[field], ...body[field]};
      for (const key of Object.keys(value[field])) if (value[field][key] === null) delete value[field][key];
      assert.notEqual(!!value[field].date, !!value[field].dateTime, 'Google time has exactly one representation');
    }
    if (mismatch) value.summary = 'Changed during readback';
    stored.set(value.id, value);
    if (loseReply) throw Error('NETWORK_REPLY_LOST');
    return Response.json(value);
  },
});

assert.equal(GRANTS.calendar.scope, 'https://www.googleapis.com/auth/calendar.events');
assert.throws(() => checkGrantScopes('calendar', {aud: 'client', scopes: ['https://www.googleapis.com/auth/calendar.events.readonly']}, 'client'));
assert.equal(mcpTools.find(t => t.name === 'confirm_calendar_change').annotations.readOnlyHint, false);
assert.equal(mcpTools.find(t => t.name === 'confirm_calendar_change').annotations.destructiveHint, true);
assert.equal(mcpTools.find(t => t.name === 'list_calendar_events').securitySchemes[0].scopes[0], 'secretary.read');
for (const bad of [{start: '2026-02-30'}, {end: input.start}, {start: '2026-10-20T14:00:00'}, {title: ''}, {start: '2026-10-20T14:00+08:00'}, {start: '2026-10-20T24:00:00+08:00'}, {calendar: 'attacker@mail.test'}, {event_id: 'unexpected'}]) {
  await assert.rejects(() => propose(env, {...input, ...bad}), /INVALID/);
}
await assert.rejects(() => propose({...env, CALENDAR_REFRESH_TOKEN: null}, input), /NOT_CONNECTED/);
assert.equal(writes.length, 0);

// Create: proposal has no external write; confirmation is mandatory; identical retries do not write twice.
let p = await propose(env, input);
assert.equal(p.written, false); assert.equal(writes.length, 0);
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: false}), /EXPLICIT_CONFIRMATION/);
let result = await confirm(env, {proposal_id: p.proposal_id, confirmed: true});
assert.equal(result.verified, true); assert.equal(writes.length, 1);
assert.equal((await confirm(env, {proposal_id: p.proposal_id, confirmed: true})).duplicate, true);
assert.equal(writes.length, 1);

// All-day conflicts block. Adjacent, transparent, declined and cancelled events do not block.
reset();
const event = (id, start, end, rest = {}) => ({id, summary: id, start: {dateTime: start}, end: {dateTime: end}, ...rest});
items = [
  {id: 'all-day', summary: '整天有事', start: {date: '2026-10-20'}, end: {date: '2026-10-21'}},
  event('adjacent', '2026-10-20T13:00:00+08:00', input.start),
  event('free', input.start, input.end, {transparency: 'transparent'}),
  event('declined', input.start, input.end, {attendees: [{self: true, responseStatus: 'declined'}]}),
  event('cancelled', input.start, input.end, {status: 'cancelled'}),
];
p = await propose(env, input);
assert.deepEqual(p.conflicts.map(e => e.id), ['all-day']);
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /CONFLICT_NEEDS_CONFIRMATION/);
assert.equal(writes.length, 0);
assert.equal((await confirm(env, {proposal_id: p.proposal_id, confirmed: true, allow_conflict: true})).written, true);

// A conflict appearing after the proposal invalidates the confirmation, even with allow_conflict.
reset(); p = await propose(env, input);
items = [event('new', input.start, input.end)];
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true, allow_conflict: true}), /CONFLICTS_CHANGED/);
assert.equal(writes.length, 0);
reset(); extraPages = true;
await assert.rejects(() => listCalendarEvents(env, {start: '2026-10-20', end: '2026-10-21'}), /INCOMPLETE/);
assert.equal(writes.length, 0);
reset(); readFails = true;
await assert.rejects(() => propose(env, input), /READ_FAILED/);
assert.equal(writes.length, 0);

// Reschedule preserves unrelated fields and original event id; stale versions never overwrite.
const existing = () => ({id: 'original', summary: '原本行程', start: {dateTime: input.start}, end: {dateTime: input.end}, etag: '"original-version"', organizer: {self: true}, description: '不要改這段', extendedProperties: {private: {keep: 'yes'}}});
reset(); stored.set('original', existing());
p = await propose(env, {...input, operation: 'update', event_id: 'original', start: '2026-10-20T16:00:00+08:00', end: '2026-10-20T17:00:00+08:00'});
result = await confirm(env, {proposal_id: p.proposal_id, confirmed: true});
assert.equal(result.event.id, 'original'); assert.equal(stored.size, 1);
assert.equal(stored.get('original').description, '不要改這段');
assert.equal(stored.get('original').extendedProperties.private.keep, 'yes');
reset(); stored.set('original', existing());
p = await propose(env, {...input, operation: 'update', event_id: 'original'});
stored.get('original').etag = '"modified-elsewhere"';
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /EVENT_CHANGED/);
assert.equal(writes.length, 0);
reset(); stored.set('original', existing());
p = await propose(env, {...input, operation: 'update', event_id: 'original'}); denyPatch = true;
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /EVENT_CHANGED/);
assert.equal(stored.get('original').etag, '"original-version"');
reset(); stored.set('original', {...existing(), attendees: [{email: 'attacker@mail.test'}]});
await assert.rejects(() => propose(env, {...input, operation: 'update', event_id: 'original'}), /USE_GOOGLE/);

// Lost successful response: reconciliation reads the stable event id and marker, without another write.
reset(); p = await propose(env, input); loseReply = true;
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /RESULT_UNCERTAIN/);
loseReply = false;
assert.equal((await confirm(env, {proposal_id: p.proposal_id, confirmed: true})).verified, true);
assert.equal(writes.length, 1); assert.equal(stored.size, 1);
reset(); p = await propose(env, input); loseReply = true;
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /RESULT_UNCERTAIN/);
stored.clear(); loseReply = false;
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /RESULT_UNCERTAIN/);
assert.equal(writes.length, 1);

// Simultaneous confirmations cannot bypass the final conflict check by writing concurrently.
reset(); p = await propose(env, input);
const p2 = await propose(env, input); let release;
pauseWrite = new Promise(resolve => { release = resolve; });
const first = confirm(env, {proposal_id: p.proposal_id, confirmed: true});
await new Promise(resolve => setImmediate(resolve));
await assert.rejects(() => confirm(env, {proposal_id: p2.proposal_id, confirmed: true}), /BUSY/);
release(); await first; assert.equal(writes.length, 1);
await assert.rejects(() => confirm(env, {proposal_id: p2.proposal_id, confirmed: true}), /CONFLICTS_CHANGED/);
assert.equal(writes.length, 1);
reset(); p = await propose(env, input);
sqlite.prepare('UPDATE calendar_proposals SET expires=0 WHERE id=?').run(p.proposal_id);
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /EXPIRED/);
assert.equal(writes.length, 0);
// Actual Google omission semantics: absent organizer.self is false, never permission to edit.
reset(); stored.set('original', {...existing(), organizer: {email: FIXTURE.sender}, attendees: [{self: true}]});
await assert.rejects(() => propose(env, {...input, operation: 'update', event_id: 'original'}), /USE_GOOGLE/);
reset(); stored.set('original', {...existing(), recurrence: ['RRULE:FREQ=DAILY']});
await assert.rejects(() => propose(env, {...input, operation: 'update', event_id: 'original'}), /USE_GOOGLE/);
reset(); stored.set('original', {...existing(), recurringEventId: 'series', originalStartTime: {dateTime: input.start}});
p = await propose(env, {...input, operation: 'update', event_id: 'original'});
assert.equal((await confirm(env, {proposal_id: p.proposal_id, confirmed: true})).event.id, 'original');
reset(); items = [event('instance', input.start, input.end, {recurringEventId: 'series'})]; nextPage = true;
p = await propose(env, input); assert.deepEqual(p.conflicts.map(e => e.id), ['instance']);

// Google PATCH merges subobjects: clear the unused representation explicitly.
for (const toAllDay of [false, true]) {
  reset(); const old = existing();
  if (!toAllDay) {old.start = {date: '2026-10-20'}; old.end = {date: '2026-10-21'};}
  stored.set('original', old);
  p = await propose(env, {...input, operation: 'update', event_id: 'original',
    ...(toAllDay ? {start: '2026-10-20', end: '2026-10-21'} : {})});
  assert.equal((await confirm(env, {proposal_id: p.proposal_id, confirmed: true})).event.all_day, toAllDay);
}
reset(); stored.set('original', {...existing(), start: {dateTime: input.start, timeZone: 'America/New_York'}});
p = await propose(env, {...input, operation: 'update', event_id: 'original'});
await confirm(env, {proposal_id: p.proposal_id, confirmed: true});
assert.equal(stored.get('original').start.timeZone, 'America/New_York');

for (const status of [400, 403, 409, 500, 503]) {
  reset(); p = await propose(env, input); writeStatus = status;
  await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}));
  const state = sqlite.prepare('SELECT status FROM calendar_proposals WHERE id=?').get(p.proposal_id).status;
  assert.equal(state, status >= 500 ? 'uncertain' : 'review');
  writeStatus = 0;
  await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}));
  assert.equal(writes.length, 1);
}
reset(); p = await propose(env, input); mismatch = true;
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /RESULT_UNCERTAIN/);
assert.equal(writes.length, 1);

// A stalled pre-write check has an overall 90-second deadline, before the 120-second recovery threshold.
reset(); p = await propose(env, input);
const realNow = Date.now; let clock = realNow(); Date.now = () => clock;
try {
  advanceClock = () => { clock += 91000; };
  await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /CHECK_TIMEOUT/);
  assert.equal(writes.length, 0);
} finally { Date.now = realNow; }
reset(); p = await propose(env, input);
sqlite.prepare("UPDATE calendar_proposals SET status='applying',updated_at=? WHERE id=?").run(Date.now() - 130000, p.proposal_id);
await assert.rejects(() => confirm(env, {proposal_id: p.proposal_id, confirmed: true}), /RESULT_UNCERTAIN/);
assert.equal(writes.length, 0);
sqlite.close();
console.log('PASS t10: 指定日曆、提案不寫入、明確確認、全天/循環實例/透明/拒絕行程、撞期重查、版本保護、保留其他欄位、寫後讀回、遺失回覆不重寫、同時寫入隔離、過期與唯讀舊授權拒絕（全程離線）。');
