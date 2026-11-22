import {normalizeResourceReference,resolvePackageLogoResource} from "./pack-model.js";
import {ZipWriter} from "./zip.js";
import {createSafeHtmlPreview} from "./html-preview.js";

const SYSTEM_FILES=new Set(["content.xml","quality.marker"]);
const TEXT_EXTENSIONS=new Set(["txt","xml","json","csv","md","css","js","log","ini","yaml","yml"]);
const IMAGE_EXTENSIONS=new Set(["png","jpg","jpeg","gif","webp","avif","bmp","svg","tif","tiff","ico"]);
const AUDIO_EXTENSIONS=new Set(["mp3","wav","ogg","oga","opus","m4a","flac","aac","wma"]);
const VIDEO_EXTENSIONS=new Set(["mp4","webm","avi","mov","mkv","m4v","mpg","mpeg","3gp"]);

function extensionOf(path){
 const match=String(path).toLowerCase().match(/\.([^.\/]+)$/);
 return match?match[1]:"";
}
function pathKey(path){return normalizeResourceReference(path).toLowerCase()}
function categoryOf(path,isDirectory=false){
 if(isDirectory)return "folder";
 const ext=extensionOf(path);
 if(IMAGE_EXTENSIONS.has(ext))return "image";
 if(AUDIO_EXTENSIONS.has(ext))return "audio";
 if(VIDEO_EXTENSIONS.has(ext))return "video";
 if(ext==="html"||ext==="htm")return "html";
 if(TEXT_EXTENSIONS.has(ext))return "text";
 return "binary";
}
function basename(path){
 const clean=String(path).replace(/[\\/]+$/,"");
 return clean.slice(clean.lastIndexOf("/")+1)||clean;
}
function addFolderPath(set,path){
 const parts=String(path).split("/").filter(Boolean);
 for(let i=1;i<parts.length;i++)set.add(parts.slice(0,i).join("/"));
}

function describeUsage(pack,ref){
 const round=pack.model.rounds.find(x=>x.id===ref.roundId);
 const theme=round?.themes.find(x=>x.id===ref.themeId);
 const question=theme?.questions.find(x=>x.id===ref.questionId);
 const questionIndex=theme?theme.questions.indexOf(question):-1;
 const roundLabel=round?"Раунд "+(round.order+1)+" «"+(round.name||"без названия")+"»":"Раунд";
 const themeLabel=theme?"тема «"+(theme.name||"без названия")+"»":"тема";
 const questionLabel=question?"вопрос №"+(questionIndex+1):"вопрос";
 return [roundLabel,themeLabel,questionLabel,ref.parameterName?"параметр «"+ref.parameterName+"»":""].filter(Boolean).join(" → ");
}

