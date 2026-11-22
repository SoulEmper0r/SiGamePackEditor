import {normalizeResourceReference,resolvePackageLogoResource,packageLogoReferenceValue} from "./pack-model.js";
import {crc32} from "./zip.js";
import {assertQualityMediaSize} from "./quality-limits.js";

const SYSTEM_RESOURCE_PATHS=new Set(["content.xml","quality.marker"]);

function encodeArchivePath(path){return String(path).split("/").map(x=>encodeURIComponent(x)).join("/")}

function extensionOf(name){const m=String(name).match(/\.([^.]+)$/);return m?m[1].toLowerCase():""}
function mediaTypeFromName(name){const e=extensionOf(name);if(["png","jpg","jpeg","gif","webp","avif","bmp","svg","tif","tiff","ico"].includes(e))return"image";if(["mp3","wav","ogg","oga","opus","m4a","flac","aac","wma"].includes(e))return"audio";if(["mp4","webm","avi","mov","mkv","m4v","mpg","mpeg","3gp"].includes(e))return"video";if(["html","htm"].includes(e))return"html";return"text"}
function sha256Hex(bytes){return crypto.subtle.digest("SHA-256",bytes).then(b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase())}

function resourcePathForFile(file){
 const folder=mediaTypeFromName(file.name)==="image"?"Images":mediaTypeFromName(file.name)==="audio"?"Audio":mediaTypeFromName(file.name)==="video"?"Video":mediaTypeFromName(file.name)==="html"?"Html":"Files";
 return folder+"/"+encodeArchivePath(file.name)
}
function resourceFolderForType(type){
 const t=String(type||"").toLowerCase();
 if(t==="image"||t==="images")return "Images";
 if(t==="audio"||t==="sound")return "Audio";
 if(t==="video")return "Video";
 if(t==="html")return "Html";
 return "";
}
function resolveResourceReference(value,type){
 let path=normalizeResourceReference(value);
 if(!path.includes("/")){
  const folder=resourceFolderForType(type);
  if(folder)path=folder+"/"+path;
 }
 return path
}
function findResource(pack,value,type=""){
 const path=resolveResourceReference(value,type).toLowerCase();
 return pack.model.resources.find(r=>r.normalizedPath.toLowerCase()===path)||null
}
function resourceReferenceValue(resource,type){
 const path=normalizeResourceReference(resource.archivePath);
 const folder=resourceFolderForType(type);
 const prefix=folder?folder.toLowerCase()+"/":"";
 if(prefix && path.toLowerCase().startsWith(prefix)){
  const relative=path.slice(folder.length+1);
  if(!relative.includes("/"))return relative;
 }
 return path
}
async function resourceBytes(resource){
 if(resource.replacement?.data)return resource.replacement.data;
 if(resource.extra)return resource.data;
 return resource.entry.bytes();
}
function uniqueArchivePath(pack,path){
 const normalized=normalizeResourceReference(path);
 if(!pack.model.resources.some(r=>r.normalizedPath.toLowerCase()===normalized.toLowerCase())&&!((pack.extraResources||[]).some(r=>normalizeResourceReference(r.archivePath).toLowerCase()===normalized.toLowerCase())))return normalized;
 const slash=normalized.lastIndexOf("/"),dir=slash>=0?normalized.slice(0,slash+1):"",file=slash>=0?normalized.slice(slash+1):normalized;
 const dot=file.lastIndexOf("."),base=dot>=0?file.slice(0,dot):file,ext=dot>=0?file.slice(dot):"";
 let i=2;while(true){const candidate=dir+base+"_"+i+ext;if(!pack.model.resources.some(r=>r.normalizedPath.toLowerCase()===candidate.toLowerCase())&&!((pack.extraResources||[]).some(r=>normalizeArchivePath(r.archivePath).toLowerCase()===candidate.toLowerCase())))return candidate;i++}
}
function normalizeArchivePath(path){let p=String(path).replaceAll("\\","/").replace(/^\/+/, "");try{return decodeURIComponent(p)}catch{return p}}

