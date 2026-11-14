// Owner 14/11/2026 ("nối luôn vào logic chấm bài tự động đi"): put a new KIDS class into the grader's locked class list by copying
// the entries of an existing class of the same book and cluster (KIDS 40 from KIDS 39). Runs only on the trusted runner with
// PRIVATE_BUNDLE_KEY. Nothing secret is printed: the job log shows counts only; the detailed report goes to the private tab
// 'CLASS ADD' of the first control workbook. Request file: class-requests/<name>.request
//   {"mode":"inspect"|"apply","from":"KIDS 39","to":"KIDS 40","trackerTitle":"KIDS 40_ THEO DÕI TOÀN DIỆN"}
// inspect: lists every place of the bundle that names the source class (or its tracker) and the tracker found for the new class.
// apply:   for every list holding an entry of the source class, adds the same entry for the new class (class name and tracker id
//          swapped), unless the new class is already there; then re-locks the bundle and checks it opens again.
import fs from 'node:fs';
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const repository = 'mstrangtrieueducation-droid/kids-grader-runner';
const SKIP = new Set(['barem', 'references', 'nonStudentAudioRegistry']);

export function decryptBytes(bytes, key, repo = repository) {
  if (bytes.subarray(0, 4).toString() !== 'GB01') throw Error('PRIVATE_BUNDLE_SCHEMA_INVALID');
  const d = createDecipheriv('aes-256-gcm', key, bytes.subarray(4, 16)); d.setAAD(Buffer.from(repo)); d.setAuthTag(bytes.subarray(16, 32));
  return JSON.parse(gunzipSync(Buffer.concat([d.update(bytes.subarray(32)), d.final()])).toString('utf8'));
}
export function encryptBundle(bundle, key, repo = repository) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(repo));
  const data = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'))), c.final()]);
  return Buffer.concat([Buffer.from('GB01'), iv, c.getAuthTag(), data]);
}
const norm = v => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toUpperCase();

