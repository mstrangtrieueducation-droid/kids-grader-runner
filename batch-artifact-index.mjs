// Artifact payloads are immutable and read individually by the existing reader.
// Bulk queue snapshots need only their row/part index, never every past JSON.
export function batchSheetRange(name,{control=false}={}){
 const quoted="'"+name.replaceAll("'","''")+"'";
 return quoted+(control&&name==='RunnerArtifacts'?'!A:B':'');
}
export function batchSheetWidth(name,width,{control=false}={}){
 return control&&name==='RunnerArtifacts'?Math.min(2,width):width;
}
