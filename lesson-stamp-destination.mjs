import {createHash} from 'node:crypto';
import {studentRows} from './master-policy.mjs';
import {emptyTeacherBody,hasTeacherReview} from './teacher-feedback-state.mjs';
export const STAMP_DESTINATION='teacher-stamped-destination-20261104';
export const ALREADY_REVIEWED='DESTINATION_ALREADY_REVIEWED';
const fingerprint=(headers,column)=>createHash('sha256').update(JSON.stringify(headers.map(row=>row[column]||''))).digest('hex');
const stampMinutes=text=>[...String(text).matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/g)].map(m=>Date.UTC(+m[3],+m[2]-1,+m[1],+m[4]-7,+m[5])/60000);
// The receipt sync already stamped this pupil's exact Form minute into one cell.
// When the header matcher cannot name a column, that cell can, provided its header
// carries the same lesson and does not name a different task. Otherwise nothing binds.
export function stampedColumn(c,snapshot,route,receipt){
 if(!snapshot?.values?.length||!snapshot.headers?.[3])return null;
 const rows=studentRows(snapshot.values,receipt.student),minute=Math.floor(Date.parse(receipt.time)/60000);if(rows.length!==1||!Number.isFinite(minute))return null;
 let a;try{a=c.assignmentIdentity_(route.code);}catch{return null;}
 const row=snapshot.values[rows[0]-1],headers=c.fleetHeaders_(snapshot.headers),lesson=new RegExp('(?:TIET(?: HOC)?(?: SO)?|VIDEO)\\s*0*'+a.number+'(?!\\d)'),found=[];let reviewed=false;
 for(let col=0;col<headers[0].length;col++){
  const top=c.norm_(headers.slice(0,3).map(r=>r[col]).join('\n')),text=row[col];if(!lesson.test(top))continue;
  const full=c.norm_(headers.map(r=>r[col]).join('\n'));
  const sameMinute=stampMinutes(text).includes(minute);
  // One review per video or undivided lesson: never grade the same work again beside it.
  if(hasTeacherReview(text)&&(sameMinute||(a.practice||!a.detail)&&(a.practice?c.practiceMatches_(full,a):c.bookMatches_(full,a))))reviewed=true;
  if(!emptyTeacherBody(text)||snapshot.formulas?.[rows[0]-1]?.[col]||!sameMinute)continue;
  const label=c.sectionKind_(headers[3][col])||c.sectionKind_(headers[2][col]);
  if(!label||label===route.kind||route.kind==='translation'&&label==='reading')found.push(col);
 }
 if(reviewed)return ALREADY_REVIEWED;
 return found.length===1?{version:STAMP_DESTINATION,fingerprint:fingerprint(headers,found[0])}:null;
}
// A receipt with no usable route can still be answered: its exact minute beside a review.
export function reviewedAtMinute(snapshot,receipt){
 const rows=snapshot?.values?.length?studentRows(snapshot.values,receipt.student):[],minute=Math.floor(Date.parse(receipt.time)/60000);
 return rows.length===1&&snapshot.values[rows[0]-1].some(text=>hasTeacherReview(text)&&stampMinutes(text).includes(minute));
}
export function prepareStampedRoute(c,snapshot,route,receipt,job,save){
 if(job?.route?.stampedDestination&&!route.stampedDestination)route.stampedDestination=job.route.stampedDestination;
 try{c.autoTarget_(snapshot,route,receipt.student);return;}catch{/* Only an unnamed column reaches the stamp. */}
 delete route.stampedDestination;
 const found=stampedColumn(c,snapshot,route,receipt);
 if(found===ALREADY_REVIEWED)throw Error(ALREADY_REVIEWED);
 if(!found)return;
 route.stampedDestination=found;
 if(job&&job.route!==route&&job.route?.stampedDestination?.fingerprint!==found.fingerprint){job.route={...job.route,stampedDestination:found};save?.();}
}
export function installStampedDestination(c){
 const columns=c.autoColumns_;
 c.autoColumns_=(headers,route)=>{try{return columns(headers,route);}catch(error){
  const wanted=route?.stampedDestination;if(wanted?.version!==STAMP_DESTINATION||!headers?.[3]||!/^DESTINATION_AMBIGUOUS/.test(error.message||''))throw error;
  const h=c.fleetHeaders_(headers),cols=[];for(let col=0;col<h[0].length;col++)if(fingerprint(h,col)===wanted.fingerprint)cols.push(col+1);
  if(cols.length!==1)throw error;return cols[0];
 }};
}