async function addResourceToPack(pack,file,{deduplicateFolder=null}={}){
 assertQualityMediaSize(pack,file.name,file.size);
 const data=new Uint8Array(await file.arrayBuffer()),hash=await sha256Hex(data);
 for(const r of pack.model.resources){
  if(r.size!==data.length)continue;
  if(deduplicateFolder){
   const path=normalizeResourceReference(r.normalizedPath).toLowerCase();
   const folder=deduplicateFolder.toLowerCase()+"/";
   if(path.includes("/")&&!path.startsWith(folder))continue;
  }
  const rb=await resourceBytes(r);
  if(await sha256Hex(rb)===hash)return {resource:r,reused:true};
 }
 let archivePath=uniqueArchivePath(pack,resourcePathForFile(file));
 const extra={archivePath,data,name:file.name,hash,size:data.length};
 pack.extraResources=pack.extraResources||[];pack.extraResources.push(extra);
 const resource={id:crypto.randomUUID(),archivePath,normalizedPath:normalizeArchivePath(archivePath),size:data.length,compressedSize:0,method:0,crc:crc32(data),extra:true,data,manifestEntry:null,hash};
 pack.model.resources.push(resource);
 let filesNode=pack.model.manifest.node;
 if(!filesNode){filesNode=pack.model.sourceDocument.createElementNS(pack.model.namespace,"files");pack.model.sourceDocument.documentElement.appendChild(filesNode);pack.model.manifest.node=filesNode}
 const f=pack.model.sourceDocument.createElementNS(pack.model.namespace,"file");
 f.setAttribute("name",archivePath);f.setAttribute("hash",hash);filesNode.appendChild(f);
 const me={name:archivePath,normalizedPath:normalizeArchivePath(archivePath),hash,attributes:{name:archivePath,hash},sourceNode:f};
 pack.model.manifest.entries.push(me);resource.manifestEntry=me;
 pack.dirty=true;
 return {resource,reused:false}
}

function cleanImportPath(path){
 const raw=String(path||"").replaceAll("\\","/");
 if(raw.startsWith("/")||/^[a-z]:/i.test(raw))throw Error("Путь импорта не должен быть абсолютным.");
 const parts=raw.split("/").filter(Boolean).map(segment=>{
  let decoded=segment;
  try{decoded=decodeURIComponent(segment)}catch{}
  if(decoded==="."||decoded===".."||decoded.includes("/")||decoded.includes("\\")||decoded.includes(":")||/[\x00-\x1f]/.test(decoded)){
   throw Error("Недопустимый сегмент пути импорта: "+segment);
  }
  return decoded;
 });
 if(!parts.length)throw Error("Не удалось определить имя файла для импорта.");
 return parts;
}
function uniqueStagedArchivePath(path,usedPaths){
 const normalized=normalizeResourceReference(path),key=normalized.toLowerCase();
 if(!usedPaths.has(key)){usedPaths.add(key);return path}
 const slash=normalized.lastIndexOf("/"),dir=slash>=0?normalized.slice(0,slash+1):"",file=slash>=0?normalized.slice(slash+1):normalized;
 const dot=file.lastIndexOf("."),base=dot>0?file.slice(0,dot):file,ext=dot>0?file.slice(dot):"";
 let index=2;
 while(true){
  const candidate=dir+base+"_"+index+ext,candidateKey=candidate.toLowerCase();
  if(!usedPaths.has(candidateKey)){usedPaths.add(candidateKey);return encodeArchivePath(candidate)}
  index++;
 }
}

/**
 * Batch import is prepared completely before Pack Model/XML are changed.
 * conflictPolicy: inspect | keep-both | skip | replace.
 * Folder imports keep webkitRelativePath (including the selected root folder).
 */