export function buildArchiveInventory(pack){
 if(!pack?.zip?.entries||!pack?.model)throw Error("Пакет для проводника не открыт.");
 const deletedPaths=new Set([...(pack.deletedResourcePaths||[])].map(path=>pathKey(path)));
 const resourcesByPath=new Map((pack.model.resources||[]).map(resource=>[pathKey(resource.normalizedPath),resource]));
 const replacedPaths=new Set((pack.model.resources||[]).filter(resource=>resource.replacement?.data).map(resource=>pathKey(resource.normalizedPath)));
 const originalEntries=pack.zip.entries.filter(entry=>!deletedPaths.has(pathKey(entry.name))&&!replacedPaths.has(pathKey(entry.name)));
 const extraEntries=(pack.extraResources||[]).filter(extra=>!deletedPaths.has(pathKey(extra.archivePath))).map(extra=>{
  const resource=resourcesByPath.get(pathKey(extra.archivePath));
  return {
   name:resource?.normalizedPath||normalizeResourceReference(extra.archivePath),
   rawName:extra.archivePath,
   uncompressedSize:resource?.size??extra.size??extra.data?.length??0,
   compressedSize:resource?.compressedSize??0,
   method:resource?.method??0,
   crc:resource?.crc??0,
   async bytes(){return resource?.replacement?.data||extra.data}
  };
 });
 const renamedEntries=(pack.model.resources||[]).filter(resource=>resource.renamedFrom&&!resource.extra&&resource.entry&&!deletedPaths.has(pathKey(resource.normalizedPath))).map(resource=>({
  name:resource.normalizedPath,
  rawName:resource.archivePath,
  uncompressedSize:resource.size??resource.entry.uncompressedSize??0,
  compressedSize:resource.compressedSize??resource.entry.compressedSize??0,
  method:resource.method??resource.entry.method??0,
  crc:resource.crc??resource.entry.crc??0,
  async bytes(){return resource.replacement?.data||resource.entry.bytes()}
 }));
 const replacedEntries=(pack.model.resources||[]).filter(resource=>resource.replacement?.data&&!resource.extra&&!resource.renamedFrom&&!deletedPaths.has(pathKey(resource.normalizedPath))).map(resource=>({
  name:resource.normalizedPath,
  rawName:resource.archivePath,
  uncompressedSize:resource.size??resource.replacement.size,
  compressedSize:resource.compressedSize??0,
  method:resource.method??0,
  crc:resource.crc??resource.replacement.crc,
  async bytes(){return resource.replacement.data}
 }));
 const zipEntries=[...originalEntries,...extraEntries,...renamedEntries,...replacedEntries];
 const entriesByPath=new Map(zipEntries.map(entry=>[pathKey(entry.name),entry]));
 const manifestByPath=new Map((pack.model.manifest?.entries||[]).map(item=>[pathKey(item.normalizedPath||item.name),item]));
 const usageByPath=new Map();
 for(const ref of pack.model.references||[]){
  const key=pathKey(ref.normalizedPath||ref.rawValue);
  const list=usageByPath.get(key)||[];
  list.push({...ref,label:describeUsage(pack,ref)});
  usageByPath.set(key,list);
 }
 const logo=pack.model.metadata?.logo;
 if(logo){
  const resolvedLogo=resolvePackageLogoResource(pack.model.resources,logo);
  const key=pathKey(resolvedLogo.resource?.normalizedPath||resolvedLogo.normalizedPath);
  if(key){
   const list=usageByPath.get(key)||[];
   if(!list.some(item=>item.kind==="package-logo"))list.push({kind:"package-logo",label:"Логотип пакета"});
   usageByPath.set(key,list);
  }
 }

 const items=zipEntries.map(entry=>{
  const path=normalizeResourceReference(entry.name);
  const key=pathKey(path);
  const isDirectory=String(entry.rawName||entry.name).endsWith("/");
  const system=SYSTEM_FILES.has(path.toLowerCase());
  const usages=usageByPath.get(key)||[];
  const resource=resourcesByPath.get(key)||null;
  const manifestEntry=manifestByPath.get(key)||null;
  return {
   id:(entry.rawName||entry.name),
   path,
   name:basename(path),
   entry,
   resource,
   isDirectory,
   kind:categoryOf(path,isDirectory),
   status:system||isDirectory?"system":usages.length?"used":"unused",
   statusLabel:system?"Системный":isDirectory?"Папка":usages.length?"Используется":"Не используется",
   size:entry.uncompressedSize,
   compressedSize:entry.compressedSize,
   compressionMethod:entry.method,
   crc:entry.crc,
   manifest:!!manifestEntry,
   manifestEntry,
   usages,
   usageCount:usages.length,
   missing:false,
   source:resource?.replacement?(resource?.renamedFrom?"Перемещён и заменён в сессии":"Заменён в сессии"):resource?.renamedFrom?"Перемещён в сессии":resource?.extra?"Добавлен в сессию":"Исходный ZIP"
  };
 }).sort((a,b)=>a.path.localeCompare(b.path,"ru",{numeric:true,sensitivity:"base"}));

 const missingByPath=new Map();
 for(const [key,usages] of usageByPath){
  if(entriesByPath.has(key))continue;
  const sample=usages[0];
  const path=normalizeResourceReference(sample?.normalizedPath||sample?.rawValue||key);
  missingByPath.set(key,{
   id:"missing:"+key,
   path,
   name:basename(path),
   entry:null,
   resource:null,
   isDirectory:false,
   kind:categoryOf(path),
   status:"missing",
   statusLabel:"Отсутствует",
   size:null,
   compressedSize:null,
   compressionMethod:null,
   crc:null,
   manifest:manifestByPath.has(key),
   manifestEntry:manifestByPath.get(key)||null,
   usages,
   usageCount:usages.length,
   missing:true
  });
 }
 const missingItems=[...missingByPath.values()].sort((a,b)=>a.path.localeCompare(b.path,"ru",{numeric:true,sensitivity:"base"}));
 const folders=new Set([""]);
 for(const item of [...items,...missingItems]){
  if(item.isDirectory){
   const directoryPath=item.path.endsWith("/")?item.path.slice(0,-1):item.path;
   if(directoryPath){folders.add(directoryPath);addFolderPath(folders,directoryPath)}
  }else addFolderPath(folders,item.path);
 }
 return {
  items:[...items,...missingItems],
  folders:[...folders].sort((a,b)=>a.localeCompare(b,"ru",{numeric:true,sensitivity:"base"})),
  stats:{
   entries:zipEntries.length,
   originalEntries:originalEntries.length,
   addedInSession:extraEntries.length+renamedEntries.length,
   files:items.filter(x=>!x.isDirectory).length,
   directories:items.filter(x=>x.isDirectory).length,
   used:items.filter(x=>x.status==="used").length,
   unused:items.filter(x=>x.status==="unused").length,
   missing:missingItems.length,
   system:items.filter(x=>x.status==="system"&&!x.isDirectory).length
  }
 };
}

