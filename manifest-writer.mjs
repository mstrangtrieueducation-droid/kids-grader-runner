// The append-only manifest grows independently of the Sheet's initial grid.
// Only the existing hosted coordinator calls this writer under native leases.
export function writeManifestItems(g,sheet,queue,items,{runId='',now=()=>new Date().toISOString(),saveLocal=()=>{},emit=()=>{}}={}){
 if(!items.length)return;
 const tab=sheet.getName();if(!['KidsTodo','FrozenBacklog'].includes(tab))throw Error('MANIFEST_TABLE_INVALID');
 const indexes=new Map(queue.items.map((item,i)=>[item.id,i]));
 const data=items.map(item=>{
  const index=indexes.get(item.id);if(index===undefined||queue.items[index]!==item)throw Error('MANIFEST_ITEM_BINDING_INVALID');
  const value=JSON.stringify(item);if(value.length>45000)throw Error('MANIFEST_ITEM_TOO_LARGE');
  return {range:"'"+tab+"'!A"+(index+2)+':F'+(index+2),values:[[item.id,item.state,now(),runId,queue.membershipHash,value]]};
 });
 const grid=sheet.meta.properties.gridProperties,rows=queue.items.length+1,requests=[];
 if(!Number.isInteger(grid.rowCount)||!Number.isInteger(grid.columnCount))throw Error('MANIFEST_GRID_METADATA_REQUIRED');
 const rowGrowth=rows>grid.rowCount?Math.max(rows-grid.rowCount,250):0,columnGrowth=grid.columnCount<6?6-grid.columnCount:0;
 if(rowGrowth)requests.push({appendDimension:{sheetId:sheet.getSheetId(),dimension:'ROWS',length:rowGrowth}});
 if(columnGrowth)requests.push({appendDimension:{sheetId:sheet.getSheetId(),dimension:'COLUMNS',length:columnGrowth}});
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+sheet.book.id;
 if(requests.length){
  // A failed structural request never advances local metadata or checkpoints.
  g.api(base+':batchUpdate','POST',{requests});grid.rowCount+=rowGrowth;grid.columnCount+=columnGrowth;
  emit({event:'MANIFEST_CAPACITY_EXTENDED',table:tab,rows:grid.rowCount,columns:grid.columnCount,requiredRows:rows,providerCalls:0});
 }
 g.api(base+'/values:batchUpdate','POST',{valueInputOption:'RAW',data});saveLocal();
}