async function addResourceFilesToPack(pack,files,{destinationPath="",preserveRelativePaths=false,conflictPolicy="keep-both",conflictDecisions={}}={}){
 if(!pack?.model||!pack.model.sourceDocument)throw Error("Сначала откройте пакет.");
 if(!["inspect","keep-both","skip","replace"].includes(conflictPolicy))throw Error("Неизвестная политика конфликта импорта.");
 if(!conflictDecisions||typeof conflictDecisions!=="object"||Array.isArray(conflictDecisions))throw Error("Некорректная таблица решений конфликтов.");
 const selectedFiles=Array.from(files||[]).filter(Boolean);
 if(!selectedFiles.length)return {files:0,added:[],replaced:[],skipped:0,reused:0,resources:[]};
 if(preserveRelativePaths&&selectedFiles.some(file=>!String(file.webkitRelativePath||"").trim())){
  throw Error("Браузер не передал относительные пути выбранной папки. Папка не импортирована.");
 }
 const destination=String(destinationPath||"").trim()?cleanImportPath(destinationPath):[];
 const staged=[],replacements=[],conflicts=[],hashLookup=new Map(),inputResults=[];
 const incomingSizes=new Set();
 const preparedFiles=[];
 for(const file of selectedFiles){
  if(typeof file.arrayBuffer!=="function")throw Error("Один из выбранных элементов не является файлом.");
  const data=new Uint8Array(await file.arrayBuffer()),hash=await sha256Hex(data);
  incomingSizes.add(data.length);
  preparedFiles.push({file,data,hash});
 }
 if(!preserveRelativePaths){
  for(const resource of pack.model.resources||[]){
   if(!incomingSizes.has(Number(resource.size)))continue;
   const bytes=await resourceBytes(resource);
   const hash=await sha256Hex(bytes);
   if(!hashLookup.has(hash))hashLookup.set(hash,resource);
  }
 }
 const existingResourcesByPath=new Map((pack.model.resources||[]).map(resource=>[normalizeResourceReference(resource.normalizedPath).toLowerCase(),resource]));
 const originalPaths=new Set((pack.zip?.entries||[]).map(entry=>normalizeResourceReference(entry.name).toLowerCase()));
 const usedPaths=new Set(originalPaths);
 for(const resource of pack.model.resources||[])usedPaths.add(normalizeResourceReference(resource.normalizedPath).toLowerCase());
 for(const extra of pack.extraResources||[])usedPaths.add(normalizeResourceReference(extra.archivePath).toLowerCase());
 const initiallyOccupiedPaths=new Set(usedPaths);
 for(const [inputIndex,{file,data,hash}] of preparedFiles.entries()){
  const existingByBytes=preserveRelativePaths?null:hashLookup.get(hash);
  if(existingByBytes){inputResults.push({file,resource:existingByBytes,reused:true});continue}
  let rawParts;
  if(preserveRelativePaths){
   rawParts=[...(destination.length?destination:["Imported"]),...cleanImportPath(file.webkitRelativePath)];
  }else if(destination.length){
   rawParts=[...destination,...cleanImportPath(file.name)];
  }else{
   rawParts=cleanImportPath(resourcePathForFile(file));
  }
  const desiredArchivePath=encodeArchivePath(rawParts.join("/"));
  const desiredPath=normalizeArchivePath(desiredArchivePath);
  const key=desiredPath.toLowerCase();
  const pathOccupied=initiallyOccupiedPaths.has(key);
  let archivePath=desiredArchivePath;
  if(pathOccupied){
   const existingResource=existingResourcesByPath.get(key)||null;
   let sameBytes=false;
   if(existingResource){
    const currentHash=await sha256Hex(await resourceBytes(existingResource));
    sameBytes=currentHash===hash;
   }
   if(sameBytes){
    inputResults.push({file,resource:existingResource,reused:true});continue;
   }
   const system=SYSTEM_RESOURCE_PATHS.has(desiredPath.toLowerCase());
   const compatible=!!existingResource&&!system&&extensionOf(desiredPath)===extensionOf(file.name);
   const reason=!existingResource?"В ZIP существует запись, не представленная как редактируемый ресурс.":system?"Системный файл нельзя заменять.":extensionOf(desiredPath)!==extensionOf(file.name)?"Расширение файла не совпадает.":"";
   const conflict={index:inputIndex,file,path:desiredPath,resource:existingResource,canReplace:compatible,reason};
   if(conflictPolicy==="inspect"){
    conflicts.push(conflict);continue;
   }
   const decision=Object.prototype.hasOwnProperty.call(conflictDecisions,String(inputIndex))
    ?conflictDecisions[String(inputIndex)]
    :conflictPolicy;
   if(!["keep-both","skip","replace"].includes(decision))throw Error("Не задано корректное решение для конфликта: "+desiredPath);
   if(decision==="skip"){
    inputResults.push({file,resource:existingResource,skipped:true});continue;
   }
   if(decision==="replace"){
    if(!compatible)throw Error("Нельзя заменить «"+desiredPath+"»: "+(reason||"ресурс несовместим."));
    replacements.push({file,resource:existingResource,path:desiredPath});
    inputResults.push({file,resource:existingResource,replaced:true});
    continue;
   }
   archivePath=uniqueStagedArchivePath(desiredArchivePath,usedPaths);
  }else if(usedPaths.has(key)){
   archivePath=uniqueStagedArchivePath(desiredArchivePath,usedPaths);
  }else{
   usedPaths.add(key);
  }
  const normalizedPath=normalizeArchivePath(archivePath);
  if(conflictPolicy!=="inspect")assertQualityMediaSize(pack,normalizedPath,data.length);
  const resource={id:crypto.randomUUID(),archivePath,normalizedPath,size:data.length,compressedSize:0,method:0,crc:crc32(data),extra:true,data,manifestEntry:null,hash};
  const extra={archivePath,data,name:file.name,hash,size:data.length};
  staged.push({resource,extra});
  if(!preserveRelativePaths)hashLookup.set(hash,resource);
  inputResults.push({file,resource,reused:false});
 }
 if(conflictPolicy==="inspect"){
  return {files:selectedFiles.length,requiresDecision:conflicts.length>0,conflicts:conflicts.map(conflict=>({
   index:conflict.index,path:conflict.path,fileName:conflict.file.name,canReplace:conflict.canReplace,reason:conflict.reason
  }))};
 }
 if(conflictPolicy==="replace"&&replacements.some(entry=>!entry.resource||SYSTEM_RESOURCE_PATHS.has(entry.path.toLowerCase()))){
  throw Error("Пакетная замена отменена: один из целевых ресурсов нельзя заменить.");
 }
 const wasExtraResources=Array.isArray(pack.extraResources);
 const wasManifestEntries=Array.isArray(pack.model.manifest?.entries);
 const wasDirty=pack.dirty;
 const resourceStart=(pack.model.resources||[]).length;
 const extraStart=(pack.extraResources||[]).length;
 const manifestStart=(pack.model.manifest?.entries||[]).length;
 const replacedResources=[];
 let createdFilesNode=false,filesNode=pack.model.manifest?.node||null;
 try{
  for(const replacement of replacements){
   await replaceArchiveResource(pack,{resource:replacement.resource,status:"unused"},replacement.file);
   replacedResources.push(replacement.resource);
  }
  if(staged.length){
   pack.model.resources=pack.model.resources||[];
   pack.extraResources=pack.extraResources||[];
   pack.model.manifest=pack.model.manifest||{entries:[],node:null};
   pack.model.manifest.entries=pack.model.manifest.entries||[];
   if(!filesNode){
    filesNode=pack.model.sourceDocument.createElementNS(pack.model.namespace,"files");
    pack.model.sourceDocument.documentElement.appendChild(filesNode);
    pack.model.manifest.node=filesNode;
    createdFilesNode=true;
   }
   for(const item of staged){
    const {resource,extra}=item;
    const node=pack.model.sourceDocument.createElementNS(pack.model.namespace,"file");
    node.setAttribute("name",resource.archivePath);
    node.setAttribute("hash",resource.hash);
    filesNode.appendChild(node);
    const manifestEntry={name:resource.archivePath,normalizedPath:resource.normalizedPath,hash:resource.hash,attributes:{name:resource.archivePath,hash:resource.hash},sourceNode:node};
    resource.manifestEntry=manifestEntry;
    pack.model.resources.push(resource);
    pack.extraResources.push(extra);
    pack.model.manifest.entries.push(manifestEntry);
   }
  }
  if(staged.length||replacements.length)pack.dirty=true;
 }catch(error){
  for(const resource of [...replacedResources].reverse()){
   try{restoreLastResourceReplacement(pack,{resource})}catch{}
  }
  for(const item of staged)item.resource.manifestEntry?.sourceNode?.remove();
  pack.model.resources?.splice(resourceStart);
  pack.extraResources?.splice(extraStart);
  pack.model.manifest?.entries?.splice(manifestStart);
  if(createdFilesNode){filesNode.remove();pack.model.manifest.node=null}
  if(!wasExtraResources)delete pack.extraResources;
  if(!wasManifestEntries&&pack.model.manifest)delete pack.model.manifest.entries;
  pack.dirty=wasDirty;
  throw error;
 }
 const added=staged.map(item=>item.resource);
 const replaced=replacements.map(item=>item.resource);
 const skipped=inputResults.filter(item=>item.skipped).length;
 const reused=inputResults.filter(item=>item.reused).length;
 return {
  files:selectedFiles.length,added,replaced,skipped,reused,
  resources:inputResults.map(item=>item.resource),results:inputResults
 };
}

