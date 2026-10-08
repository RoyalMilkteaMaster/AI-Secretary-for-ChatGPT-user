import {OWNER} from './owner-config.mjs';

const ZONE = 'Asia/Taipei';
const TTL = 15 * 60 * 1000;
const base = () => 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(OWNER.calendar) + '/events';
const fail = code => { throw Error(code); };
const eventId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,1024}$/.test(id) ? id : fail('INVALID_EVENT_ID');
function fields(args, allowed) {
  if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(k => !allowed.includes(k))) fail('INVALID_ARGUMENTS');
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d))?$/.test(value)) fail('INVALID_CALENDAR_TIME');
  const date = Date.parse(value.slice(0, 10) + 'T00:00:00Z');
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== value.slice(0, 10)) fail('INVALID_CALENDAR_TIME');
  const n = Date.parse(value.length === 10 ? value + 'T00:00:00+08:00' : value);
  if (!Number.isFinite(n)) fail('INVALID_CALENDAR_TIME');
  return n;
}
function interval(start, end) {
  const lo = instant(start), hi = instant(end);
  if ((start.length === 10) !== (end.length === 10) || hi <= lo || hi - lo > 31 * 86400000) fail('INVALID_CALENDAR_RANGE');
  return [lo, hi];
}
const googleTime = (value, zone = ZONE, patch = false) => value.length === 10
  ? {date: value, ...(patch ? {dateTime: null, timeZone: null} : {})}
  : {dateTime: value, timeZone: zone, ...(patch ? {date: null} : {})};