function mimeType(path){
 const ext=extensionOf(path);
 return {
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",avif:"image/avif",bmp:"image/bmp",svg:"image/svg+xml",tif:"image/tiff",tiff:"image/tiff",ico:"image/x-icon",
  mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",oga:"audio/ogg",opus:"audio/ogg",m4a:"audio/mp4",flac:"audio/flac",aac:"audio/aac",wma:"audio/x-ms-wma",
  mp4:"video/mp4",m4v:"video/mp4",webm:"video/webm",avi:"video/x-msvideo",mov:"video/quicktime",mkv:"video/x-matroska",mpg:"video/mpeg",mpeg:"video/mpeg","3gp":"video/3gpp",
  html:"text/html",htm:"text/html",txt:"text/plain",xml:"application/xml",json:"application/json",css:"text/css",js:"text/javascript"
 }[ext]||"application/octet-stream";
}

export async function renderArchivePreview(item,host,pack=null){
 host.replaceChildren();
 if(!item||item.missing){
  const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Физический файл отсутствует в ZIP. Проверьте ссылку и восстановите ресурс.";host.appendChild(message);return ()=>{};
 }
 if(item.isDirectory){
  const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Это папка, предпросмотр не требуется.";host.appendChild(message);return ()=>{};
 }
 const kind=item.kind,ext=extensionOf(item.path);
 if(kind==="html"){
  const resource=item.resource||{archivePath:item.path,normalizedPath:item.path,entry:item.entry};
  const preview=await createSafeHtmlPreview(pack,{resource,basePath:item.path,title:"Изолированный предпросмотр HTML ресурса"});
  host.append(preview.container);
  return ()=>{};
 }
 const bytes=await item.entry.bytes();
 if(kind==="binary"){
  const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Для этого формата встроенный предпросмотр не поддерживается. Файл можно скачать.";host.appendChild(message);return ()=>{};
 }
 if(kind==="text"){
  const text=new TextDecoder("utf-8").decode(bytes);
  const pre=document.createElement("pre");pre.className="resource-text-preview";
  pre.textContent=text.length>160000?text.slice(0,160000)+"\n\n[Предпросмотр сокращён до 160 000 символов]":text;
  host.appendChild(pre);return ()=>{};
 }
 const url=URL.createObjectURL(new Blob([bytes],{type:mimeType(item.path)}));
 if(kind==="image"){
  const img=document.createElement("img");img.className="resource-image-preview";img.src=url;img.alt=item.name;host.appendChild(img);
 }else if(kind==="audio"){
  const audio=document.createElement("audio");audio.controls=true;audio.preload="none";audio.src=url;host.appendChild(audio);
 }else if(kind==="video"){
  const video=document.createElement("video");video.controls=true;video.preload="metadata";video.src=url;host.appendChild(video);
 }else if(kind==="html"){
  const frame=document.createElement("iframe");frame.className="resource-html-preview";frame.title="Изолированный предпросмотр HTML";frame.setAttribute("sandbox","");frame.referrerPolicy="no-referrer";frame.src=url;host.appendChild(frame);
 }
 return ()=>URL.revokeObjectURL(url);
}

