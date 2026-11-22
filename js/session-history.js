import {buildPackModel,normalizeResourceReference} from "./pack-model.js";

function pathKey(path){
 return normalizeResourceReference(path).toLowerCase();
}
function nodeLocator(root,node){
 const positions=[];
 let current=node;
 while(current&&current!==root){
  const parent=current.parentElement;
  if(!parent)return null;
  positions.push(Array.prototype.indexOf.call(parent.children,current));
  current=parent;
 }
 return current===root?positions.reverse().join("."):null;
}
function nodeAtLocator(root,locator){
 if(locator==="")return root;
 let current=root;
 for(const index of String(locator).split(".")){
  current=current?.children?.[Number(index)]||null;
  if(!current)return null;
 }
 return current;
}
function modelEntities(model){
 const entities=[];
 const remember=entity=>{if(entity?.sourceNode)entities.push(entity)};
 const visitParameter=parameter=>{
  remember(parameter);
  if(parameter.type==="content")for(const item of parameter.value||[])remember(item);
  else if(parameter.type==="group")for(const child of parameter.value||[])visitParameter(child);
 };
 for(const round of model.rounds||[]){
  remember(round);
  for(const theme of round.themes||[]){
   remember(theme);
   for(const question of theme.questions||[]){
    remember(question);
    for(const parameter of question.parameters||[])visitParameter(parameter);
   }
  }
 }
 return entities;
}
function captureModelIdBindings(model){
 const root=model.sourceDocument?.documentElement;
 if(!root)return [];
 return modelEntities(model).map(entity=>({
  locator:nodeLocator(root,entity.sourceNode),
  id:entity.id
 })).filter(entry=>entry.locator!==null&&entry.id);
}
function restoreModelIdBindings(model,bindings){
 const root=model.sourceDocument?.documentElement;
 if(!root||!bindings?.length)return;
 const byLocator=new Map();
 for(const entity of modelEntities(model)){
  const locator=nodeLocator(root,entity.sourceNode);
  if(locator!==null)byLocator.set(locator,entity);
 }
 const remap=new Map();
 for(const binding of bindings){
  const entity=byLocator.get(binding.locator);
  if(!entity||!binding.id)continue;
  if(entity.id!==binding.id)remap.set(entity.id,binding.id);
  entity.id=binding.id;
 }
 if(remap.size){
  for(const reference of model.references||[]){
   reference.roundId=remap.get(reference.roundId)||reference.roundId;
   reference.themeId=remap.get(reference.themeId)||reference.themeId;
   reference.questionId=remap.get(reference.questionId)||reference.questionId;
   reference.itemId=remap.get(reference.itemId)||reference.itemId;
  }
 }
}
function serializedDocument(pack){
 const doc=pack?.model?.sourceDocument||pack?.document;
 if(!doc)throw Error("Невозможно сохранить историю: XML-документ пакета отсутствует.");
 return new XMLSerializer().serializeToString(doc);
}
function captureResourceState(resource){
 const sourcePath=resource.extra
  ?null
  :normalizeResourceReference(resource.renamedFrom||resource.entry?.name||resource.normalizedPath);
 return {
  id:resource.id,
  path:normalizeResourceReference(resource.normalizedPath),
  archivePath:resource.archivePath,
  sourcePath,
  renamedFrom:resource.renamedFrom||null,
  extra:!!resource.extra,
  size:resource.size,
  compressedSize:resource.compressedSize,
  method:resource.method,
  crc:resource.crc,
  hash:resource.hash||"",
  replacement:resource.replacement?{...resource.replacement}:null,
  replacementHistory:(resource.replacementHistory||[]).map(entry=>({...entry}))
 };
}
export function capturePackSnapshot(pack){
 if(!pack?.model)throw Error("Сначала откройте пакет.");
 const extraResources=(pack.extraResources||[]).map(extra=>({...extra}));
 return {
  xml:serializedDocument(pack),
  dirty:!!pack.dirty,
  deletedPaths:[...(pack.deletedResourcePaths||[])],
  deletionCount:(pack.resourceDeletionHistory||[]).reduce((sum,entry)=>sum+(entry?.kind==="batch"?(entry.records?.length||0):1),0),
  idBindings:captureModelIdBindings(pack.model),
  extraResources,
  resources:(pack.model.resources||[]).map(captureResourceState)
 };
}
function signature(snapshot){
 return JSON.stringify({
  xml:snapshot.xml,
  dirty:snapshot.dirty,
  deletedPaths:snapshot.deletedPaths,
  idBindings:snapshot.idBindings,
  extras:snapshot.extraResources.map(extra=>({
   path:extra.archivePath,
   hash:extra.hash||"",
   size:extra.size??extra.data?.length??0
  })),
  resources:snapshot.resources.map(resource=>({
   id:resource.id,path:resource.path,archivePath:resource.archivePath,
   sourcePath:resource.sourcePath,renamedFrom:resource.renamedFrom,
   extra:resource.extra,size:resource.size,compressedSize:resource.compressedSize,
   method:resource.method,crc:resource.crc,hash:resource.hash,
   replacementHash:resource.replacement?.hash||"",
   replacementSize:resource.replacement?.size??0,
   replacementHistory:resource.replacementHistory.map(entry=>({
    hash:entry.hash||"",
    size:entry.size??0,
    replacementHash:entry.replacement?.hash||""
   }))
  }))
 });
}
function rebindResources(model,zipEntries,snapshot){
 const sourceByPath=new Map(model.resources.map(resource=>[pathKey(resource.normalizedPath),resource]));
 const manifestByPath=new Map((model.manifest.entries||[]).map(entry=>[pathKey(entry.normalizedPath||entry.name),entry]));
 const extrasByPath=new Map(snapshot.extraResources.map(extra=>[pathKey(extra.archivePath),extra]));
 const resources=[];
 for(const state of snapshot.resources){
  let resource;
  if(state.extra){
   const extra=extrasByPath.get(pathKey(state.path));
   if(!extra)throw Error("Не удалось восстановить импортированный ресурс: "+state.path);
   resource={
    id:state.id,
    archivePath:state.archivePath,
    normalizedPath:state.path,
    size:state.size,
    compressedSize:state.compressedSize,
    method:state.method,
    crc:state.crc,
    extra:true,
    data:extra.data,
    hash:state.hash
   };
  }else{
   resource=sourceByPath.get(pathKey(state.sourcePath));
   if(!resource)throw Error("Не удалось привязать исходную ZIP-запись для ресурса: "+state.sourcePath);
   resource.id=state.id;
   resource.archivePath=state.archivePath;
   resource.normalizedPath=state.path;
   if(state.renamedFrom)resource.renamedFrom=state.renamedFrom;
   else delete resource.renamedFrom;
  }
  resource.size=state.size;
  resource.compressedSize=state.compressedSize;
  resource.method=state.method;
  resource.crc=state.crc;
  resource.hash=state.hash;
  if(state.replacement)resource.replacement={...state.replacement};
  else delete resource.replacement;
  const manifestEntry=manifestByPath.get(pathKey(state.path))||null;
  resource.manifestEntry=manifestEntry;
  if(state.replacementHistory.length){
   resource.replacementHistory=state.replacementHistory.map(entry=>({...entry,manifestPointer:manifestEntry}));
  }else delete resource.replacementHistory;
  resources.push(resource);
 }
 model.resources=resources;
 const byPath=new Map(resources.map(resource=>[pathKey(resource.normalizedPath),resource]));
 model.references=(model.references||[]).map(reference=>({
  ...reference,
  resource:byPath.get(pathKey(reference.normalizedPath))||null
 }));
 return model;
}
export function restorePackSnapshot(pack,snapshot){
 if(!pack?.zip)throw Error("Невозможно восстановить историю: ZIP-архив пакета отсутствует.");
 const document=new DOMParser().parseFromString(snapshot.xml,"application/xml");
 if(document.querySelector("parsererror"))throw Error("Сохранённое состояние истории содержит некорректный XML.");
 const model=buildPackModel(document,pack.zip.entries);
 restoreModelIdBindings(model,snapshot.idBindings);
 rebindResources(model,pack.zip.entries,snapshot);
 pack.document=document;
 pack.xmlText=snapshot.xml;
 pack.model=model;
 pack.extraResources=snapshot.extraResources.map(extra=>({...extra}));
 pack.deletedResourcePaths=new Set(snapshot.deletedPaths);
 pack.resourceDeletionHistory=snapshot.deletionCount?[{kind:"batch",records:Array.from({length:snapshot.deletionCount},()=>({}))}]:[];
 pack.dirty=snapshot.dirty;
 return pack;
}