function pathKey(path){return normalizeResourceReference(path).toLowerCase()}

function renameArchiveResource(pack,item,targetPath){
 if(!pack?.model||!item?.resource||item.missing||item.isDirectory||item.status==="system"){
  throw Error("Выберите обычный физический ресурс, который можно переименовать.");
 }
 const resource=item.resource;
 const oldPath=normalizeResourceReference(resource.normalizedPath);
 const oldKey=pathKey(oldPath);
 const destinationParts=cleanImportPath(targetPath);
 const archivePath=encodeArchivePath(destinationParts.join("/"));
 const newPath=normalizeArchivePath(archivePath);
 const newKey=pathKey(newPath);
 if(!newPath||newPath.endsWith("/"))throw Error("Укажите путь к файлу, а не к папке.");
 if(extensionOf(oldPath)!==extensionOf(newPath))throw Error("При переименовании/перемещении нельзя менять расширение: bytes файла остаются без изменений.");
 if(newKey===oldKey)return {resource,path:oldPath,newPath:oldPath,unchanged:true,updatedReferences:0};
 const sourcePath=resource.renamedFrom
  ?normalizeResourceReference(resource.renamedFrom)
  :(!resource.extra?normalizeResourceReference(resource.entry?.name||oldPath):"");
 const sourceKey=sourcePath?pathKey(sourcePath):"";
 const restoreSourcePath=!!(resource.renamedFrom&&sourceKey===newKey);
 const finalArchivePath=restoreSourcePath?(resource.entry?.rawName||resource.entry?.name||archivePath):archivePath;
 const finalPath=restoreSourcePath?normalizeResourceReference(resource.entry?.name||sourcePath):newPath;
 const allowedExistingKeys=new Set([oldKey,sourceKey].filter(Boolean));
 for(const entry of pack.zip?.entries||[]){
  const key=pathKey(entry.name);
  if(key===newKey&&!allowedExistingKeys.has(key))throw Error("В пакете уже существует файл по этому пути: "+newPath);
 }
 for(const extra of pack.extraResources||[]){
  const key=pathKey(extra.archivePath);
  if(key===newKey&&key!==oldKey)throw Error("В пакете уже существует добавленный файл по этому пути: "+newPath);
 }
 for(const other of pack.model.resources||[]){
  if(other===resource)continue;
  if(pathKey(other.normalizedPath)===newKey)throw Error("В Pack Model уже существует ресурс по этому пути: "+newPath);
 }
 for(const entry of pack.model.manifest?.entries||[]){
  if(pathKey(entry.normalizedPath||entry.name)===newKey&&!allowedExistingKeys.has(newKey)){
   throw Error("В manifest уже занято это имя файла: "+newPath);
  }
 }
 if((pack.model.references||[]).some(ref=>pathKey(ref.normalizedPath||ref.rawValue)===newKey&&pathKey(ref.normalizedPath||ref.rawValue)!==oldKey)){
  throw Error("На этот путь уже ссылается другой элемент контента: "+newPath);
 }
 const extraRecord=resource.extra
  ?(pack.extraResources||[]).find(extra=>pathKey(extra.archivePath)===oldKey)
  :null;
 if(resource.extra&&!extraRecord)throw Error("Не найдена запись добавленного ресурса для переименования.");
 const manifestEntry=resource.manifestEntry||(pack.model.manifest?.entries||[]).find(entry=>pathKey(entry.normalizedPath||entry.name)===oldKey)||null;
 const referenceUpdates=[];
 for(const round of pack.model.rounds||[])for(const theme of round.themes||[])for(const question of theme.questions||[])for(const parameter of question.parameters||[]){
  if(parameter.type!=="content")continue;
  for(const contentItem of parameter.value||[]){
   if(!contentItem.isRef||!contentItem.value)continue;
   if(pathKey(resolveResourceReference(contentItem.value,contentItem.type))!==oldKey)continue;
   if(["image","audio","video","html"].includes(contentItem.type)&&mediaTypeFromName(newPath)!==contentItem.type){
    throw Error("Расширение нового пути не соответствует типу используемого ресурса («"+contentItem.type+"»). Измените только имя/папку или сохраните совместимое расширение.");
   }
   referenceUpdates.push({
    item:contentItem,
    oldValue:contentItem.value,
    newValue:resourceReferenceValue({archivePath:finalArchivePath,normalizedPath:finalPath},contentItem.type),
    hadValueAttribute:contentItem.sourceNode?.hasAttribute("value")||false,
    oldValueAttribute:contentItem.sourceNode?.getAttribute("value"),
    oldText:contentItem.sourceNode?.textContent??""
   });
  }
 }
 const logoResolution=resolvePackageLogoResource(pack.model.resources,pack.model.metadata?.logo||"");
 const updatesPackageLogo=logoResolution.resource===resource;
 if(updatesPackageLogo&&mediaTypeFromName(newPath)!=="image")throw Error("Логотип пакета должен оставаться файлом изображения.");
 const newLogoValue=updatesPackageLogo?packageLogoReferenceValue({archivePath:finalArchivePath,normalizedPath:finalPath}):null;
 const oldLogoValue=pack.model.metadata?.logo||"";
 const oldState={
  archivePath:resource.archivePath,
  normalizedPath:resource.normalizedPath,
  renamedFrom:resource.renamedFrom,
  extraArchivePath:extraRecord?.archivePath,
  extraName:extraRecord?.name,
  manifestName:manifestEntry?.name,
  manifestNormalizedPath:manifestEntry?.normalizedPath,
  manifestAttributes:manifestEntry?{...manifestEntry.attributes}:null,
  manifestNodeName:manifestEntry?.sourceNode?.getAttribute("name"),
  manifestPointer:resource.manifestEntry,
  deletedPaths:new Set(pack.deletedResourcePaths||[]),
  dirty:pack.dirty,
  logo:oldLogoValue,
  metadataLogoAttribute:pack.model.metadata?.attributes?.logo,
  rootLogoAttribute:pack.model.sourceDocument.documentElement.getAttribute("logo")
 };
 try{
  if(restoreSourcePath){
   delete resource.renamedFrom;
   pack.deletedResourcePaths?.delete(sourceKey);
  }else if(!resource.extra&&resource.entry){
   resource.renamedFrom=sourcePath||oldPath;
   pack.deletedResourcePaths=pack.deletedResourcePaths||new Set();
   pack.deletedResourcePaths.add(pathKey(resource.renamedFrom));
  }
  resource.archivePath=finalArchivePath;
  resource.normalizedPath=finalPath;
  if(extraRecord){
   extraRecord.archivePath=finalArchivePath;
   extraRecord.name=destinationParts[destinationParts.length-1];
  }
  if(manifestEntry){
   manifestEntry.name=finalArchivePath;
   manifestEntry.normalizedPath=finalPath;
   manifestEntry.attributes={...(manifestEntry.attributes||{}),name:finalArchivePath};
   manifestEntry.sourceNode?.setAttribute("name",finalArchivePath);
   resource.manifestEntry=manifestEntry;
  }
  for(const update of referenceUpdates){
   update.item.value=update.newValue;
   if(update.hadValueAttribute)update.item.sourceNode?.setAttribute("value",update.newValue);
   else if(update.item.sourceNode)update.item.sourceNode.textContent=update.newValue;
   if(update.item.attributes&&Object.prototype.hasOwnProperty.call(update.item.attributes,"value")){
    update.item.attributes.value=update.newValue;
   }
  }
  if(updatesPackageLogo){
   pack.model.metadata.logo=newLogoValue;
   pack.model.metadata.attributes.logo=newLogoValue;
   pack.model.sourceDocument.documentElement.setAttribute("logo",newLogoValue);
  }
  rebuildPackReferences(pack);
  pack.dirty=true;
  return {resource,path:oldPath,newPath:finalPath,archivePath:finalArchivePath,updatedReferences:referenceUpdates.length,updatedPackageLogo:updatesPackageLogo,manifestUpdated:!!manifestEntry,restoredOriginalPath:restoreSourcePath};
 }catch(error){
  resource.archivePath=oldState.archivePath;
  resource.normalizedPath=oldState.normalizedPath;
  if(oldState.renamedFrom===undefined)delete resource.renamedFrom;else resource.renamedFrom=oldState.renamedFrom;
  if(extraRecord){extraRecord.archivePath=oldState.extraArchivePath;extraRecord.name=oldState.extraName}
  resource.manifestEntry=oldState.manifestPointer;
  if(manifestEntry){
   manifestEntry.name=oldState.manifestName;
   manifestEntry.normalizedPath=oldState.manifestNormalizedPath;
   manifestEntry.attributes=oldState.manifestAttributes;
   if(oldState.manifestNodeName===null)manifestEntry.sourceNode?.removeAttribute("name");
   else manifestEntry.sourceNode?.setAttribute("name",oldState.manifestNodeName);
  }
  for(const update of referenceUpdates){
   update.item.value=update.oldValue;
   if(update.hadValueAttribute)update.item.sourceNode?.setAttribute("value",update.oldValueAttribute);
   else if(update.item.sourceNode)update.item.sourceNode.textContent=update.oldText;
   if(update.item.attributes&&Object.prototype.hasOwnProperty.call(update.item.attributes,"value")){
    update.item.attributes.value=update.oldValue;
   }
  }
  pack.deletedResourcePaths=oldState.deletedPaths;
  if(pack.model.metadata){
   pack.model.metadata.logo=oldState.logo;
   if(pack.model.metadata.attributes)pack.model.metadata.attributes.logo=oldState.metadataLogoAttribute;
   if(oldState.rootLogoAttribute===null)pack.model.sourceDocument.documentElement.removeAttribute("logo");
   else pack.model.sourceDocument.documentElement.setAttribute("logo",oldState.rootLogoAttribute);
  }
  pack.dirty=oldState.dirty;
  rebuildPackReferences(pack);
  throw error;
 }
}

