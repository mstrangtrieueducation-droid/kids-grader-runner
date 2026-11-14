// Offline checks of class-add.mjs on a made-up bundle: no network, no real key.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { addClass, occurrences, cloneFor, encryptBundle, decryptBytes } from './class-add.mjs';
const A = 'TRACKER39xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', B = 'TRACKER40yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
const make = () => ({
  schema: 3,
  config: {
    clusters: [
      { controlId: 'C1', classes: [{ className: 'KIDS 21', spreadsheetId: 'T21', sheetName: 'THEO DÕI TOÀN DIỆN' }] },
      { controlId: 'C3', classes: [{ className: 'KIDS 38', spreadsheetId: 'T38', sheetName: 'THEO DÕI TOÀN DIỆN' }, { className: 'KIDS 39', spreadsheetId: A, sheetName: 'THEO DÕI', classNumber: 39, extra: { note: 'KIDS 39 phonics', link: 'https://docs.google.com/spreadsheets/d/' + A } }] }
    ],
    nativeConfig: { classes: [{ cls: 'KIDS 39', tracker: A, tabs: ['PHONICS 1–4'] }], allowed: ['KIDS 38', 'KIDS 39'] },
    kids: { model: 'm' }
  },
  barem: { entries: [{ code: 'X', note: 'KIDS 39' }] }
});
const o = { fromName: 'KIDS 39', toName: 'KIDS 40', fromId: A, toId: B, fromNumber: 39, toNumber: 40 };
let pass = 0; const t = (name, f) => { f(); pass++; console.log('  ✓ ' + name); };

t('finds every place naming KIDS 39 or its tracker, skipping the barem', () => {
  const occ = occurrences(make(), 'KIDS 39', A);
  assert.equal(occ.filter(x => x.path.startsWith('.barem')).length, 0);
  assert.ok(occ.length >= 6, JSON.stringify(occ));
});
t('copies the KIDS 39 entry for KIDS 40 with name, number and tracker swapped; nothing else changes', () => {
  const c = cloneFor(make().config.clusters[1].classes[1], o);
  assert.deepEqual(c, { className: 'KIDS 40', spreadsheetId: B, sheetName: 'THEO DÕI', classNumber: 40, extra: { note: 'KIDS 40 phonics', link: 'https://docs.google.com/spreadsheets/d/' + B } });
});
t('adds KIDS 40 to the cluster of KIDS 39, right after it, and to every other list naming KIDS 39', () => {
  const b = make(), ch = addClass(b, o);
  assert.deepEqual(b.config.clusters[1].classes.map(x => x.className), ['KIDS 38', 'KIDS 39', 'KIDS 40']);
  assert.deepEqual(b.config.clusters[0].classes.map(x => x.className), ['KIDS 21']);
  assert.deepEqual(b.config.nativeConfig.classes.map(x => x.cls), ['KIDS 39', 'KIDS 40']);
  assert.equal(b.config.nativeConfig.classes[1].tracker, B);
  assert.deepEqual(b.config.nativeConfig.allowed, ['KIDS 38', 'KIDS 39', 'KIDS 40']);
  assert.equal(b.barem.entries[0].note, 'KIDS 39', 'barem untouched');
  assert.equal(b.config.clusters[1].classes[1].spreadsheetId, A, 'KIDS 39 untouched');
  assert.ok(ch.length >= 3, JSON.stringify(ch));
});
t('running it twice adds nothing more', () => {
  const b = make(); addClass(b, o); const once = JSON.stringify(b); const ch = addClass(b, o);
  assert.equal(ch.length, 0); assert.equal(JSON.stringify(b), once);
});
t('the re-locked bundle opens again with the same content, and not with another key or repository', () => {
  const key = randomBytes(32), b = make(); addClass(b, o);
  const bytes = encryptBundle(b, key);
  assert.deepEqual(decryptBytes(bytes, key), b);
  assert.throws(() => decryptBytes(bytes, randomBytes(32)));
  assert.throws(() => decryptBytes(bytes, key, 'someone/else'));
});
console.log(pass + ' passed');
