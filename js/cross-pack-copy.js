import {buildPackModel,normalizeResourceReference,localName,first} from "./pack-model.js";
import {getArchiveResourceBytes,archiveResourceReferenceValue,findResource,rebuildPackReferences,sha256ResourceBytes} from "./resource-manager.js";
import {crc32} from "./zip.js";

function findEntityNode(pack,kind,id){
 if(kind==="round")return pack.model.rounds.find(item=>item.id===id)?.sourceNode||null;
 if(kind==="theme"){
  for(const round of pack.model.rounds)for(const theme of round.themes)if(theme.id===id)return theme.sourceNode;
 }
 if(kind==="question"){
  for(const round of pack.model.rounds)for(const theme of round.themes)for(const question of theme.questions)if(question.id===id)return question.sourceNode;
 }
 return null;
}
function findTargetEntity(pack,kind,id){
 if(kind==="round")return pack.model.rounds.find(item=>item.id===id)||null;
 if(kind==="theme"){
  for(const round of pack.model.rounds)for(const theme of round.themes)if(theme.id===id)return theme;
 }
 return null;
}
function encodePath(path){return String(path).split("/").map(segment=>encodeURIComponent(segment)).join("/")}
function pathKey(path){return normalizeResourceReference(path).toLowerCase()}
function safeArchivePath(path){
 const normalized=normalizeResourceReference(path);
 const parts=normalized.split("/");
 if(!normalized||normalized.startsWith("/")||parts.some(part=>!part||part==="."||part===".."||part.includes(":")||/[\x00-\x1f]/.test(part))){
  throw Error("Небезопасный путь медиа-ресурса: "+path);
 }
 return normalized;
}
function uniquePath(desired,occupied){
 const normalized=safeArchivePath(desired);
 if(!occupied.has(pathKey(normalized))){occupied.add(pathKey(normalized));return normalized}
 const slash=normalized.lastIndexOf("/");
 const directory=slash>=0?normalized.slice(0,slash+1):"";
 const file=slash>=0?normalized.slice(slash+1):normalized;
 const dot=file.lastIndexOf(".");
 const base=dot>0?file.slice(0,dot):file;
 const extension=dot>0?file.slice(dot):"";
 for(let index=2;index<10000;index++){
  const candidate=directory+base+"_"+index+extension;
  if(!occupied.has(pathKey(candidate))){occupied.add(pathKey(candidate));return candidate}
 }
 throw Error("Не удалось подобрать свободный путь для ресурса: "+normalized);
}
function collectReferenceItems(node){
 return [node,...node.querySelectorAll("*")].filter(item=>
  localName(item)==="item"&&/^true$/i.test(item.getAttribute("isRef")||"")&&
  String(item.hasAttribute("value")?item.getAttribute("value"):item.textContent||"").trim()
 );
}
function collectModelIds(model){
 const ids=new Map();
 const save=item=>{if(item?.sourceNode&&item.id)ids.set(item.sourceNode,item.id)};
 const saveInfo=info=>{
  if(!info)return;
  save(info);
  for(const key of ["authors","sources","comments","showmanComments"])for(const item of info[key]||[])save(item);
 };
 const saveParameter=parameter=>{
  save(parameter);
  if(parameter.type==="content")for(const item of parameter.value||[])save(item);
  else if(parameter.type==="group")for(const child of parameter.value||[])saveParameter(child);
  else if(parameter.type==="numberSet")save(parameter.value);
 };
 for(const round of model.rounds||[]){
  save(round);saveInfo(round.info);
  for(const theme of round.themes||[]){
   save(theme);saveInfo(theme.info);
   for(const question of theme.questions||[]){
    save(question);
    for(const parameter of question.parameters||[])saveParameter(parameter);
   }
  }
 }
 return ids;
}
function restoreModelIds(model,ids){
 const restore=item=>{if(item?.sourceNode&&ids.has(item.sourceNode))item.id=ids.get(item.sourceNode)};
 const restoreInfo=info=>{
  if(!info)return;
  restore(info);
  for(const key of ["authors","sources","comments","showmanComments"])for(const item of info[key]||[])restore(item);
 };
 const restoreParameter=parameter=>{
  restore(parameter);
  if(parameter.type==="content")for(const item of parameter.value||[])restore(item);
  else if(parameter.type==="group")for(const child of parameter.value||[])restoreParameter(child);
  else if(parameter.type==="numberSet")restore(parameter.value);
 };
 for(const round of model.rounds||[]){
  restore(round);restoreInfo(round.info);
  for(const theme of round.themes||[]){
   restore(theme);restoreInfo(theme.info);
   for(const question of theme.questions||[]){
    restore(question);
    for(const parameter of question.parameters||[])restoreParameter(parameter);
   }
  }
 }
}
function appendToTarget(target,kind,importedNode,targetId){
 const doc=target.document,namespace=target.model.namespace;
 if(kind==="round"){
  let roundsNode=first(doc.documentElement,"rounds");
  if(!roundsNode){roundsNode=doc.createElementNS(namespace,"rounds");doc.documentElement.appendChild(roundsNode)}
  roundsNode.appendChild(importedNode);
  return;
 }
 const targetEntity=findTargetEntity(target,kind==="theme"?"round":"theme",targetId);
 if(!targetEntity)throw Error((kind==="theme"?"Раунд":"Тема")+" назначения не найден.");
 const containerName=kind==="theme"?"themes":"questions";
 let container=first(targetEntity.sourceNode,containerName);
 if(!container){container=doc.createElementNS(namespace,containerName);targetEntity.sourceNode.appendChild(container)}
 container.appendChild(importedNode);
}
function collectOccupiedPaths(pack){
 const occupied=new Set();
 for(const entry of pack.zip?.entries||[])occupied.add(pathKey(entry.name));
 for(const resource of pack.model.resources||[])occupied.add(pathKey(resource.normalizedPath||resource.archivePath));
 for(const extra of pack.extraResources||[])occupied.add(pathKey(extra.archivePath));
 for(const entry of pack.model.manifest?.entries||[])occupied.add(pathKey(entry.normalizedPath||entry.name));
 for(const path of pack.deletedResourcePaths||[])occupied.add(pathKey(path));
 return occupied;
}
async function findSameBytesResource(pack,bytes,hash,hashCache){
 for(const resource of pack.model.resources||[]){
  if(Number(resource.size)!==bytes.length)continue;
  let existingHash=hashCache.get(resource);
  if(!existingHash){
   const existingBytes=await getArchiveResourceBytes(resource);
   existingHash=await sha256ResourceBytes(existingBytes);
   hashCache.set(resource,existingHash);
  }
  if(existingHash===hash)return resource;
 }
 return null;
}
function appendManifestResource(pack,archivePath,normalizedPath,data,hash){
 let filesNode=pack.model.manifest?.node||first(pack.document.documentElement,"files");
 if(!filesNode){
  filesNode=pack.document.createElementNS(pack.model.namespace,"files");
  pack.document.documentElement.appendChild(filesNode);
 }
 pack.model.manifest=pack.model.manifest||{node:null,entries:[]};
 pack.model.manifest.node=filesNode;
 pack.model.manifest.entries=pack.model.manifest.entries||[];
 const node=pack.document.createElementNS(pack.model.namespace,"file");
 node.setAttribute("name",archivePath);
 node.setAttribute("hash",hash);
 filesNode.appendChild(node);
 const entry={name:archivePath,normalizedPath,hash,attributes:{name:archivePath,hash},sourceNode:node};
 pack.model.manifest.entries.push(entry);
 const name=normalizedPath.slice(normalizedPath.lastIndexOf("/")+1);
 const resource={
  id:crypto.randomUUID(),archivePath,normalizedPath,size:data.length,compressedSize:0,
  method:0,crc:crc32(data),extra:true,data,manifestEntry:entry,hash
 };
 pack.model.resources.push(resource);
 pack.extraResources=pack.extraResources||[];
 pack.extraResources.push({archivePath,data,name,hash,size:data.length});
 return resource;
}