export class UndoRedoHistory{
 constructor(limit=40){
  this.limit=limit;
  this.undoStack=[];
  this.redoStack=[];
 }
 reset(){
  this.undoStack=[];
  this.redoStack=[];
 }
 begin(pack){
  return capturePackSnapshot(pack);
 }
 commit(pack,before,label="Изменение пакета"){
  if(!before||!pack?.model)return false;
  const after=capturePackSnapshot(pack);
  if(signature(before)===signature(after))return false;
  this.undoStack.push({label,before,after});
  if(this.undoStack.length>this.limit)this.undoStack.splice(0,this.undoStack.length-this.limit);
  this.redoStack=[];
  return true;
 }
 restore(pack,snapshot){
  return restorePackSnapshot(pack,snapshot);
 }
 undo(pack){
  const entry=this.undoStack.pop();
  if(!entry)return null;
  restorePackSnapshot(pack,entry.before);
  this.redoStack.push(entry);
  return {label:entry.label};
 }
 redo(pack){
  const entry=this.redoStack.pop();
  if(!entry)return null;
  restorePackSnapshot(pack,entry.after);
  this.undoStack.push(entry);
  return {label:entry.label};
 }
 markSaved(pack){
  if(!pack?.model)return;
  const saved=capturePackSnapshot(pack);
  if(this.undoStack.length)this.undoStack[this.undoStack.length-1].after=saved;
 }
 get canUndo(){return this.undoStack.length>0}
 get canRedo(){return this.redoStack.length>0}
 get undoLabel(){return this.undoStack[this.undoStack.length-1]?.label||""}
 get redoLabel(){return this.redoStack[this.redoStack.length-1]?.label||""}
}