function summary(e) {
  return {id: e.id, title: e.summary || '未命名行程', location: e.location || '', start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date, all_day: !!e.start?.date,
    busy: e.transparency !== 'transparent' && !e.attendees?.some(a => a.self && a.responseStatus === 'declined')};
}
async function credential(env) {
  if (!OWNER.configured || !OWNER.calendar) fail('CALENDAR_NOT_CONFIGURED');
  if (!env.CALENDAR_REFRESH_TOKEN) fail('CALENDAR_NOT_CONNECTED');
  const r = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'refresh_token', client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.CALENDAR_REFRESH_TOKEN}), signal: AbortSignal.timeout(15000)});
  if (!r.ok) fail('CALENDAR_AUTH_FAILED');
  const data = await r.json();
  if (typeof data.access_token !== 'string' || !data.access_token) fail('CALENDAR_AUTH_FAILED');
  return data.access_token;
}
async function request(token, path = '', init = {}) {
  const remaining = typeof token === 'object' ? token.deadline - Date.now() : 15000;
  if (remaining <= 0) fail('CALENDAR_CHECK_TIMEOUT');
  return fetch(base() + path, {...init, headers: {Authorization: 'Bearer ' + (token.value || token), ...init.headers}, signal: AbortSignal.timeout(Math.min(15000, remaining))});
}
async function get(token, id) {
  const r = await request(token, '/' + encodeURIComponent(eventId(id)));
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) fail('CALENDAR_READ_FAILED');
  const data = await r.json();
  return data.status === 'cancelled' ? null : data;
}
async function events(token, start, end) {
  const [lo, hi] = interval(start, end), found = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({timeMin: start.length === 10 ? start + 'T00:00:00+08:00' : start,
      timeMax: new Date(hi).toISOString(), timeZone: ZONE, singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      fields: 'items(id,summary,location,start,end,status,transparency,attendees(self,responseStatus)),nextPageToken', ...(pageToken ? {pageToken} : {})});
    const r = await request(token, '?' + params);
    if (!r.ok) fail('CALENDAR_READ_FAILED');
    const data = await r.json();
    if (!Array.isArray(data.items || [])) fail('CALENDAR_READ_FAILED');
    for (const e of data.items || []) {
      if (e.status === 'cancelled') continue;
      const value = summary(e);
      if (instant(value.start) < hi && instant(value.end) > lo) found.push(value);
    }
    pageToken = data.nextPageToken || '';
    if (!pageToken) return found;
  }
  fail('CALENDAR_INCOMPLETE');
}
export async function listCalendarEvents(env, args) {
  fields(args, ['start', 'end']);
  interval(args.start, args.end);
  return {calendar: OWNER.calendar, events: await events(await credential(env), args.start, args.end), checked_at: new Date().toISOString()};
}
export async function calendarForDay(env, day) {
  if (!env.CALENDAR_REFRESH_TOKEN) return {events: [], checked_at: null, warning: '今日行程尚未連接雲端日曆，不能視為今天沒有行程。'};
  instant(day);
  const tomorrow = new Date(instant(day) + 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  return {...await listCalendarEvents(env, {start: day, end: tomorrow}), warning: ''};
}
const conflicts = (items, id) => items.filter(e => e.id !== id && e.busy);
const fingerprint = items => JSON.stringify(items.map(e => [e.id, e.title, e.start, e.end]).sort((a, b) => a[0].localeCompare(b[0])));
function editable(e) {
  if (!e) fail('CALENDAR_EVENT_NOT_FOUND');
  if (!e.etag) fail('CALENDAR_VERSION_MISSING');
  // Invited meetings and recurring series need Google Calendar's own participant/series UI.
  if (e.recurrence || e.organizer?.self !== true || e.attendees?.some(a => !a.self) || (e.eventType && e.eventType !== 'default')) fail('CALENDAR_USE_GOOGLE_FOR_THIS_EVENT');
}
export async function proposeCalendarChange(env, args) {
  fields(args, ['operation', 'event_id', 'title', 'start', 'end', 'location', 'description']);
  if (!['create', 'update'].includes(args.operation) || typeof args.title !== 'string' || !args.title.trim() || args.title.length > 300) fail('INVALID_ARGUMENTS');
  const details = {};
  for (const [key, limit] of [['location', 500], ['description', 4000]]) {
    if (args[key] === undefined) continue;
    if (typeof args[key] !== 'string' || args[key].length > limit) fail('INVALID_ARGUMENTS');
    details[key] = args[key].trim();
  }
  interval(args.start, args.end);
  if (args.operation === 'create' && args.event_id !== undefined) fail('INVALID_ARGUMENTS');
  if (args.operation === 'update') eventId(args.event_id);
  const token = await credential(env);
  const old = args.operation === 'update' ? await get(token, args.event_id) : null;
  if (args.operation === 'update') editable(old);
  const proposal_id = 's' + crypto.randomUUID().replaceAll('-', '');
  const event_id = old?.id || proposal_id;
  const clashes = conflicts(await events(token, args.start, args.end), event_id);
  const payload = {operation: args.operation, event_id, title: args.title.trim(), start: args.start, end: args.end, details,
    etag: old?.etag || null, before: old ? summary(old) : null, conflicts: clashes,
    private_properties: old?.extendedProperties?.private || {}, start_zone: old?.start?.timeZone || ZONE, end_zone: old?.end?.timeZone || ZONE};
  const expires_at = Date.now() + TTL;
  await env.DB.prepare("INSERT INTO calendar_proposals(id,payload,status,expires,updated_at) VALUES (?,?,'pending',?,?)")
    .bind(proposal_id, JSON.stringify(payload), expires_at, Date.now()).run();
  return {proposal_id, operation: payload.operation, calendar: OWNER.calendar, event: {id: event_id, title: payload.title, start: args.start, end: args.end,
    location: details.location ?? old?.location ?? '', description: details.description ?? old?.description ?? ''},
    before: payload.before, conflicts: clashes, expires_at: new Date(expires_at).toISOString(), written: false,
    next: '請向本人展示這個日期、時間、標題與撞期結果，取得明確確認後才呼叫 confirm_calendar_change；撞期時先建議其他時間。'};
}
function matches(e, p, id) {
  return !!e && e.id === p.event_id && e.summary === p.title && e.extendedProperties?.private?.secretary_proposal === id &&
    instant(e.start?.dateTime || e.start?.date) === instant(p.start) && instant(e.end?.dateTime || e.end?.date) === instant(p.end) &&
    Object.entries(p.details || {}).every(([key, value]) => (e[key] || '') === value);
}
async function recordSuccess(env, id, e) {
  const result = {written: true, verified: true, event: summary(e), calendar: OWNER.calendar, verified_at: new Date().toISOString()};
  await env.DB.prepare("UPDATE calendar_proposals SET status='committed',result=?,updated_at=? WHERE id=?").bind(JSON.stringify(result), Date.now(), id).run();
  return result;
}
export async function confirmCalendarChange(env, args) {
  fields(args, ['proposal_id', 'confirmed', 'allow_conflict']);
  if (args.confirmed !== true) fail('EXPLICIT_CONFIRMATION_REQUIRED');
  if (args.allow_conflict !== undefined && typeof args.allow_conflict !== 'boolean') fail('INVALID_ARGUMENTS');
  if (typeof args.proposal_id !== 'string' || !/^s[0-9a-f]{32}$/.test(args.proposal_id)) fail('INVALID_PROPOSAL');
  const row = await env.DB.prepare('SELECT * FROM calendar_proposals WHERE id=?').bind(args.proposal_id).first();
  if (!row) fail('PROPOSAL_NOT_FOUND');
  if (row.status === 'committed') return {...JSON.parse(row.result), duplicate: true};
  const p = JSON.parse(row.payload);
  const token = {value: await credential(env), deadline: Date.now() + 90000};
  if (row.status === 'uncertain' || row.status === 'applying') {
    if (row.status === 'applying' && Date.now() - row.updated_at < 120000) fail('CALENDAR_BUSY');
    const actual = await get(token, p.event_id);
    if (matches(actual, p, row.id)) return recordSuccess(env, row.id, actual);
    // Never repeat a write with an unknown result. A read-back is the only automatic recovery.
    await env.DB.prepare("UPDATE calendar_proposals SET status='uncertain' WHERE id=? AND status='applying'").bind(row.id).run();
    fail('CALENDAR_RESULT_UNCERTAIN_CHECK_GOOGLE');
  }
  if (row.status !== 'pending') fail('PROPOSAL_NEEDS_REVIEW');
  if (row.expires <= Date.now()) fail('PROPOSAL_EXPIRED');
  if (p.conflicts.length && args.allow_conflict !== true) fail('CALENDAR_CONFLICT_NEEDS_CONFIRMATION');
  // One write at a time across proposals, including the final conflict check.
  let claimed;
  try {
    claimed = await env.DB.prepare("UPDATE calendar_proposals SET status='applying',updated_at=? WHERE id=? AND status='pending' AND NOT EXISTS (SELECT 1 FROM calendar_proposals WHERE status='applying') RETURNING id")
      .bind(Date.now(), row.id).first();
  } catch { fail('CALENDAR_BUSY'); }
  if (!claimed) fail('CALENDAR_BUSY');
  let writing = false;
  try {
    if (p.operation === 'update') {
      const current = await get(token, p.event_id);
      editable(current);
      if (current.etag !== p.etag) fail('CALENDAR_EVENT_CHANGED');
    }
    const clashes = conflicts(await events(token, p.start, p.end), p.event_id);
    if (fingerprint(clashes) !== fingerprint(p.conflicts)) fail('CALENDAR_CONFLICTS_CHANGED');
    const patch = p.operation === 'update';
    const body = {summary: p.title, ...p.details, start: googleTime(p.start, p.start_zone, patch), end: googleTime(p.end, p.end_zone, patch),
      extendedProperties: {private: {...p.private_properties, secretary_proposal: row.id}}, ...(p.operation === 'create' ? {id: p.event_id} : {})};
    if (Date.now() >= token.deadline) fail('CALENDAR_CHECK_TIMEOUT');
    const held = await env.DB.prepare("UPDATE calendar_proposals SET updated_at=? WHERE id=? AND status='applying' RETURNING id").bind(Date.now(), row.id).first();
    if (!held) fail('CALENDAR_BUSY');
    writing = true;
    const r = await request(token, (p.operation === 'update' ? '/' + encodeURIComponent(p.event_id) : '') + '?sendUpdates=none', {
      method: p.operation === 'update' ? 'PATCH' : 'POST',
      headers: {'Content-Type': 'application/json', ...(p.operation === 'update' ? {'If-Match': p.etag} : {})}, body: JSON.stringify(body)});
    if (r.status === 412 || r.status === 409) {
      writing = false;
      fail(r.status === 412 ? 'CALENDAR_EVENT_CHANGED' : 'CALENDAR_EVENT_ID_CONFLICT');
    }
    if (!r.ok) {
      if (r.status >= 400 && r.status < 500 && ![408, 429].includes(r.status)) writing = false;
      fail(r.status === 403 ? 'CALENDAR_WRITE_PERMISSION_REQUIRED' : 'CALENDAR_WRITE_FAILED');
    }
    const actual = await get(token, p.event_id);
    if (!matches(actual, p, row.id)) fail('CALENDAR_READBACK_MISMATCH');
    return await recordSuccess(env, row.id, actual);
  } catch (error) {
    await env.DB.prepare('UPDATE calendar_proposals SET status=?,updated_at=? WHERE id=? AND status=\'applying\'')
      .bind(writing ? 'uncertain' : 'review', Date.now(), row.id).run();
    if (writing) fail('CALENDAR_RESULT_UNCERTAIN_CHECK_GOOGLE');
    throw error;
  }
}
