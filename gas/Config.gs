const MODEL_NAME = 'gemini-3.8-flash';
const FALLBACK_MODEL_NAME = 'gemini-3.8-flash';
const FALLBACK_MODEL_NAMES=Object.freeze(['gemini-3.8-flash']);
const KG=Object.freeze({...{"tab":"THEO DÕI TOÀN DIỆN","marker":"— NHẬN XÉT GV —","timezone":"Asia/Ho_Chi_Minh","api":"https://generativelanguage.googleapis.com","inlineLimit":8388608,"chunk":2097152,"maxFile":2147483648,"budget":300000,"uploadSliceMs":10000,"maxUploadChunksPerStep":1,"maxBatch":8,"betweenJobsMs":3000,"generationReserveMs":90000,"bands":["100%","95%","90%","85%","80%","75%","70%","60–65%","Dưới 60%"],"templateLabels":{"phonics":"Phonics theo sách","vocabulary":"Từ vựng","grammar":"Grammar – video","reading":"Reading – đọc bài","translation":"Reading – đọc và dịch","de":"D.E – Discover English","peppa":"Peppa Pig","phonicsVideo":"Phonics Video tự luyện","scienceK":"Science K","science":"Science G1 / G2 / G3","critical":"Critical – video thuyết trình"}},...JSON.parse(typeof PropertiesService==='undefined'?'{}':PropertiesService.getScriptProperties().getProperty('KIDS_NATIVE_CONFIG')||'{}')});
function prop_() { return PropertiesService.getScriptProperties(); }
function norm_(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim(); }
function hash_(x) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, typeof x === 'string' ? x : JSON.stringify(x)).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join(''); }
function require_(ok, message) { if (!ok) throw new Error(message); }
let KIDS_EXECUTION_CACHE = null;
function control_() {
  if(KIDS_EXECUTION_CACHE && KIDS_EXECUTION_CACHE.control)return KIDS_EXECUTION_CACHE.control;
  const id = prop_().getProperty('KIDS_CONTROL_ID');
  require_(id, 'Chạy setupKidsGrader() trước.');
  const ss=SpreadsheetApp.openById(id);if(KIDS_EXECUTION_CACHE)KIDS_EXECUTION_CACHE.control=ss;return ss;
}
function saveArtifact_(name, data) {
  const folder = DriveApp.getFolderById(prop_().getProperty('KIDS_ARTIFACT_FOLDER'));
  return folder.createFile(name + '.json', JSON.stringify(data, null, 2), 'application/json').getId();
}
function readArtifact_(id) { return JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8')); }
function audit_(id, event, detail) {
  control_().getSheetByName('Audit').appendRow([new Date(), id, event, String(detail || '').slice(0, 2000)]);
}
function configuredModel_() {
  const saved = prop_().getProperty('GEMINI_MODEL');
  const model = saved === 'gemini-3.8-flash' ? saved : MODEL_NAME;
  require_(model && /^[a-z0-9.-]+$/.test(model), 'Đặt GEMINI_MODEL trong Script Properties; Gemini 1.5 Flash đã ngừng hoạt động.');
  require_(!/^gemini-(1\.5|2\.0)/.test(model), 'MODEL_RETIRED: Gemini 1.5 và 2.0 đã shutdown. Chọn model khả dụng bằng listGeminiModels().');
  return model;
}