/**
 * Copy one round, theme or question from a source session into a different target session.
 * Only referenced local media is copied; external URLs remain untouched.
 */
export async function copyPackEntityAcross(source,target,{kind,sourceId,targetId=null,selectedThemeIds=null}={}){
 if(!source?.model||!source.document||!source.zip)throw Error("Исходный пакет не готов к копированию.");
 if(!target?.model||!target.document||!target.zip)throw Error("Целевой пакет не готов к копированию.");
 if(source===target)throw Error("Для межпакетного копирования выберите другой открытый пакет.");
 if(!["round","theme","question"].includes(kind))throw Error("Неизвестный тип копируемой сущности.");
 const sourceNode=findEntityNode(source,kind,sourceId);
 if(!sourceNode)throw Error("Исходная сущность больше не существует.");
 const targetContainerKind=kind==="theme"?"round":kind==="question"?"theme":null;
 if(targetContainerKind&&!findTargetEntity(target,targetContainerKind,targetId)){
  throw Error("Не выбрано корректное место назначения в целевом пакете.");
 }

 const clone=sourceNode.cloneNode(true);
 if(kind==="round"&&Array.isArray(selectedThemeIds)){
  const selectedSet=new Set(selectedThemeIds);
  const sourceRound=source.model.rounds.find(item=>item.id===sourceId);
  const sourceThemesContainer=first(sourceNode,"themes");
  const cloneThemesContainer=first(clone,"themes");
  if(!sourceRound||!sourceThemesContainer||!cloneThemesContainer)throw Error("Не удалось сопоставить темы исходного раунда для частичного переноса.");
  const sourceThemeNodes=[...sourceThemesContainer.children].filter(node=>localName(node)==="theme");
  const cloneThemeNodes=[...cloneThemesContainer.children].filter(node=>localName(node)==="theme");
  const modelThemeNodes=sourceRound.themes||[];
  if(sourceThemeNodes.length!==cloneThemeNodes.length||sourceThemeNodes.length!==modelThemeNodes.length){
   throw Error("Структура тем исходного раунда изменилась во время объединения.");
  }
  // Model IDs may be generated when SIQ XML has no theme@id (as in real V2 packs).
  // Match each cloned XML node to its source model entity by DOM position/reference,
  // never by the optional XML id attribute.
  const selectedSourceNodes=new Set(modelThemeNodes.filter(theme=>selectedSet.has(theme.id)).map(theme=>theme.sourceNode));
  if(selectedSourceNodes.size!==selectedSet.size)throw Error("Часть выбранных тем больше не существует в исходном раунде.");
  for(let index=cloneThemeNodes.length-1;index>=0;index--){
   if(!selectedSourceNodes.has(sourceThemeNodes[index]))cloneThemeNodes[index].remove();
  }
 }
 const sourceItems=collectReferenceItems(clone);
 const referencePlans=[];
 const dependencyByPath=new Map();
 for(let index=0;index<sourceItems.length;index++){
  const item=sourceItems[index];
  const value=String(item.hasAttribute("value")?item.getAttribute("value"):item.textContent||"").trim();
  if(/^(?:https?:|data:|blob:)/i.test(value))continue;
  const type=item.getAttribute("type")||"";
  const resource=findResource(source,value,type);
  if(!resource)throw Error("Не найден физический ресурс исходного пакета для ссылки: "+value);
  const key=pathKey(resource.normalizedPath||resource.archivePath);
  dependencyByPath.set(key,resource);
  referencePlans.push({index,item,type,resource,key});
 }

 const occupied=collectOccupiedPaths(target);
 const targetHashCache=new Map();
 const targetResourceBySourcePath=new Map();
 const stagedByHash=new Map();
 const importedResources=[];
 const reusedResources=[];
 for(const [key,sourceResource] of dependencyByPath){
  const bytes=new Uint8Array(await getArchiveResourceBytes(sourceResource));
  const hash=await sha256ResourceBytes(bytes);
  let targetResource=await findSameBytesResource(target,bytes,hash,targetHashCache);
  if(targetResource){
   reusedResources.push({sourcePath:sourceResource.normalizedPath,targetPath:targetResource.normalizedPath,hash});
   targetResourceBySourcePath.set(key,targetResource);
   continue;
  }
  if(stagedByHash.has(hash)){
   targetResource=stagedByHash.get(hash);
   reusedResources.push({sourcePath:sourceResource.normalizedPath,targetPath:targetResource.normalizedPath,hash});
   targetResourceBySourcePath.set(key,targetResource);
   continue;
  }
  const desired=safeArchivePath(sourceResource.normalizedPath||sourceResource.archivePath);
  const normalizedPath=uniquePath(desired,occupied);
  const archivePath=encodePath(normalizedPath);
  const staged={sourceResource,bytes,hash,archivePath,normalizedPath};
  stagedByHash.set(hash,staged);
  targetResourceBySourcePath.set(key,staged);
 }

 const cloneItems=collectReferenceItems(clone);
 if(cloneItems.length!==sourceItems.length)throw Error("Не удалось сопоставить media references скопированной XML-сущности.");
 const usedIds=new Set([target.document.documentElement,...target.document.querySelectorAll("[id]")].map(node=>node.getAttribute?.("id")).filter(Boolean));
 const identityElements=new Set(["round","theme","question","param","item","numberSet","author","source","comment","showmanComment"]);
 for(const node of [clone,...clone.querySelectorAll("*")]){
  if(!node.hasAttribute?.("id")&&!identityElements.has(localName(node)))continue;
  let id=crypto.randomUUID();
  while(usedIds.has(id))id=crypto.randomUUID();
  usedIds.add(id);
  node.setAttribute("id",id);
 }
 for(const plan of referencePlans){
  const mapped=targetResourceBySourcePath.get(plan.key);
  if(!mapped)throw Error("Не удалось сопоставить зависимость медиа: "+plan.resource.normalizedPath);
  const targetPath=mapped.normalizedPath;
  const referenceValue=archiveResourceReferenceValue({archivePath:mapped.archivePath||encodePath(targetPath),normalizedPath:targetPath},plan.type);
  const item=cloneItems[plan.index];
  if(item.hasAttribute("value"))item.setAttribute("value",referenceValue);
  else item.textContent=referenceValue;
 }

 const importedNode=target.document.importNode(clone,true);
 const oldIds=collectModelIds(target.model);
 const oldModel=target.model;
 for(const staged of stagedByHash.values()){
  const resource=appendManifestResource(target,staged.archivePath,staged.normalizedPath,staged.bytes,staged.hash);
  importedResources.push({sourcePath:staged.sourceResource.normalizedPath,targetPath:resource.normalizedPath,hash:staged.hash,size:resource.size});
 }
 appendToTarget(target,kind,importedNode,targetId);
 const rebuilt=buildPackModel(target.document,target.zip.entries);
 restoreModelIds(rebuilt,oldIds);
 oldModel.rounds=rebuilt.rounds;
 oldModel.manifest=rebuilt.manifest;
 oldModel.references=rebuilt.references;
 oldModel.sourceDocument=target.document;
 oldModel.namespace=rebuilt.namespace;
 target.model=oldModel;
 const manifestByPath=new Map((target.model.manifest.entries||[]).map(entry=>[pathKey(entry.normalizedPath||entry.name),entry]));
 for(const resource of target.model.resources||[]){
  resource.manifestEntry=manifestByPath.get(pathKey(resource.normalizedPath||resource.archivePath))||null;
 }
 rebuildPackReferences(target);
 target.dirty=true;
 try{target.xmlText=new XMLSerializer().serializeToString(target.document)}catch{}
 let copiedId=null;
 if(kind==="round")copiedId=target.model.rounds.find(item=>item.sourceNode===importedNode)?.id||null;
 else if(kind==="theme"){
  for(const round of target.model.rounds)copiedId=round.themes.find(item=>item.sourceNode===importedNode)?.id||copiedId;
 }else{
  for(const round of target.model.rounds)for(const theme of round.themes)copiedId=theme.questions.find(item=>item.sourceNode===importedNode)?.id||copiedId;
 }
 if(!copiedId)throw Error("Копия создана в XML, но её модельный ID не найден.");
 return {kind,id:copiedId,importedResources,reusedResources,dependencies:referencePlans.length,sourceName:source.model.metadata.name,targetName:target.model.metadata.name};
}