async function replaceArchiveResource(pack,item,file){
 if(!pack?.model||!item?.resource||item.missing||item.isDirectory||item.status==="system"){
  throw Error("Выберите обычный физический ресурс, который можно заменить.");
 }
 if(!file||typeof file.arrayBuffer!=="function")throw Error("Не выбран файл для замены.");
 const resource=item.resource;
 const currentExtension=extensionOf(resource.normalizedPath);
 const replacementExtension=extensionOf(file.name);
 if(currentExtension!==replacementExtension){
  throw Error("Расширение файла должно совпадать с расширением ресурса (."+currentExtension+"). Путь внутри пакета при замене не меняется.");
 }
 if(["content.xml","quality.marker"].includes(resource.normalizedPath.toLowerCase()))throw Error("Системные файлы пакета нельзя заменять.");
 assertQualityMediaSize(pack,resource.normalizedPath,file.size);
 const data=new Uint8Array(await file.arrayBuffer());
 const hash=await sha256Hex(data);
 const currentHash=await sha256Hex(await resourceBytes(resource));
 if(currentHash===hash)return {resource,path:resource.normalizedPath,unchanged:true,size:resource.size,hash};
 const manifestEntry=resource.manifestEntry||(pack.model.manifest?.entries||[]).find(entry=>pathKey(entry.normalizedPath||entry.name)===pathKey(resource.normalizedPath))||null;
 const snapshot={
  replacement:resource.replacement,
  size:resource.size,
  compressedSize:resource.compressedSize,
  method:resource.method,
  crc:resource.crc,
  hash:resource.hash,
  manifestPointer:resource.manifestEntry,
  manifestHash:manifestEntry?.hash,
  manifestAttributesHash:manifestEntry?.attributes?.hash,
  manifestHasHash:!!manifestEntry?.attributes&&Object.prototype.hasOwnProperty.call(manifestEntry.attributes,"hash"),
  manifestNodeHash:manifestEntry?.sourceNode?.getAttribute("hash"),
  dirty:pack.dirty
 };
 try{
  resource.replacementHistory=resource.replacementHistory||[];
  resource.replacementHistory.push(snapshot);
  resource.replacement={data,hash,size:data.length,crc:crc32(data),method:0,compressedSize:0,name:file.name};
  resource.size=data.length;
  resource.compressedSize=0;
  resource.method=0;
  resource.crc=resource.replacement.crc;
  resource.hash=hash;
  if(manifestEntry){
   manifestEntry.hash=hash;
   manifestEntry.attributes={...(manifestEntry.attributes||{}),hash};
   manifestEntry.sourceNode?.setAttribute("hash",hash);
   resource.manifestEntry=manifestEntry;
  }
  pack.dirty=true;
  return {resource,path:resource.normalizedPath,oldSize:snapshot.size,size:data.length,hash,manifestUpdated:!!manifestEntry};
 }catch(error){
  resource.replacement=snapshot.replacement;
  if(snapshot.replacement===undefined)delete resource.replacement;
  resource.size=snapshot.size;
  resource.compressedSize=snapshot.compressedSize;
  resource.method=snapshot.method;
  resource.crc=snapshot.crc;
  resource.hash=snapshot.hash;
  resource.manifestEntry=snapshot.manifestPointer;
  if(manifestEntry){
   manifestEntry.hash=snapshot.manifestHash;
   if(snapshot.manifestHasHash)manifestEntry.attributes={...(manifestEntry.attributes||{}),hash:snapshot.manifestAttributesHash};
   else if(manifestEntry.attributes)delete manifestEntry.attributes.hash;
   if(snapshot.manifestNodeHash===null)manifestEntry.sourceNode?.removeAttribute("hash");
   else manifestEntry.sourceNode?.setAttribute("hash",snapshot.manifestNodeHash);
  }
  resource.replacementHistory?.pop();
  pack.dirty=snapshot.dirty;
  throw error;
 }
}