// Every place (path) where the source class is named or its tracker id appears, outside the barem and references.
export function occurrences(bundle, fromName, fromId) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'string') { if (norm(v) === norm(fromName) || (fromId && v.includes(fromId))) out.push({ path, kind: norm(v) === norm(fromName) ? 'name' : 'tracker', value: v.length > 80 ? v.slice(0, 80) + '…' : v }); return; }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path + '[' + i + ']')); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (path === '' && SKIP.has(k)) continue;
      if (norm(k) === norm(fromName)) out.push({ path: path + '.' + k, kind: 'key', value: '' });
      walk(x, path + '.' + k);
    }
  };
  walk(bundle, '');
  return out;
}
// The source class's copy for the new class: names and tracker id swapped, everything else the same.
export function cloneFor(entry, { fromName, toName, fromId, toId, fromNumber, toNumber }) {
  const map = v => {
    if (typeof v === 'string') {
      if (norm(v) === norm(fromName)) return toName;
      let s = fromId && toId ? v.split(fromId).join(toId) : v;
      if (s.includes(fromName)) s = s.split(fromName).join(toName);
      return s;
    }
    if (Array.isArray(v)) return v.map(map);
    if (v && typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[norm(k) === norm(fromName) ? toName : k] = /^(classNumber|number|classNo)$/.test(k) && x === fromNumber ? toNumber : map(x);
      return o;
    }
    return v;
  };
  return map(entry);
}
const belongs = (x, fromName, fromId) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).some(v => typeof v === 'string' && (norm(v) === norm(fromName) || (fromId && v === fromId)));
const isTo = (x, toName, toId) => x && typeof x === 'object' && !Array.isArray(x) && Object.values(x).some(v => typeof v === 'string' && (norm(v) === norm(toName) || (toId && v === toId)));
// Adds the new class wherever the source class has an entry. Returns the list of changes.
export function addClass(bundle, o) {
  const changes = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) {
      const names = v.filter(x => typeof x === 'string');
      if (names.some(x => norm(x) === norm(o.fromName)) && !names.some(x => norm(x) === norm(o.toName))) {
        v.splice(v.findIndex(x => typeof x === 'string' && norm(x) === norm(o.fromName)) + 1, 0, o.toName); changes.push({ path, kind: 'name-list' });
      }
      const src = v.filter(x => belongs(x, o.fromName, o.fromId));
      if (src.length && !v.some(x => isTo(x, o.toName, o.toId))) {
        const at = v.indexOf(src[src.length - 1]);
        const copies = src.map(x => cloneFor(x, o));
        v.splice(at + 1, 0, ...copies); changes.push({ path, kind: 'entry', count: copies.length });
      }
      v.forEach((x, i) => { if (!isTo(x, o.toName, o.toId)) walk(x, path + '[' + i + ']'); });
      return;
    }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v), fromKey = keys.find(k => norm(k) === norm(o.fromName));
      if (fromKey && !keys.some(k => norm(k) === norm(o.toName))) { v[o.toName] = cloneFor(v[fromKey], o); changes.push({ path: path + '.' + fromKey, kind: 'keyed' }); }
      for (const k of keys) { if (path === '' && SKIP.has(k)) continue; walk(v[k], path + '.' + k); }
    }
  };
  walk(bundle, '');
  return changes;
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') throw Error('TRUSTED_RUNNER_REQUIRED');
  const files = fs.readdirSync('class-requests').filter(f => f.endsWith('.request')).sort();
  const request = JSON.parse(fs.readFileSync('class-requests/' + files[files.length - 1], 'utf8'));
  const key = Buffer.from(process.env.PRIVATE_BUNDLE_KEY || '', 'base64');
  const bundle = decryptBytes(fs.readFileSync('approved-policy.enc'), key);
  const { Google } = await import('./google-adapter.mjs');
  const g = new Google(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  const clusters = bundle.config.clusters || [];
  const fromEntry = clusters.flatMap(c => c.classes || []).find(c => norm(c.className) === norm(request.from));
  if (!fromEntry) throw Error('SOURCE_CLASS_NOT_IN_BUNDLE');
  // The new class's tracker: the one spreadsheet with that exact title that this account can open.
  const q = "name = '" + request.trackerTitle.replace(/'/g, "\\'") + "' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false";
  const found = g.api('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true').files || [];
  const report = [['Cập nhật', new Date().toISOString(), 'mode', request.mode], ['from', request.from, 'to', request.to], ['tracker title', request.trackerTitle, 'found', found.length]];
  const write = rows => {
    const control = clusters[0].controlId, tab = 'CLASS ADD';
    const meta = g.api('https://sheets.googleapis.com/v4/spreadsheets/' + control + '?fields=sheets.properties.title');
    if (!meta.sheets.some(s => s.properties.title === tab)) g.api('https://sheets.googleapis.com/v4/spreadsheets/' + control + ':batchUpdate', 'POST', { requests: [{ addSheet: { properties: { title: tab, gridProperties: { rowCount: 300, columnCount: 4 } } } }] });
    g.api('https://sheets.googleapis.com/v4/spreadsheets/' + control + '/values/' + encodeURIComponent("'" + tab + "'!A1:D300") + ':clear', 'POST', {});
    g.api('https://sheets.googleapis.com/v4/spreadsheets/' + control + '/values/' + encodeURIComponent("'" + tab + "'!A1") + '?valueInputOption=RAW', 'PUT', { values: rows.map(r => r.map(x => String(x ?? '').slice(0, 45000))) });
  };
  if (found.length !== 1) { report.push(['STOP', 'TRACKER_NOT_UNIQUE', '', '']); write(report); throw Error('TRACKER_NOT_UNIQUE'); }
  const toId = found[0].id, fromId = fromEntry.spreadsheetId;
  const sheets = g.api('https://sheets.googleapis.com/v4/spreadsheets/' + toId + '?fields=sheets.properties.title').sheets.map(s => s.properties.title);
  const wantSheet = fromEntry.sheetName;
  report.push(['tracker tabs', sheets.join(' | '), 'needs tab', wantSheet || '(none)']);
  if (wantSheet && !sheets.includes(wantSheet)) { report.push(['STOP', 'TRACKER_TAB_MISSING', wantSheet, '']); write(report); throw Error('TRACKER_TAB_MISSING'); }
  const o = { fromName: request.from, toName: request.to, fromId, toId, fromNumber: Number(String(request.from).match(/\d+/)[0]), toNumber: Number(String(request.to).match(/\d+/)[0]) };
  clusters.forEach((c, i) => report.push(['cluster ' + i, c.controlId, (c.classes || []).map(x => x.className).join(', '), '']));
  report.push(['source entry', JSON.stringify(fromEntry), '', '']);
  const before = occurrences(bundle, request.from, fromId), already = occurrences(bundle, request.to, toId);
  report.push(['places naming ' + request.from, before.length, request.to + ' already', already.length]);
  for (const x of before) report.push(['  ' + x.kind, x.path, x.value, '']);
  for (const x of already) report.push(['  already ' + x.kind, x.path, x.value, '']);
  if (request.mode === 'apply') {
    const changes = addClass(bundle, o);
    for (const c of changes) report.push(['ADDED ' + c.kind, c.path, c.count || '', '']);
    const after = occurrences(bundle, request.to, toId);
    report.push(['places naming ' + request.to + ' now', after.length, 'source places', before.length]);
    const added = bundle.config.clusters.flatMap(c => c.classes || []).find(c => norm(c.className) === norm(request.to));
    if (!added || added.spreadsheetId !== toId) { report.push(['STOP', 'NEW_ENTRY_INVALID', '', '']); write(report); throw Error('NEW_ENTRY_INVALID'); }
    report.push(['new entry', JSON.stringify(added), '', '']);
    if (changes.length) {
      const bytes = encryptBundle(bundle, key), back = decryptBytes(bytes, key);
      if (JSON.stringify(back) !== JSON.stringify(bundle)) throw Error('BUNDLE_ROUND_TRIP_FAILED');
      fs.writeFileSync('approved-policy.enc', bytes); report.push(['bundle', 'WRITTEN', '', '']);
    } else report.push(['bundle', 'UNCHANGED (already there)', '', '']);
  }
  write(report);
  console.log(JSON.stringify({ mode: request.mode, trackerFound: found.length, sourcePlaces: before.length, alreadyPlaces: already.length }));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch(e => { console.error(e.message); process.exit(1); });