export async function downloadArchiveEntry(item){
 if(!item?.entry||item.missing||item.isDirectory)throw Error("Выберите существующий файл.");
 const bytes=await item.entry.bytes();
 const url=URL.createObjectURL(new Blob([bytes],{type:mimeType(item.path)}));
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=item.name||"archive-file";
 document.body.appendChild(anchor);
 anchor.click();
 anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export async function buildArchiveSelectionZip(items){
 const writer=new ZipWriter();
 const written=new Set();
 let count=0;
 for(const item of items||[]){
  if(!item?.entry||item.missing||item.isDirectory)continue;
  const key=pathKey(item.path);
  if(written.has(key))continue;
  const bytes=await item.entry.bytes();
  writer.add(item.path,bytes,{method:8});
  written.add(key);count++;
 }
 if(!count)throw Error("Не выбрано ни одного существующего файла.");
 return {bytes:await writer.build(),count};
}

export async function downloadArchiveEntries(items,{fileName="si-game-resources.zip"}={}){
 const archive=await buildArchiveSelectionZip(items);
 const url=URL.createObjectURL(new Blob([archive.bytes],{type:"application/zip"}));
 const anchor=document.createElement("a");
 anchor.href=url;
 anchor.download=fileName.endsWith(".zip")?fileName:fileName+".zip";
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
 return {count:archive.count,size:archive.bytes.length,fileName:anchor.download};
}

export function canAssignArchiveItem(item,targetItem){
 if(!item?.resource||item.missing||item.isDirectory)return false;
 if(!["image","audio","video","html"].includes(item.kind))return false;
 const targetType=String(targetItem?.type||"text").toLowerCase();
 return !targetType||targetType==="text"||targetType===item.kind;
}

function currentUsageCount(pack,path){
 const key=pathKey(path);
 let count=(pack.model.references||[]).filter(ref=>pathKey(ref.normalizedPath||ref.rawValue)===key).length;
 const logo=resolvePackageLogoResource(pack.model.resources,pack.model.metadata?.logo||"");
 if(logo.resource&&pathKey(logo.resource.normalizedPath)===key)count++;
 return count;
}

export function deleteArchiveResource(pack,item){
 if(!pack?.model||!item?.resource||item.missing||item.isDirectory)throw Error("Выберите существующий ресурс архива.");
 const path=normalizeResourceReference(item.resource.normalizedPath);
 const key=pathKey(path);
 if(SYSTEM_FILES.has(path.toLowerCase()))throw Error("Системный файл пакета нельзя удалить.");
 const usageCount=currentUsageCount(pack,path);
 if(usageCount>0)throw Error("Ресурс используется в "+usageCount+" месте(ах). Сначала замените или отвяжите все ссылки.");
 const resourceIndex=pack.model.resources.findIndex(resource=>pathKey(resource.normalizedPath)===key);
 if(resourceIndex<0)throw Error("Ресурс уже удалён из рабочей копии.");
 const resource=pack.model.resources[resourceIndex];
 const manifestIndex=(pack.model.manifest.entries||[]).findIndex(entry=>pathKey(entry.normalizedPath||entry.name)===key);
 const manifestEntry=manifestIndex>=0?pack.model.manifest.entries[manifestIndex]:null;
 const manifestParent=manifestEntry?.sourceNode?.parentNode||null;
 const manifestNextSibling=manifestEntry?.sourceNode?.nextSibling||null;
 if(manifestEntry){
  pack.model.manifest.entries.splice(manifestIndex,1);
  manifestEntry.sourceNode?.remove();
 }
 pack.model.resources.splice(resourceIndex,1);
 const extraIndex=(pack.extraResources||[]).findIndex(extra=>pathKey(extra.archivePath)===key);
 const extra=extraIndex>=0?pack.extraResources[extraIndex]:null;
 if(extra)pack.extraResources.splice(extraIndex,1);
 pack.deletedResourcePaths=pack.deletedResourcePaths||new Set();
 pack.deletedResourcePaths.add(key);
 const record={path,key,resource,resourceIndex,manifestEntry,manifestIndex,manifestParent,manifestNextSibling,extra,extraIndex};
 pack.resourceDeletionHistory=pack.resourceDeletionHistory||[];
 pack.resourceDeletionHistory.push(record);
 pack.dirty=true;
 return {path,remainingDeleted:pack.resourceDeletionHistory.length};
}

export function deleteUnusedArchiveResources(pack,items){
 if(!pack?.model)throw Error("Сначала откройте пакет.");
 const unique=new Map();
 for(const item of items||[]){
  if(!item?.resource||item.missing||item.isDirectory)throw Error("В пакетную очистку можно включать только существующие файлы.");
  const path=normalizeResourceReference(item.resource.normalizedPath);
  const key=pathKey(path);
  if(unique.has(key))continue;
  if(SYSTEM_FILES.has(path.toLowerCase()))throw Error("Системный файл пакета нельзя удалить: "+path);
  const usageCount=currentUsageCount(pack,path);
  if(usageCount>0)throw Error("Очистка отменена: ресурс "+path+" используется в "+usageCount+" месте(ах). Ни один файл не удалён.");
  const resourceIndex=pack.model.resources.findIndex(resource=>resource===item.resource||pathKey(resource.normalizedPath)===key);
  if(resourceIndex<0)throw Error("Ресурс уже удалён из рабочей копии: "+path);
  const resource=pack.model.resources[resourceIndex];
  const manifestIndex=(pack.model.manifest?.entries||[]).findIndex(entry=>pathKey(entry.normalizedPath||entry.name)===key);
  const manifestEntry=manifestIndex>=0?pack.model.manifest.entries[manifestIndex]:null;
  const extraIndex=(pack.extraResources||[]).findIndex(extra=>pathKey(extra.archivePath)===key);
  const extra=extraIndex>=0?pack.extraResources[extraIndex]:null;
  unique.set(key,{
   path,key,resource,resourceIndex,manifestEntry,manifestIndex,
   manifestParent:manifestEntry?.sourceNode?.parentNode||null,
   manifestNextSibling:manifestEntry?.sourceNode?.nextSibling||null,
   extra,extraIndex
  });
 }
 const records=[...unique.values()];
 if(!records.length)throw Error("Не выбрано ни одного неиспользуемого файла.");
 for(const record of [...records].sort((a,b)=>b.resourceIndex-a.resourceIndex)){
  pack.model.resources.splice(record.resourceIndex,1);
 }
 for(const record of records.filter(record=>record.manifestEntry).sort((a,b)=>b.manifestIndex-a.manifestIndex)){
  pack.model.manifest.entries.splice(record.manifestIndex,1);
  record.manifestEntry.sourceNode?.remove();
 }
 for(const record of records.filter(record=>record.extra).sort((a,b)=>b.extraIndex-a.extraIndex)){
  pack.extraResources.splice(record.extraIndex,1);
 }
 pack.deletedResourcePaths=pack.deletedResourcePaths||new Set();
 for(const record of records)pack.deletedResourcePaths.add(record.key);
 const transaction={kind:"batch",records,count:records.length};
 pack.resourceDeletionHistory=pack.resourceDeletionHistory||[];
 pack.resourceDeletionHistory.push(transaction);
 pack.dirty=true;
 return {count:records.length,paths:records.map(record=>record.path),remainingDeleted:pack.resourceDeletionHistory.length};
}

export function restoreLastDeletedArchiveResource(pack){
 const history=pack?.resourceDeletionHistory;
 if(!history?.length)throw Error("Нет удалённых ресурсов для восстановления.");
 const transaction=history.pop();
 const records=transaction?.kind==="batch"?transaction.records:[transaction];
 for(const record of [...records].sort((a,b)=>a.resourceIndex-b.resourceIndex)){
  pack.deletedResourcePaths?.delete(record.key);
  pack.model.resources.splice(Math.min(record.resourceIndex,pack.model.resources.length),0,record.resource);
  if(record.manifestEntry){
   pack.model.manifest.entries.splice(Math.min(record.manifestIndex,pack.model.manifest.entries.length),0,record.manifestEntry);
   if(record.manifestParent){
    const next=record.manifestNextSibling&&record.manifestNextSibling.parentNode===record.manifestParent?record.manifestNextSibling:null;
    record.manifestParent.insertBefore(record.manifestEntry.sourceNode,next);
   }
  }
  if(record.extra){
   pack.extraResources=pack.extraResources||[];
   pack.extraResources.splice(Math.min(record.extraIndex,pack.extraResources.length),0,record.extra);
  }
 }
 pack.dirty=true;
 return {path:records[0]?.path||"",restoredCount:records.length,paths:records.map(record=>record.path),remainingDeleted:history.length,wasBatch:transaction?.kind==="batch"};
}