function restoreLastResourceReplacement(pack,item){
 if(!pack?.model||!item?.resource)throw Error("Выберите ресурс, чтобы восстановить его предыдущие bytes.");
 const resource=item.resource;
 const history=resource.replacementHistory||[];
 if(!history.length)throw Error("Для этого ресурса нет сохранённой предыдущей версии.");
 const snapshot=history.pop();
 const manifestEntry=resource.manifestEntry||(pack.model.manifest?.entries||[]).find(entry=>pathKey(entry.normalizedPath||entry.name)===pathKey(resource.normalizedPath))||null;
 resource.replacement=snapshot.replacement;
 if(snapshot.replacement===undefined)delete resource.replacement;
 resource.size=snapshot.size;
 resource.compressedSize=snapshot.compressedSize;
 resource.method=snapshot.method;
 resource.crc=snapshot.crc;
 resource.hash=snapshot.hash;
 resource.manifestEntry=snapshot.manifestPointer||manifestEntry;
 if(manifestEntry){
  manifestEntry.hash=snapshot.manifestHash;
  if(snapshot.manifestHasHash)manifestEntry.attributes={...(manifestEntry.attributes||{}),hash:snapshot.manifestAttributesHash};
  else if(manifestEntry.attributes)delete manifestEntry.attributes.hash;
  if(snapshot.manifestNodeHash===null)manifestEntry.sourceNode?.removeAttribute("hash");
  else if(snapshot.manifestNodeHash!==undefined)manifestEntry.sourceNode?.setAttribute("hash",snapshot.manifestNodeHash);
 }
 pack.dirty=true;
 return {resource,path:resource.normalizedPath,size:resource.size,restoredToOriginal:!resource.replacement,remainingVersions:history.length};
}

