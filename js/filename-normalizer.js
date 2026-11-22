export const SIGAME_MAX_FILENAME_LENGTH=15;

function codePointLength(value){return Array.from(String(value)).length}
function sliceCodePoints(value,length){return Array.from(String(value)).slice(0,Math.max(0,length)).join("")}
function pathKey(value){
 let normalized=String(value||"").replaceAll("\\","/").replace(/^\/+/, "");
 try{normalized=decodeURIComponent(normalized)}catch{}
 return normalized.toLowerCase();
}
function splitArchivePath(value){
 const path=String(value||"").replaceAll("\\","/").replace(/^\/+/, "");
 const slash=path.lastIndexOf("/");
 return {directory:slash>=0?path.slice(0,slash+1):"",fileName:slash>=0?path.slice(slash+1):path};
}
function splitFileName(fileName){
 const dot=fileName.lastIndexOf(".");
 if(dot>0&&dot<fileName.length-1){
  const candidate=fileName.slice(dot);
  if(/^\.[\p{L}\p{N}]{1,10}$/u.test(candidate)){
   return {stem:fileName.slice(0,dot),extension:candidate};
  }
 }
 return {stem:fileName,extension:""};
}
function sanitizeStem(value){
 const cleaned=String(value||"")
  .normalize("NFC")
  .replace(/\s+/gu,"_")
  .replaceAll(",","")
  .replace(/[^\p{L}\p{N}_-]/gu,"")
  .replace(/_+/gu,"_")
  .replace(/-+/gu,"-")
  .replace(/^[_-]+|[_-]+$/gu,"");
 return cleaned||"file";
}
function fitStem(stem,suffix,extension,maxLength){
 const room=maxLength-codePointLength(extension)-codePointLength(suffix);
 if(room<1)throw Error("Расширение "+extension+" не помещается в ограничение "+maxLength+" символов.");
 const prefix=sliceCodePoints(stem,room).replace(/[_-]+$/u,"")||"f";
 return prefix+suffix;
}
function makeUniqueName(stem,extension,maxLength,directory,occupied){
 const maxStemLength=maxLength-codePointLength(extension);
 if(maxStemLength<1)throw Error("Расширение "+extension+" длиннее допустимого имени файла.");
 const base=sliceCodePoints(stem,maxStemLength)||"f";
 let candidate=base+extension;
 if(!occupied.has(pathKey(directory+candidate)))return candidate;
 for(let suffixNumber=2;suffixNumber<100000;suffixNumber++){
  const suffix="_"+suffixNumber;
  const fitted=fitStem(stem,suffix,extension,maxLength);
  candidate=fitted+extension;
  if(!occupied.has(pathKey(directory+candidate)))return candidate;
 }
 throw Error("Не удалось подобрать уникальное имя для файла: "+directory+stem+extension);
}

export function normalizeArchiveFilename(path,{maxLength=SIGAME_MAX_FILENAME_LENGTH}={}){
 const {directory,fileName}=splitArchivePath(path);
 const {stem,extension}=splitFileName(fileName);
 const safeStem=sanitizeStem(stem);
 const maxStemLength=maxLength-codePointLength(extension);
 if(maxStemLength<1)throw Error("Расширение "+extension+" длиннее допустимого имени файла.");
 return directory+sliceCodePoints(safeStem,maxStemLength)+extension;
}

export function planArchiveFilenameNormalization(items,{maxLength=SIGAME_MAX_FILENAME_LENGTH}={}){
 const list=Array.from(items||[]);
 const occupied=new Set(list.filter(item=>item?.path).map(item=>pathKey(item.path)));
 const changes=[],skipped=[];
 let checked=0,unchanged=0;
 for(const item of list){
  if(!item?.path||!item.resource||item.isDirectory||item.missing||item.status==="system"||!item.entry)continue;
  checked++;
  const {directory,fileName}=splitArchivePath(item.path);
  const {stem,extension}=splitFileName(fileName);
  const safeStem=sanitizeStem(stem);
  const maxStemLength=maxLength-codePointLength(extension);
  if(maxStemLength<1){
   skipped.push({path:item.path,reason:"Расширение слишком длинное"});
   continue;
  }
  const desiredName=sliceCodePoints(safeStem,maxStemLength)+extension;
  let targetName=desiredName;
  if(pathKey(directory+targetName)!==pathKey(item.path)){
   try{targetName=makeUniqueName(safeStem,extension,maxLength,directory,occupied)}
   catch(error){skipped.push({path:item.path,reason:error.message});continue}
  }
  const targetPath=directory+targetName;
  if(pathKey(targetPath)===pathKey(item.path)){
   unchanged++;
   continue;
  }
  occupied.add(pathKey(targetPath));
  changes.push({item,oldPath:item.path,newPath:targetPath,targetPath});
 }
 return {changes,checked,unchanged,skipped,maxLength};
}