/**
 * Merge every round from one or more source sessions into a target session.
 * Call inside one target-session history transaction to make the complete merge atomic.
 */
export async function mergePacksIntoTarget(target,sources,selections=null){
 if(!target?.model||!target.document||!target.zip)throw Error("Целевой пакет не готов к объединению.");
 if(!Array.isArray(sources)||!sources.length)throw Error("Выберите хотя бы один исходный пакет.");
 const uniqueSources=[...new Set(sources)];
 if(uniqueSources.length!==sources.length)throw Error("Один и тот же исходный пакет выбран несколько раз.");
 if(uniqueSources.includes(target))throw Error("Целевой пакет нельзя одновременно выбрать как исходный.");
 const summary={sourceCount:uniqueSources.length,sourceNames:[],rounds:0,themes:0,questions:0,dependencies:0,importedResources:[],reusedResources:[]};
 for(const source of uniqueSources){
  if(!source?.model||!source.document||!source.zip)throw Error("Один из исходных пакетов не готов к объединению.");
  summary.sourceNames.push(source.model.metadata.name||source.fileName||"Без названия");
  const sourceRounds=[...source.model.rounds];
  const selectedRounds=selections?.get?.(source)?.rounds||null;
  const selectedThemes=selections?.get?.(source)?.themes||new Map();
  for(const round of sourceRounds){
   if(selectedRounds&&selectedRounds.has(round.id)===false&&!selectedThemes.has(round.id))continue;
   const themeIds=selectedRounds?.has(round.id)?null:[...(selectedThemes.get(round.id)||[])];
   if(themeIds&&themeIds.length===0)continue;
   const copied=await copyPackEntityAcross(source,target,{kind:"round",sourceId:round.id,selectedThemeIds:themeIds});
   summary.rounds++;
   const selectedThemeObjects=themeIds===null
    ? (round.themes||[])
    : (round.themes||[]).filter(theme=>themeIds.includes(theme.id));
   summary.themes+=selectedThemeObjects.length;
   summary.questions+=selectedThemeObjects.reduce((total,theme)=>total+(theme.questions?.length||0),0);
   summary.dependencies+=copied.dependencies;
   summary.importedResources.push(...copied.importedResources);
   summary.reusedResources.push(...copied.reusedResources);
  }
 }
 return summary;
}
