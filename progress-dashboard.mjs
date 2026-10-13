import fs from 'node:fs';
import {annotateScoreAttention,ATTENTION_LABEL} from './score-attention.mjs';
import {fileURLToPath} from 'node:url';
import {Google} from './google-adapter.mjs';
const TITLE='TIẾN ĐỘ CHUNG', MARKER='TIẾN ĐỘ CHẤM — KIDS / IELTS / SHADOWING';
const pending=new Set(['WAITING_INPUT','QUEUED','READY','WAITING_MEDIA','RETRY','PROCESSING','GRADED','GENERATING','GENERATED']);
export function dashboardState(j){
 if(j.status==='NEEDS_RESUBMISSION')return 'CẦN NỘP LẠI';
 if(j.status==='AUTOMATION_FAILED')return 'LỖI TỰ ĐỘNG — ĐÃ GHI LOG';
 if(j.status==='SKIPPED_ALREADY_GRADED')return 'GIỮ NHẬN XÉT CŨ';
 if(j.error==='GRADE_MANUAL_RESUBMISSION')return 'CHỜ CÔ CHẤM';
 if(j.error==='GRADE_RECORDING_RESUBMIT'||j.recordingIssue?.status==='NEEDS_RESUBMISSION')return 'CẦN NỘP LẠI';
 if(['RETURNED','DONE'].includes(j.status))return 'ĐÃ TRẢ';
 if(['PROCESSING','GENERATING'].includes(j.status))return 'ĐANG XỬ LÝ';
 if(pending.has(j.status))return 'ĐANG CHỜ';
 if(j.status==='SKIPPED_EXISTING_FEEDBACK')return 'GIỮ NHẬN XÉT CŨ';
 if(j.status==='SKIPPED_OLD_SUBMISSION')return 'BỎ LƯỢT NỘP CŨ';
 if(j.status?.startsWith('SKIPPED'))return 'BỎ QUA';
 if(j.route?.kind==='shadowing'&&j.status==='NEEDS_REVIEW'&&!['STUDENT_NOT_FOUND','STUDENT_AMBIGUOUS','DESTINATION_COLUMN_NOT_FOUND','DESTINATION_AMBIGUOUS'].includes(j.error))return 'LỖI HỆ THỐNG — CHỜ PHỤC HỒI';
 return 'CẦN KIỂM TRA';
}
export function refreshProgressDashboard(g,cfg,label='Theo dõi hàng đợi'){
 const bindings=[...cfg.clusters.map(b=>({...b,kind:'Kids',tab:'Jobs'})),...(cfg.ielts?[{...cfg.ielts,kind:'IELTS',tab:'IELTS SPEAKING AI'}]:[]),...(cfg.shadowing?.enabled?[{...cfg.shadowing,kind:'Shadowing',tab:'SHADOWING AI'}]:[])];
 const counts={},items=[],scoreTargets=[];
 for(const b of bindings){
  const book=g.book(b.controlId),s=book.getSheetByName(b.tab);if(!s)throw Error('DASHBOARD_QUEUE_MISSING');
  const max=s.meta.properties.gridProperties.rowCount;
  for(let start=2;start<=max;start+=500){
   const range="'"+b.tab.replaceAll("'","''")+"'!A"+start+':F'+Math.min(max,start+499);
   const rows=g.api(`https://sheets.googleapis.com/v4/spreadsheets/${b.controlId}/values/`+encodeURIComponent(range)).values||[];
   rows.forEach((r,i)=>{if(!r[5])return;const j=JSON.parse(r[5]),state=dashboardState(j);counts[state]=(counts[state]||0)+1;
    const target=j.cls?.spreadsheetId||j.target?.spreadsheetId||j.destination?.spreadsheetId||j.dest?.spreadsheetId;
    const cell=j.cell||j.target?.a1||j.destination?.a1||j.dest?.a1||'';
    const issue=(j.error==='GRADE_MANUAL_RESUBMISSION'?'Bài nộp lại sau cảnh báo; dành cho cô chấm tay.':j.recordingIssue?.reason)||(j.error==='GRADE_RECORDING_REVIEW'?'Chưa xác minh được cách quay; cô kiểm tra trước khi chấm.':j.error||'');
    items.push([b.kind,j.cls?.className||j.source?.className||j.className||'',j.receipt?.student||j.source?.name||'',j.route?.code||j.source?.code||'',state,issue,String(r[2]||''),target?`https://docs.google.com/spreadsheets/d/${target}/edit${cell?'#range='+encodeURIComponent(cell):''}`:'',`https://docs.google.com/spreadsheets/d/${b.controlId}/edit#gid=${s.getSheetId()}&range=A${start+i}:F${start+i}`]);
    if(b.kind==='Kids'&&['ĐÃ TRẢ','GIỮ NHẬN XÉT CŨ'].includes(state))scoreTargets.push({book:target,sheet:j.cls?.sheetName,cell,row:items[items.length-1]});
   });
  }
 }
 const attention=annotateScoreAttention(g,scoreTargets);
 const order=['CẦN NỘP LẠI','CHỜ CÔ CHẤM','CẦN KIỂM TRA','LỖI HỆ THỐNG — CHỜ PHỤC HỒI','ĐANG XỬ LÝ','ĐANG CHỜ','ĐÃ TRẢ','GIỮ NHẬN XÉT CŨ','BỎ LƯỢT NỘP CŨ','BỎ QUA'];
 items.sort((a,b)=>order.indexOf(a[4])-order.indexOf(b[4])||a[1].localeCompare(b[1],'vi',{numeric:true})||a[2].localeCompare(b[2],'vi'));
 const b=g.book(cfg.clusters[0].controlId);b.cache.clear();let s=b.getSheetByName(TITLE);
 if(s&&s.getRange('A1').getValue()!==MARKER)throw Error('DASHBOARD_UNMANAGED_TAB');
 if(!s)s=b.insertSheet(TITLE);
 const at=new Date().toISOString(),rows=[[MARKER],['Cập nhật',new Date().toLocaleString('vi-VN',{timeZone:'Asia/Bangkok'}),label],['Hồ sơ đã quét',items.length,...['ĐÃ TRẢ','ĐANG CHỜ','ĐANG XỬ LÝ'].flatMap(k=>[k,counts[k]||0])],['CẦN NỘP LẠI',counts['CẦN NỘP LẠI']||0,'CẦN KIỂM TRA',counts['CẦN KIỂM TRA']||0,'GIỮ NHẬN XÉT CŨ',counts['GIỮ NHẬN XÉT CŨ']||0,ATTENTION_LABEL,attention.low],['Lọc hàng 6 theo lớp/trạng thái. Tổng là hồ sơ hàng đợi đã quét, không phải số bài chấm thành công.'],['Khối','Lớp','Học sinh','Bài','Trạng thái','Lý do / Cần xử lý','Cập nhật hồ sơ','Mở nhận xét','Mở hàng đợi'],...items];
 const id=s.getSheetId(),n=Math.max(rows.length,s.meta.properties.gridProperties.rowCount),rgb=(r,g,b)=>({red:r,green:g,blue:b});
 const req=[{updateSheetProperties:{properties:{sheetId:id,gridProperties:{rowCount:n,columnCount:Math.max(9,s.meta.properties.gridProperties.columnCount),frozenRowCount:6}},fields:'gridProperties'}}];
 // Own only this dedicated report tab, not the job queues or learner cells.
 req.push({updateCells:{range:{sheetId:id,startRowIndex:0,endRowIndex:n,startColumnIndex:0,endColumnIndex:9},rows:rows.map(r=>({values:Array.from({length:9},(_,i)=>({userEnteredValue:typeof r[i]==='number'?{numberValue:r[i]}:{stringValue:String(r[i]??'')}}))})),fields:'userEnteredValue'}});
 req.push({repeatCell:{range:{sheetId:id,startRowIndex:0,endRowIndex:rows.length,startColumnIndex:0,endColumnIndex:9},cell:{userEnteredFormat:{textFormat:{fontFamily:'Arial',fontSize:10},verticalAlignment:'TOP',wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}});
 req.push({repeatCell:{range:{sheetId:id,startRowIndex:5,endRowIndex:6,startColumnIndex:0,endColumnIndex:9},cell:{userEnteredFormat:{backgroundColor:rgb(.92,.94,.95),textFormat:{bold:true}}},fields:'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat.bold'}});
 [90,110,160,145,175,350,175,130,130].forEach((w,i)=>req.push({updateDimensionProperties:{range:{sheetId:id,dimension:'COLUMNS',startIndex:i,endIndex:i+1},properties:{pixelSize:w},fields:'pixelSize'}}));
 for(const row of [0,4])if(!s.meta.merges?.some(m=>m.startRowIndex===row&&m.startColumnIndex===0&&m.endColumnIndex===9))req.push({mergeCells:{range:{sheetId:id,startRowIndex:row,endRowIndex:row+1,startColumnIndex:0,endColumnIndex:9},mergeType:'MERGE_ALL'}});
 req.push({repeatCell:{range:{sheetId:id,startRowIndex:6,endRowIndex:Math.max(7,rows.length),startColumnIndex:7,endColumnIndex:9},cell:{userEnteredFormat:{wrapStrategy:'CLIP'}},fields:'userEnteredFormat.wrapStrategy'}});
 req.push({setBasicFilter:{filter:{range:{sheetId:id,startRowIndex:5,endRowIndex:Math.max(7,rows.length),startColumnIndex:0,endColumnIndex:9}}}});
 for(const [i,row]of items.entries())if(row.lowScore)req.push({repeatCell:{range:{sheetId:id,startRowIndex:i+6,endRowIndex:i+7,startColumnIndex:5,endColumnIndex:6},cell:{userEnteredFormat:{textFormat:{foregroundColor:rgb(183/255,28/255,28/255),bold:true}}},fields:'userEnteredFormat.textFormat.foregroundColor,userEnteredFormat.textFormat.bold'}});
 b.batch(req);
 b.cache.clear();if(s.getRange('A1').getValue()!==MARKER||s.getRange('B3').getValue()!==items.length)throw Error('DASHBOARD_READBACK_FAILED');
 const result={at,counts,attention,total:items.length,url:`https://docs.google.com/spreadsheets/d/${b.id}/edit#gid=${id}`};
 fs.mkdirSync('private',{recursive:true});fs.writeFileSync('private/unified-progress-latest.json',JSON.stringify(result,null,2));return result;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){
 const cfg=JSON.parse(process.env.RUNNER_CONFIG||fs.readFileSync('private/runner-config.json')),sa=JSON.parse(process.env.GOOGLE_CREDENTIALS||fs.readFileSync('../tracker-fast-pilot-20260924/private/google-service-account.json'));
 console.log(JSON.stringify(refreshProgressDashboard(new Google(sa),cfg,'Cập nhật trực tiếp; trạng thái chạy xem GitHub Actions')));
}
