// Always enter the current batch loader before consulting a held native Sheet.
// Reuse only while that exact batch's master grid is still current.
export function currentBatchSnapshot(google,readNative){
 const held=new Map();
 return cls=>{
  const book=google.book(cls.spreadsheetId),key=cls.spreadsheetId+'|'+cls.sheetName,prior=held.get(key),master=prior?.snapshot.sheet?book.cache.get(prior.snapshot.sheet.getName()+'|master'):null;
  if(prior&&prior.book===book&&master&&prior.master===master)return prior.snapshot;
  const snapshot=readNative(cls),next=snapshot.sheet?book.cache.get(snapshot.sheet.getName()+'|master'):null;
  held.set(key,{book,snapshot,master:next});return snapshot;
 };
}
