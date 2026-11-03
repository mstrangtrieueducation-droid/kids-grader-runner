// A worker's sheet metadata can predate rows appended by its siblings. Before
// declaring an artifact missing, reload the grid once; never invent a result.
export function locateArtifact(id,{has,index,book}){
 if(has(id))return true;
 index();if(has(id))return true;
 if(book.ramBatch)return false;
 book.cache.clear();book.refresh();index();return has(id);
}