function setItemResource(pack,item,resource){
 if(!item.type||item.type==="text")item.type=mediaTypeFromName(resource.archivePath);
 item.value=resourceReferenceValue(resource,item.type);
 item.isRef=true;
 item.sourceNode.removeAttribute("value");
 item.sourceNode.textContent=item.value;
 item.sourceNode.setAttribute("isRef","true");
 item.sourceNode.setAttribute("type",item.type);
 rebuildPackReferences(pack);
 pack.dirty=true;
}
function rebuildPackReferences(pack){
 const refs=[];
 for(const r of pack.model.rounds)for(const t of r.themes)for(const q of t.questions)for(const p of q.parameters)if(p.type==="content")for(const item of p.value)if(item.isRef&&item.value){
  const path=resolveResourceReference(item.value,item.type);
  refs.push({roundId:r.id,themeId:t.id,questionId:q.id,parameterName:p.name,itemId:item.id,rawValue:item.value,normalizedPath:path,resource:findResource(pack,item.value,item.type)});
 }
 pack.model.references=refs;
}
async function objectUrlForResource(resource){const data=await resourceBytes(resource);return URL.createObjectURL(new Blob([data],{type:resourceMimeType(resource.archivePath)}))}
function resourceMimeType(path){const e=extensionOf(path);return {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",avif:"image/avif",bmp:"image/bmp",svg:"image/svg+xml",tif:"image/tiff",tiff:"image/tiff",ico:"image/x-icon",mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",oga:"audio/ogg",opus:"audio/ogg",m4a:"audio/mp4",flac:"audio/flac",aac:"audio/aac",wma:"audio/x-ms-wma",mp4:"video/mp4",m4v:"video/mp4",webm:"video/webm",avi:"video/x-msvideo",mov:"video/quicktime",mkv:"video/x-matroska",mpg:"video/mpeg",mpeg:"video/mpeg","3gp":"video/3gpp",html:"text/html",htm:"text/html"}[e]||"application/octet-stream"}

export async function getArchiveResourceBytes(resource){return new Uint8Array(await resourceBytes(resource))}
export function archiveResourceReferenceValue(resource,type){return resourceReferenceValue(resource,type)}
export async function sha256ResourceBytes(bytes){return sha256Hex(bytes)}
export {addResourceToPack,addResourceFilesToPack,renameArchiveResource,replaceArchiveResource,restoreLastResourceReplacement,setItemResource,rebuildPackReferences,objectUrlForResource,findResource};

