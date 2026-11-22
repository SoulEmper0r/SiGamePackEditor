import {readSiq} from "./siq-reader.js";
import {validatePack} from "./validator.js";
import {writeSiq,downloadSiq} from "./siq-writer.js";
import {copyRound,copyTheme,copyQuestion,deleteRound,deleteTheme,deleteQuestion,moveContentItem} from "./pack-commands.js";
import {copyPackEntityAcross,mergePacksIntoTarget} from "./cross-pack-copy.js";
import {addResourceToPack,addResourceFilesToPack,renameArchiveResource,replaceArchiveResource,restoreLastResourceReplacement,setItemResource,rebuildPackReferences,objectUrlForResource,findResource} from "./resource-manager.js";
import {buildArchiveInventory,renderArchivePreview,downloadArchiveEntry,downloadArchiveEntries,canAssignArchiveItem,deleteArchiveResource,deleteUnusedArchiveResources,restoreLastDeletedArchiveResource} from "./package-explorer.js";
import {packageLogoReferenceValue} from "./pack-model.js";
import {openQuestionPreview} from "./question-preview.js";
import {createSafeHtmlPreview,safeExternalMediaUrl} from "./html-preview.js";
import {getQuestionTypeOptions,getQuestionTypeDescription} from "./question-types.js";
import {getRoundTypeOptions,getRoundTypeDescription} from "./round-types.js";
import {isQualityControlEnabled,qualityPackageLimit,findQualityMediaViolations,formatSigameBytes,qualityMediaTypeLabel} from "./quality-limits.js";
import {SIGAME_MAX_FILENAME_LENGTH,planArchiveFilenameNormalization} from "./filename-normalizer.js";
import {UndoRedoHistory} from "./session-history.js";
import {ZipWriter} from "./zip.js";

const input=document.querySelector("#siqFile"),newPackBtn=document.querySelector("#newPackBtn"),mergePacksBtn=document.querySelector("#mergePacksBtn"),bulkQuestionTypesBtn=document.querySelector("#bulkQuestionTypesBtn"),qualityLimitsBtn=document.querySelector("#qualityLimitsBtn"),exportBtn=document.querySelector("#exportBtn"),undoBtn=document.querySelector("#undoBtn"),redoBtn=document.querySelector("#redoBtn"),checkUpdatesBtn=document.querySelector("#checkUpdatesBtn"),appVersionLabel=document.querySelector("#appVersionLabel"),output=document.querySelector("#output"),details=document.querySelector("#details"),tree=document.querySelector("#tree"),selectionTitle=document.querySelector("#selectionTitle"),selectionInfo=document.querySelector("#selectionInfo"),actions=document.querySelector("#actions"),statusBar=document.querySelector("#statusBar");
const APP_VERSION="1.0.0";
const GITHUB_RELEASES_API="https://api.github.com/repos/SoulEmper0r/SiGamePackEditor/releases/latest";
const GITHUB_RELEASES_PAGE="https://github.com/SoulEmper0r/SiGamePackEditor/releases";
const editorTab=document.querySelector("#editorTab"),resourcesTab=document.querySelector("#resourcesTab"),workspace=document.querySelector(".workspace"),resourceExplorer=document.querySelector("#resourceExplorer"),packTabs=document.querySelector("#packTabs"),packDropZone=document.querySelector("#packDropZone");
const resourceSearch=document.querySelector("#resourceSearch"),resourceFolderFilter=document.querySelector("#resourceFolderFilter"),resourceTypeFilter=document.querySelector("#resourceTypeFilter"),resourceStatusFilter=document.querySelector("#resourceStatusFilter"),resourceSort=document.querySelector("#resourceSort"),resourceSizeMin=document.querySelector("#resourceSizeMin"),resourceSizeMax=document.querySelector("#resourceSizeMax"),resourceSummary=document.querySelector("#resourceSummary"),resourceBulkActions=document.querySelector("#resourceBulkActions"),resourceListCount=document.querySelector("#resourceListCount"),resourceList=document.querySelector("#resourceList"),resourceDetails=document.querySelector("#resourceDetails"),resourceFolderTree=document.querySelector("#resourceFolderTree");
const openedPacks=[];
const undoRedoHistory={
 reset(){current?.history?.reset()},
 begin(pack){return pack?.history?.begin(pack)||null},
 commit(pack,before,label){return pack?.history?.commit(pack,before,label)||false},
 restore(pack,snapshot){return pack?.history?.restore(pack,snapshot)},
 undo(pack){return pack?.history?.undo(pack)||null},
 redo(pack){return pack?.history?.redo(pack)||null},
 markSaved(pack){return pack?.history?.markSaved(pack)},
 get canUndo(){return !!current?.history?.canUndo},
 get canRedo(){return !!current?.history?.canRedo},
 get undoLabel(){return current?.history?.undoLabel||""},
 get redoLabel(){return current?.history?.redoLabel||""}
};
let pendingHistoryEdit=null,pendingHistoryTimer=null;
let current=null,selected=null,activeContentDrag=null,activeView="editor",resourceTargetItem=null,selectedArchivePath="",selectedArchivePaths=new Set(),archivePreviewCleanup=null,archivePreviewToken=0,resourceExpandedFolders=new Set();
function log(s){output.textContent+=s+"\n"}
function compareAppVersions(left,right){
 const parse=value=>{
  const match=/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/i.exec(String(value||"").trim());
  return match?match.slice(1).map(Number):null;
 };
 const a=parse(left),b=parse(right);
 if(!a||!b)throw Error("Не удалось распознать номер версии: "+left+" / "+right);
 for(let index=0;index<3;index++){
  if(a[index]!==b[index])return a[index]>b[index]?1:-1;
 }
 return 0;
}
async function checkForAppUpdates(){
 if(!checkUpdatesBtn)return;
 checkUpdatesBtn.disabled=true;
 checkUpdatesBtn.textContent="Проверяем…";
 if(appVersionLabel)appVersionLabel.textContent=APP_VERSION;
 try{
  const response=await fetch(GITHUB_RELEASES_API,{
   method:"GET",
   headers:{Accept:"application/vnd.github+json"},
   cache:"no-store"
  });
  if(response.status===404){
   statusBar.textContent="Релизов пока нет. Текущая версия: "+APP_VERSION+".";
   return;
  }
  if(!response.ok)throw Error("GitHub ответил HTTP "+response.status+".");
  const release=await response.json();
  const latestVersion=String(release.tag_name||"").replace(/^v/i,"");
  if(!latestVersion)throw Error("В ответе GitHub отсутствует номер версии.");
  if(compareAppVersions(latestVersion,APP_VERSION)<=0){
   statusBar.textContent="Установлена последняя версия SiGame Pack Editor · "+APP_VERSION+".";
   return;
  }
  const releaseUrl=String(release.html_url||"");
  const safeReleaseUrl=releaseUrl.startsWith("https://github.com/SoulEmper0r/SiGamePackEditor/releases/")
   ?releaseUrl:GITHUB_RELEASES_PAGE;
  const expectedAssetName="SiGamePackEditor-v"+latestVersion+".zip";
  const asset=(Array.isArray(release.assets)?release.assets:[]).find(entry=>
   entry?.name===expectedAssetName&&
   typeof entry.browser_download_url==="string"&&
   entry.browser_download_url.startsWith("https://github.com/SoulEmper0r/SiGamePackEditor/releases/download/")
  );
  const link=document.createElement("a");
  link.href=asset?asset.browser_download_url:safeReleaseUrl;
  link.target="_blank";
  link.rel="noopener noreferrer";
  link.textContent=asset?"Скачать обновление "+latestVersion:"Открыть релиз "+latestVersion;
  statusBar.replaceChildren(
   document.createTextNode("Доступна новая версия "+latestVersion+" (установлена "+APP_VERSION+"). "),
   link
  );
 }catch(error){
  statusBar.textContent="Не удалось проверить обновления: "+error.message+" Проверьте подключение к Интернету.";
  log("⚠ Проверка обновлений: "+error.message);
 }finally{
  checkUpdatesBtn.disabled=false;
  checkUpdatesBtn.textContent="Проверить обновления";
 }
}
if(appVersionLabel)appVersionLabel.textContent=APP_VERSION;
function updateHistoryControls(){
 if(undoBtn){
  undoBtn.disabled=!current||!undoRedoHistory.canUndo;
  undoBtn.title=undoRedoHistory.canUndo?"Отменить: "+undoRedoHistory.undoLabel:"Нет действий для отмены";
 }
 if(redoBtn){
  redoBtn.disabled=!current||!undoRedoHistory.canRedo;
  redoBtn.title=undoRedoHistory.canRedo?"Повторить: "+undoRedoHistory.redoLabel:"Нет действий для повтора";
 }
}
function packLabel(pack){
 const base=pack?.model?.metadata?.name||pack?.fileName||"Без названия";
 const duplicateName=openedPacks.filter(item=>(item.model?.metadata?.name||item.fileName||"Без названия")===base).length>1;
 const name=duplicateName?base+" — "+(pack?.fileName||"пакет"):base;
 return (pack?.dirty?"● ":"")+name;
}
function renderPackTabs(){
 if(bulkQuestionTypesBtn){
  bulkQuestionTypesBtn.disabled=!current;
  bulkQuestionTypesBtn.title=current
   ?"Текущая вкладка: в обычных раундах установить «Для всех», в финале — «Для всех со ставкой»."
   :"Сначала откройте пакет.";
 }
 if(qualityLimitsBtn){
  qualityLimitsBtn.disabled=!current;
  qualityLimitsBtn.textContent=current&&isQualityControlEnabled(current)?"Лимиты SIGame · QC":"Лимиты SIGame";
  qualityLimitsBtn.title=current
   ?(isQualityControlEnabled(current)?"Контроль качества включён: общий предел 150 МБ, ограничения на размеры медиафайлов.":"Контроль качества выключен: общий предел 100 МБ.")
   :"Сначала откройте пакет.";
 }
 if(packDropZone){
  packDropZone.textContent=openedPacks.length
   ?"Добавить пакеты .siq — перетащите сюда несколько"
   :"Перетащите сюда один или несколько .siq";
  packDropZone.title="Можно добавить сразу несколько файлов .siq. Каждый пакет откроется отдельной вкладкой; уже открытые источники не дублируются.";
 }
 if(!packTabs)return;
 packTabs.replaceChildren();
 packTabs.hidden=openedPacks.length===0;
 if(mergePacksBtn){
  mergePacksBtn.disabled=openedPacks.length<2;
  mergePacksBtn.title=openedPacks.length<2?"Откройте минимум два пакета":"Объединить раунды выбранных пакетов в один";
 }
 for(const pack of openedPacks){
  const tab=document.createElement("div");
  tab.className="pack-tab"+(pack===current?" active":"")+(pack.dirty?" dirty":"");
  const activate=document.createElement("button");
  activate.type="button";activate.className="pack-tab-select";activate.textContent=packLabel(pack);
  activate.title=(pack.fileName||"Пакет")+(pack.dirty?" — есть несохранённые изменения":"");
  activate.setAttribute("aria-current",String(pack===current));
  activate.addEventListener("click",()=>activateOpenedPack(pack));
  tab.dataset.packId=pack.sessionId||"";
  const close=document.createElement("button");
  close.type="button";close.className="pack-tab-close";close.textContent="×";
  close.title="Закрыть пакет";close.setAttribute("aria-label","Закрыть "+(pack.fileName||"пакет"));
  close.addEventListener("click",event=>{event.stopPropagation();closeOpenedPack(pack)});
  tab.append(activate,close);packTabs.appendChild(tab);
 }
}
function captureActivePackUiState(){
 if(!current)return;
 current.uiState={
  selected:selected?{id:selected.id,kind:selected.kind}:null,
  activeView,
  treeOpenNodes:[...tree.querySelectorAll("details[open]")].map(node=>node.dataset.nodeId).filter(Boolean),
  resourceSearch:resourceSearch?.value||"",
  resourceFolderFilter:resourceFolderFilter?.value||"",
  resourceTypeFilter:resourceTypeFilter?.value||"all",
  resourceStatusFilter:resourceStatusFilter?.value||"all",
  resourceSort:resourceSort?.value||"name",
  resourceSizeMin:resourceSizeMin?.value||"",
  resourceSizeMax:resourceSizeMax?.value||"",
  selectedArchivePath,
  selectedArchivePaths:[...selectedArchivePaths],
  resourceExpandedFolders:[...resourceExpandedFolders]
 };
 current.history=current.history||new UndoRedoHistory(40);
}
function restorePackUiState(pack){
 const state=pack?.uiState||{};
 selected=state.selected?{id:state.selected.id,kind:state.selected.kind}:null;
 activeView=state.activeView==="resources"?"resources":"editor";
 if(resourceSearch)resourceSearch.value=state.resourceSearch||"";
 if(resourceFolderFilter)resourceFolderFilter.value=state.resourceFolderFilter||"";
 if(resourceTypeFilter)resourceTypeFilter.value=state.resourceTypeFilter||"all";
 if(resourceStatusFilter)resourceStatusFilter.value=state.resourceStatusFilter||"all";
 if(resourceSort)resourceSort.value=state.resourceSort||"name";
 if(resourceSizeMin)resourceSizeMin.value=state.resourceSizeMin||"";
 if(resourceSizeMax)resourceSizeMax.value=state.resourceSizeMax||"";
 selectedArchivePath=state.selectedArchivePath||"";
 selectedArchivePaths=new Set(state.selectedArchivePaths||[]);
 resourceExpandedFolders=new Set(state.resourceExpandedFolders||[]);
}
function activateOpenedPack(pack){
 if(!pack||!openedPacks.includes(pack))return false;
 if(pack===current)return true;
 flushPendingHistoryEdit();
 captureActivePackUiState();
 disposeArchivePreview();
 resourceTargetItem=null;activeContentDrag=null;
 current=pack;
 restorePackUiState(pack);
 if(resourcesTab)resourcesTab.disabled=false;
 refreshLive({rerenderEditor:true,message:"Активный пакет: "+(pack.model.metadata.name||pack.fileName)});
 const openNodes=new Set(pack.uiState?.treeOpenNodes||[]);
 for(const node of tree.querySelectorAll("details[data-node-id],details[data-node-id]"))node.open=openNodes.has(node.dataset.nodeId);
 setExplorerView(activeView);
 renderPackTabs();
 updateHistoryControls();
 return true;
}
function closeOpenedPack(pack){
 const index=openedPacks.indexOf(pack);
 if(index<0)return false;
 if(pack.dirty&&!window.confirm("В пакете «"+(pack.model.metadata.name||pack.fileName)+"» есть несохранённые изменения. Закрыть без экспорта?"))return false;
 const wasActive=pack===current;
 if(wasActive){
  flushPendingHistoryEdit();
  captureActivePackUiState();
  disposeArchivePreview();
  resourceTargetItem=null;
  current=null;selected=null;
 }
 openedPacks.splice(index,1);
 if(wasActive&&openedPacks.length){
  activateOpenedPack(openedPacks[Math.min(index,openedPacks.length-1)]);
 }else if(wasActive){
  tree.textContent="Пакет не открыт.";
  selectionTitle.textContent="Выбор";
  selectionInfo.textContent="Выберите пакет .siq.";
  actions.replaceChildren();details.replaceChildren();
  if(resourcesTab)resourcesTab.disabled=true;
  if(exportBtn)exportBtn.disabled=true;
  if(resourceExplorer)resourceExplorer.hidden=true;
  if(workspace)workspace.hidden=false;
  activeView="editor";selectedArchivePath="";selectedArchivePaths.clear();resourceExpandedFolders.clear();
  setExplorerView("editor");
  updateStatus(null,"Все пакеты закрыты");
  updateHistoryControls();
 }
 renderPackTabs();
 return true;
}
function flushPendingHistoryEdit(){
 if(pendingHistoryTimer!==null){clearTimeout(pendingHistoryTimer);pendingHistoryTimer=null}
 if(!pendingHistoryEdit||!current)return;
 const pending=pendingHistoryEdit;pendingHistoryEdit=null;
 const committed=undoRedoHistory.commit(current,pending.snapshot,pending.label);
 if(committed)updateHistoryControls();
}
function schedulePendingHistoryEdit(){
 if(!pendingHistoryEdit)return;
 if(pendingHistoryTimer!==null)clearTimeout(pendingHistoryTimer);
 pendingHistoryTimer=setTimeout(flushPendingHistoryEdit,650);
}
function beginHistoryAction(){
 flushPendingHistoryEdit();
 return current?undoRedoHistory.begin(current):null;
}
function commitHistoryAction(before,label){
 if(before&&current&&undoRedoHistory.commit(current,before,label))updateHistoryControls();
}
function runHistoryAction(label,callback){
 const before=beginHistoryAction();
 try{
  const result=callback();
  commitHistoryAction(before,label);
  return result;
 }catch(error){
  if(before&&current)undoRedoHistory.restore(current,before);
  updateHistoryControls();
  throw error;
 }
}
async function runHistoryActionAsync(label,callback){
 const before=beginHistoryAction();
 try{
  const result=await callback();
  commitHistoryAction(before,label);
  return result;
 }catch(error){
  if(before&&current)undoRedoHistory.restore(current,before);
  updateHistoryControls();
  throw error;
 }
}
async function runPackHistoryActionAsync(pack,label,callback){
 if(!pack)throw Error("Целевой пакет не выбран.");
 if(pack===current)return runHistoryActionAsync(label,callback);
 flushPendingHistoryEdit();
 pack.history=pack.history||new UndoRedoHistory(40);
 const before=pack.history.begin(pack);
 try{
  const result=await callback();
  if(before)pack.history.commit(pack,before,label);
  renderPackTabs();
  return result;
 }catch(error){
  if(before)pack.history.restore(pack,before);
  renderPackTabs();
  throw error;
 }
}
function applyHistoryDirection(direction){
 if(!current)return;
 flushPendingHistoryEdit();
 try{
  const result=direction==="undo"?undoRedoHistory.undo(current):undoRedoHistory.redo(current);
  if(!result){updateHistoryControls();return}
  disposeArchivePreview();
  resourceTargetItem=null;
  selectedArchivePath="";
  selectedArchivePaths=new Set();
  refreshLive({rerenderEditor:true,message:(direction==="undo"?"Отменено: ":"Повторено: ")+result.label});
  log((direction==="undo"?"↶ Отменено: ":"↷ Повторено: ")+result.label);
 }catch(error){
  log("✗ Не удалось выполнить "+(direction==="undo"?"Undo":"Redo")+": "+(error.stack||error));
  alert("Не удалось восстановить состояние пакета:\n"+error.message);
 }
 updateHistoryControls();
}
function beginPendingHistoryEdit(target){
 if(!current||!target?.matches?.("input,textarea,select")||target.type==="file")return;
 if(pendingHistoryEdit?.target===target)return;
 flushPendingHistoryEdit();
 const wrapper=target.closest(".editor-field,.check-field,.content-item,.answer-box");
 const label=wrapper?.querySelector("span,b")?.textContent?.trim()||target.name||"поле редактора";
 pendingHistoryEdit={snapshot:undoRedoHistory.begin(current),label:"Изменение: "+label,target};
}
actions?.addEventListener("focus",event=>beginPendingHistoryEdit(event.target),true);
actions?.addEventListener("focusin",event=>beginPendingHistoryEdit(event.target));
actions?.addEventListener("focusout",()=>{
 if(!pendingHistoryEdit)return;
 setTimeout(flushPendingHistoryEdit,0);
});
actions?.addEventListener("change",()=>flushPendingHistoryEdit());
actions?.addEventListener("input",()=>schedulePendingHistoryEdit());
undoBtn?.addEventListener("click",()=>applyHistoryDirection("undo"));
redoBtn?.addEventListener("click",()=>applyHistoryDirection("redo"));
newPackBtn?.addEventListener("click",createNewPack);
mergePacksBtn?.addEventListener("click",openMergePacksDialog);
bulkQuestionTypesBtn?.addEventListener("click",openBulkQuestionTypesDialog);
qualityLimitsBtn?.addEventListener("click",openQualityLimitsDialog);
document.addEventListener("keydown",event=>{
 if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
 const key=event.key.toLowerCase();
 if(key!=="z"&&key!=="y")return;
 const target=event.target;
 if(target?.matches?.("input,textarea,[contenteditable='true']"))return;
 event.preventDefault();
 applyHistoryDirection(key==="y"||event.shiftKey?"redo":"undo");
});
function renderValidation(v){
 details.replaceChildren();
 for(const [key,value] of Object.entries(v.stats)){
  const row=document.createElement("div"),label=document.createElement("b");
  label.textContent=key+": ";row.append(label,document.createTextNode(String(value)));details.appendChild(row);
 }
 if(v.warnings.length){
  const heading=document.createElement("b");heading.textContent="Предупреждения";details.appendChild(heading);
  for(const warning of v.warnings.slice(0,30)){const row=document.createElement("div");row.className="validation-warning";row.textContent=warning;details.appendChild(row)}
 }
}
function updateStatus(v,message=""){
 if(!statusBar)return;
 if(!current){statusBar.textContent=message||"Откройте пакет .siq";statusBar.classList.remove("status-error","status-dirty");renderPackTabs();return}
 const dirty=current.dirty?"Есть несохранённые изменения":"Изменений нет";
 const validity=v?.ok?"Ошибок нет":"Ошибки проверки: "+(v?.errors?.length??"—");
 statusBar.textContent=[message,dirty,validity].filter(Boolean).join("  ·  ");
 statusBar.classList.toggle("status-error",!!v&&!v.ok);
 statusBar.classList.toggle("status-dirty",!!current.dirty);
 renderPackTabs();
}
function setQualityControlEnabled(pack,enabled){
 if(!pack)throw Error("Пакет не открыт.");
 const markerPath="quality.marker";
 const normalize=value=>String(value||"").replaceAll("\\","/").toLowerCase();
 const hasOriginal=(pack.zip?.entries||[]).some(entry=>normalize(entry.name)===markerPath);
 const extras=pack.extraResources||(pack.extraResources=[]);
 const extraIndex=extras.findIndex(entry=>normalize(entry.archivePath)===markerPath);
 if(enabled){
  for(const deletedPath of [...(pack.deletedResourcePaths||[])])if(normalize(deletedPath)===markerPath)pack.deletedResourcePaths.delete(deletedPath);
  if(!hasOriginal&&extraIndex<0){
   extras.push({archivePath:markerPath,data:new Uint8Array(0),name:markerPath,size:0});
  }
 }else{
  if(extraIndex>=0)extras.splice(extraIndex,1);
  if(hasOriginal){
   pack.deletedResourcePaths=pack.deletedResourcePaths||new Set();
   pack.deletedResourcePaths.add(markerPath);
  }else{
   for(const deletedPath of [...(pack.deletedResourcePaths||[])])if(normalize(deletedPath)===markerPath)pack.deletedResourcePaths.delete(deletedPath);
  }
 }
 pack.dirty=true;
 return isQualityControlEnabled(pack);
}
function ensureQualityControlMarker(pack){
 if(!pack)throw Error("Пакет не открыт.");
 if(isQualityControlEnabled(pack))return false;
 setQualityControlEnabled(pack,true);
 return true;
}
function setQualityReportMessage(host,message,className=""){
 const node=document.createElement("div");
 node.className="quality-report-note"+(className?" "+className:"");
 node.textContent=message;
 host.appendChild(node);
 return node;
}
async function openQualityLimitsDialog(){
 if(!current)return;
 flushPendingHistoryEdit();
 const pack=current;
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal quality-limits-modal";
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent="Ограничения SIGame";
 const close=button("✕",()=>overlay.remove());close.className="modal-close";close.setAttribute("aria-label","Закрыть");
 head.append(title,close);
 const intro=document.createElement("div");intro.className="quality-report-intro";
 intro.textContent="Проверяется фактический ZIP и размеры локальных медиа. Другие правила Quality Control (например, внешние ссылки и совместимость форматов) этим отчётом не проверяются.";
 const body=document.createElement("div");body.className="quality-report-body";
 const footer=document.createElement("div");footer.className="destination-footer";
 const toggle=button("");
 toggle.className="quality-toggle";
 const recalc=button("Пересчитать",renderReport);recalc.className="resource-bulk-secondary";
 const done=button("Закрыть",()=>overlay.remove());
 footer.append(toggle,recalc,done);
 modal.append(head,intro,body,footer);overlay.appendChild(modal);document.body.appendChild(overlay);
 overlay.addEventListener("click",event=>{if(event.target===overlay)overlay.remove()});
 overlay.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();overlay.remove()}});
 toggle.addEventListener("click",()=>{
  if(pack!==current){alert("Активный пакет изменился. Откройте лимиты заново.");return}
  const enabled=!isQualityControlEnabled(pack);
  try{
   runHistoryAction(enabled?"Включение контроля качества SIGame":"Отключение контроля качества SIGame",()=>setQualityControlEnabled(pack,enabled));
   renderPackTabs();
   renderReport();
   refreshLive({message:enabled?"Контроль качества SIGame включён (150 МБ)":"Контроль качества SIGame выключен (100 МБ)"});
  }catch(error){alert("Не удалось изменить режим контроля качества:\n"+error.message)}
 });
 async function renderReport(){
  body.replaceChildren();
  setQualityReportMessage(body,"Собираю пакет и считаю точный размер ZIP…");
  toggle.disabled=true;recalc.disabled=true;
  try{
   const archiveBytes=await writeSiq(pack,{});
   if(pack!==current){setQualityReportMessage(body,"Активная вкладка изменилась. Закройте окно и откройте проверку заново.","warning");return}
   const enabled=isQualityControlEnabled(pack);
   const packageLimit=qualityPackageLimit(pack);
   const violations=findQualityMediaViolations(pack);
   const exceeded=archiveBytes.length>packageLimit;
   const summary=document.createElement("section");summary.className="quality-report-summary";
   const mode=document.createElement("div");
   mode.innerHTML="";
   const modeLabel=document.createElement("strong");modeLabel.textContent=enabled?"Контроль качества включён":"Контроль качества выключен";
   const modeDetail=document.createElement("span");modeDetail.textContent=enabled?"В SIQ есть служебный quality.marker. Максимальный размер — 150 МБ.":"Служебный quality.marker отсутствует. Максимальный размер — 100 МБ.";
   mode.append(modeLabel,modeDetail);
   const size=document.createElement("div");
   const sizeLabel=document.createElement("strong");sizeLabel.textContent="Размер пакета: "+formatSigameBytes(archiveBytes.length);
   const sizeDetail=document.createElement("span");sizeDetail.textContent="Допустимо: "+formatSigameBytes(packageLimit)+" · осталось: "+formatSigameBytes(Math.max(0,packageLimit-archiveBytes.length));
   size.append(sizeLabel,sizeDetail);
   const meter=document.createElement("div");meter.className="quality-size-meter";
   const fill=document.createElement("div");fill.className="quality-size-meter-fill";
   fill.style.width=Math.min(100,archiveBytes.length/packageLimit*100)+"%";
   if(exceeded)fill.classList.add("over");
   meter.appendChild(fill);
   summary.append(mode,size,meter);
   body.appendChild(summary);
   if(exceeded){
    setQualityReportMessage(body,"Превышен максимальный размер на "+formatSigameBytes(archiveBytes.length-packageLimit)+". Экспорт такого пакета заблокирован.","error");
   }else{
    setQualityReportMessage(body,"Общий размер пакета соответствует лимиту.","success");
   }
   const section=document.createElement("section");section.className="quality-media-section";
   const sectionTitle=document.createElement("h4");
   sectionTitle.textContent=enabled?"Проверка размеров медиафайлов":"Медиафайлы, которые не пройдут контроль качества";
   section.appendChild(sectionTitle);
   if(!violations.length){
    setQualityReportMessage(section,"Все изображения, аудио и видео соответствуют лимитам.");
   }else{
    setQualityReportMessage(section,enabled
     ?"Найдено превышений: "+violations.length+". При включённом контроле качества экспорт заблокирован до исправления."
     :"Найдено потенциальных нарушений QC: "+violations.length+". При выключенном контроле эти ограничения не применяются, но для режима 150 МБ их придётся исправить.",
     enabled?"error":"warning");
    const list=document.createElement("div");list.className="quality-violation-list";
    const shown=violations.slice(0,100);
    for(const violation of shown){
     const row=document.createElement("div");row.className="quality-violation-row";
     const detail=document.createElement("div");detail.className="quality-violation-detail";
     const path=document.createElement("strong");path.textContent=violation.path;
     const sizes=document.createElement("span");sizes.textContent=qualityMediaTypeLabel(violation.type)+": "+formatSigameBytes(violation.size)+" · лимит "+formatSigameBytes(violation.limit);
     detail.append(path,sizes);
     const open=button("Открыть файл",()=>{
      if(pack!==current){alert("Активный пакет изменился.");return}
      const item=buildArchiveInventory(pack).items.find(entry=>entry.resource===violation.resource);
      if(!item){alert("Файл больше не найден в текущем пакете.");return}
      resourceSearch.value="";
      resourceFolderFilter.value="";
      resourceTypeFilter.value=violation.type;
      selectedArchivePath=item.id;
      overlay.remove();
      setExplorerView("resources");
     });
     open.className="quality-open-resource";
     row.append(detail,open);list.appendChild(row);
    }
    section.appendChild(list);
    if(violations.length>shown.length)setQualityReportMessage(section,"Показаны первые "+shown.length+" из "+violations.length+" файлов. Остальные видны через сортировку по размеру в содержимом пакета.","warning");
   }
   body.appendChild(section);
   toggle.textContent=enabled?"Отключить контроль качества (лимит станет 100 МБ)":"Включить контроль качества (лимит станет 150 МБ)";
   toggle.title=enabled?"Убрать quality.marker и применить обычный лимит 100 МБ.":"Добавить quality.marker. Для этого режима медиа должны соответствовать индивидуальным лимитам.";
  }catch(error){
   body.replaceChildren();
   setQualityReportMessage(body,"Не удалось проверить размер пакета: "+error.message,"error");
  }finally{
   toggle.disabled=false;recalc.disabled=false;
  }
 }
 await renderReport();
}
async function assertPackageSizeWithinLimit(pack,label="Операция"){
 const bytes=await writeSiq(pack,{});
 const limit=qualityPackageLimit(pack);
 if(bytes.length>limit){
  throw Error(label+" приведёт к размеру "+formatSigameBytes(bytes.length)+", при текущем режиме SIGame допускается не более "+formatSigameBytes(limit)+". Изменение отменено.");
 }
 return bytes.length;
}
function findQuestion(id){if(!current)return null;for(const r of current.model.rounds)for(const t of r.themes){const q=t.questions.find(x=>x.id===id);if(q)return q}return null}
function findTheme(id){if(!current)return null;for(const r of current.model.rounds){const t=r.themes.find(x=>x.id===id);if(t)return t}return null}
function findRound(id){return current?.model.rounds.find(x=>x.id===id)||null}
function explorerByteLabel(value){
 if(value===null||value===undefined||!Number.isFinite(Number(value)))return "—";
 const bytes=Number(value);
 if(bytes<1024)return bytes+" Б";
 const units=["КБ","МБ","ГБ","ТБ"];
 let size=bytes/1024,index=0;
 while(size>=1024&&index<units.length-1){size/=1024;index++}
 return size.toFixed(size>=10?1:2)+" "+units[index];
}
function explorerTypeLabel(kind){
 return ({image:"Изображение",audio:"Аудио",video:"Видео",html:"HTML",text:"Текст",binary:"Файл",folder:"Папка"})[kind]||"Файл";
}
function expandResourceFolderPath(path){
 const parts=String(path||"").split("/").filter(Boolean);
 for(let i=1;i<=parts.length;i++)resourceExpandedFolders.add(parts.slice(0,i).join("/"));
}
function renderResourceFolderTree(inventory){
 if(!resourceFolderTree)return;
 const selectedFolder=resourceFolderFilter.value||"";
 const nodes=new Map();
 const ensureNode=path=>{
  if(nodes.has(path))return nodes.get(path);
  const parentPath=path.includes("/")?path.slice(0,path.lastIndexOf("/")):"";
  const node={path,name:path.slice(path.lastIndexOf("/")+1),children:[]};
  nodes.set(path,node);
  if(parentPath){const parent=ensureNode(parentPath);parent.children.push(node)}
  return node;
 };
 for(const path of inventory.folders.filter(Boolean).sort((a,b)=>a.localeCompare(b,"ru",{numeric:true,sensitivity:"base"})))ensureNode(path);
 const counts=new Map();let rootCount=0;
 for(const item of inventory.items){
  if(item.isDirectory)continue;
  const parts=item.path.split("/").filter(Boolean);
  if(parts.length===1)rootCount++;
  for(let i=1;i<parts.length;i++){
   const key=parts.slice(0,i).join("/");counts.set(key,(counts.get(key)||0)+1);
  }
 }
 resourceFolderTree.replaceChildren();
 const addRootButton=(label,value,count)=>{
  const row=button(label+"  ("+count+")",()=>{resourceFolderFilter.value=value;selectedArchivePath="";renderPackageExplorer()});
  row.dataset.folderPath=value;
  row.className="resource-folder-root"+(selectedFolder===value?" selected":"");
  resourceFolderTree.appendChild(row);
 };
 addRootButton("Все файлы","",inventory.items.filter(item=>!item.isDirectory).length);
 addRootButton("Корень пакета","__root__",rootCount);
 const appendNode=(node,depth=0)=>{
  const branch=document.createElement("div");branch.className="resource-folder-branch";
  const row=document.createElement("div");row.className="resource-folder-row";row.style.paddingLeft=(depth*13)+"px";
  const hasChildren=node.children.length>0;
  const expanded=resourceExpandedFolders.has(node.path);
  const toggle=button(hasChildren?(expanded?"▾":"▸"):"·",()=>{
   if(resourceExpandedFolders.has(node.path))resourceExpandedFolders.delete(node.path);
   else resourceExpandedFolders.add(node.path);
   renderResourceFolderTree(inventory);
  });
  toggle.className="resource-folder-toggle";toggle.disabled=!hasChildren;toggle.setAttribute("aria-label",hasChildren?(expanded?"Свернуть папку":"Развернуть папку"):"Папка не содержит вложенных папок");
  const select=button("📁 "+node.name,()=>{
   resourceFolderFilter.value=node.path;selectedArchivePath="";expandResourceFolderPath(node.path);renderPackageExplorer();
  });
  select.dataset.folderPath=node.path;
  select.className="resource-folder-select"+(selectedFolder===node.path?" selected":"");
  const count=document.createElement("span");count.className="resource-folder-count";count.textContent=String(counts.get(node.path)||0);
  row.append(toggle,select,count);branch.appendChild(row);
  if(hasChildren){
   const children=document.createElement("div");children.className="resource-folder-children";children.hidden=!expanded;
   for(const child of node.children)children.appendChild(appendNode(child,depth+1));
   branch.appendChild(children);
  }
  return branch;
 };
 const roots=[...nodes.values()].filter(node=>!node.path.includes("/")).sort((a,b)=>a.name.localeCompare(b.name,"ru",{numeric:true,sensitivity:"base"}));
 const foldersHeading=document.createElement("div");foldersHeading.className="resource-folder-section-title";foldersHeading.textContent="Папки";resourceFolderTree.appendChild(foldersHeading);
 for(const node of roots)resourceFolderTree.appendChild(appendNode(node));
}
function resolveBatchImportConflicts(conflicts){
 return new Promise(resolve=>{
  const overlay=document.createElement("div");overlay.className="destination-overlay";
  const modal=document.createElement("div");modal.className="destination-modal resource-import-conflict-modal";
  const heading=document.createElement("div");heading.className="destination-head";
  const title=document.createElement("h3");title.textContent="Конфликты при импорте";
  const close=button("✕",()=>finish(null));close.className="modal-close";
  heading.append(title,close);
  const hint=document.createElement("div");hint.className="destination-hint";
  const canReplaceAll=conflicts.every(conflict=>conflict.canReplace);
  const blocked=conflicts.filter(conflict=>!conflict.canReplace);
  hint.textContent="Найдено совпадений путей: "+conflicts.length+". Пакет пока не изменён. Для каждого файла выберите отдельное действие или примените один вариант ко всем.";
  const list=document.createElement("ul");list.className="resource-import-conflict-list";
  const selectors=[];
  for(const conflict of conflicts){
   const line=document.createElement("li");
   const path=document.createElement("strong");path.textContent=conflict.path;
   const detail=document.createElement("span");detail.textContent="Файл: "+conflict.fileName+(conflict.reason?" · "+conflict.reason:"");
   const select=document.createElement("select");select.className="resource-conflict-choice";
   select.dataset.conflictIndex=String(conflict.index);
   const keepOption=document.createElement("option");keepOption.value="keep-both";keepOption.textContent="Сохранить оба (новое имя)";
   const skipOption=document.createElement("option");skipOption.value="skip";skipOption.textContent="Пропустить этот файл";
   const replaceOption=document.createElement("option");replaceOption.value="replace";replaceOption.textContent=conflict.canReplace?"Заменить существующий":"Заменить нельзя: "+(conflict.reason||"несовместимый ресурс");
   replaceOption.disabled=!conflict.canReplace;
   select.append(keepOption,skipOption,replaceOption);
   select.value="keep-both";
   selectors.push(select);
   line.append(path,detail,select);list.appendChild(line);
  }
  const note=document.createElement("div");note.className="destination-hint";
  note.textContent="Замена сохраняет исходный путь и ссылки, обновляет manifest hash и оставляет предыдущие bytes в истории ресурса. Если цель несовместима или системная, вариант замены отключён только для неё.";
  const actionsRow=document.createElement("div");actionsRow.className="resource-conflict-actions";
  const perFileActions=document.createElement("div");perFileActions.className="resource-conflict-actions";
  const footer=document.createElement("div");footer.className="destination-footer";
  let settled=false;
  function finish(decision){
   if(settled)return;settled=true;
   overlay.remove();resolve(decision);
  }
  const keepBoth=button("Сохранить оба файла",()=>finish({mode:"all",policy:"keep-both"}));
  const skip=button("Пропустить конфликты",()=>finish({mode:"all",policy:"skip"}));
  const replace=button("Заменить существующие",()=>finish({mode:"all",policy:"replace"}));
  replace.disabled=!canReplaceAll;
  replace.title=canReplaceAll
   ?"Заменить bytes всех конфликтующих ресурсов, сохранив пути, ссылки и историю версий."
   :"Недоступно: "+(blocked[0]?.path||"конфликт")+" — "+(blocked[0]?.reason||"ресурс нельзя заменить");
  const applySelected=button("Применить решения по файлам",()=>{
   const decisions=Object.fromEntries(selectors.map(select=>[select.dataset.conflictIndex,select.value]));
   finish({mode:"individual",decisions});
  });
  const cancel=button("Отмена",()=>finish(null));
  cancel.className="resource-bulk-secondary";
  actionsRow.append(keepBoth,skip,replace);
  perFileActions.append(applySelected);
  footer.append(cancel);
  modal.append(heading,hint,list,note,actionsRow,perFileActions,footer);
  overlay.appendChild(modal);document.body.appendChild(overlay);
  overlay.addEventListener("click",event=>{if(event.target===overlay)finish(null)});
  overlay.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();finish(null)}});
 });
}
async function importResourceFiles(files,{preserveRelativePaths=false}={}){
 const selectedFiles=Array.from(files||[]);
 if(!current||!selectedFiles.length)return;
 const selectedFolder=resourceFolderFilter?.value||"";
 const destinationPath=selectedFolder&&selectedFolder!=="__root__"?selectedFolder:"";
 const totalBytes=selectedFiles.reduce((sum,file)=>sum+(Number(file.size)||0),0);
 if(totalBytes>256*1024*1024&&!window.confirm("Выбрано "+selectedFiles.length+" файлов общим размером "+explorerByteLabel(totalBytes)+". Файлы будут загружены в память редактора. Продолжить?"))return;
 try{
  const inspection=await addResourceFilesToPack(current,selectedFiles,{destinationPath,preserveRelativePaths,conflictPolicy:"inspect"});
  let conflictPolicy="keep-both",conflictDecisions=null;
  if(inspection.requiresDecision){
   const resolution=await resolveBatchImportConflicts(inspection.conflicts);
   if(!resolution){
    log("Импорт отменён: пакет не изменён.");
    return;
   }
   if(resolution.mode==="individual"){
    conflictDecisions=resolution.decisions;
   }else{
    conflictPolicy=resolution.policy;
   }
  }
  const result=await runHistoryActionAsync(preserveRelativePaths?"Импорт папки ресурсов":"Импорт файлов ресурсов",async()=>{
   const imported=await addResourceFilesToPack(current,selectedFiles,{
    destinationPath,preserveRelativePaths,conflictPolicy,
    ...(conflictDecisions?{conflictDecisions}:{})
   });
   rebuildPackReferences(current);
   await assertPackageSizeWithinLimit(current,"Импорт ресурсов");
   return imported;
  });
  const message="Импортировано файлов: "+result.files+" · добавлено: "+result.added.length+" · уже было в пакете: "+result.reused+" · заменено: "+result.replaced.length+" · пропущено: "+result.skipped;
  log("✓ "+message);
  refreshLive({message});
 }catch(error){
  log("✗ Ошибка импорта ресурсов: "+(error.stack||error));
  alert("Не удалось импортировать файлы:\n"+error.message);
 }
}
function openFilenameNormalizationDialog(){
 if(!current)return;
 flushPendingHistoryEdit();
 const pack=current;
 const plan=planArchiveFilenameNormalization(buildArchiveInventory(pack).items);
 if(!plan.changes.length){
  const reason=plan.skipped.length?" Файлов с неподдерживаемо длинным расширением: "+plan.skipped.length+".":"";
  log("✓ Нормализация имён не требуется."+reason);
  alert("Все доступные имена файлов уже соответствуют правилам."+reason);
  return;
 }
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal filename-normalize-modal";
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent="Нормализация имён файлов";
 const close=button("✕",()=>overlay.remove());close.className="modal-close";close.setAttribute("aria-label","Закрыть");
 head.append(title,close);
 const hint=document.createElement("div");hint.className="destination-hint";
 hint.textContent="Будет переименовано файлов: "+plan.changes.length+". Максимум "+SIGAME_MAX_FILENAME_LENGTH+" символов на имя вместе с расширением. Пробелы заменяются на _, запятые и остальные спецсимволы удаляются. Папки и расширения сохраняются. Цифры и буквы любых алфавитов остаются.";
 const list=document.createElement("ul");list.className="filename-normalize-list";
 const visibleChanges=plan.changes.slice(0,500);
 for(const change of visibleChanges){
  const row=document.createElement("li");row.dataset.oldPath=change.oldPath;row.dataset.newPath=change.newPath;
  const oldName=document.createElement("span");oldName.className="filename-normalize-old";oldName.textContent=change.oldPath;
  const arrow=document.createElement("span");arrow.className="filename-normalize-arrow";arrow.textContent="→";
  const newName=document.createElement("strong");newName.className="filename-normalize-new";newName.textContent=change.newPath;
  row.append(oldName,arrow,newName);list.appendChild(row);
 }
 if(plan.changes.length>visibleChanges.length){
  const more=document.createElement("li");more.className="filename-normalize-more";
  more.textContent="И ещё файлов: "+(plan.changes.length-visibleChanges.length);
  list.appendChild(more);
 }
 const note=document.createElement("div");note.className="destination-hint";
 note.textContent="Ссылки внутри вопросов, manifest и логотип пакета будут обновлены автоматически. Совпадающие имена получат суффиксы _2, _3 и т. д. Исходный ZIP не перезаписывается; всю операцию можно отменить одним Undo.";
 if(plan.skipped.length){
  const skipped=document.createElement("div");skipped.className="filename-normalize-skipped";
  skipped.textContent="Пропущено: "+plan.skipped.length+" · "+plan.skipped.map(item=>item.path+" ("+item.reason+")").slice(0,5).join("; ");
  note.appendChild(skipped);
 }
 const footer=document.createElement("div");footer.className="destination-footer";
 const cancel=button("Отмена",()=>overlay.remove());
 const apply=button("Нормализовать "+plan.changes.length+" файлов",async()=>{
  apply.disabled=true;apply.textContent="Переименовываю…";
  try{
   const result=await runHistoryActionAsync("Нормализация имён файлов ("+plan.changes.length+")",async()=>{
    let updatedReferences=0,updatedPackageLogos=0;
    for(const change of plan.changes){
     const renamed=renameArchiveResource(pack,change.item,change.targetPath);
     updatedReferences+=renamed.updatedReferences||0;
     if(renamed.updatedPackageLogo)updatedPackageLogos++;
    }
    await assertPackageSizeWithinLimit(pack,"Нормализация имён файлов");
    return {count:plan.changes.length,updatedReferences,updatedPackageLogos,skipped:plan.skipped.length};
   });
   overlay.remove();
   selectedArchivePath="";
   selectedArchivePaths.clear();
   disposeArchivePreview();
   log("✓ Нормализованы имена файлов: "+result.count+" · обновлено ссылок: "+result.updatedReferences+" · перепривязано логотипов: "+result.updatedPackageLogos+(result.skipped?" · пропущено: "+result.skipped:""));
   refreshLive({rerenderEditor:true,message:"Нормализованы имена файлов: "+result.count});
  }catch(exception){
   log("✗ Нормализация имён отменена: "+(exception.stack||exception));
   alert("Не удалось нормализовать имена файлов. Изменения отменены:\\n"+(exception.message||exception));
   overlay.remove();
  }
 });
 apply.className="primary";
 footer.append(cancel,apply);
 modal.append(head,hint,list,note,footer);
 overlay.appendChild(modal);document.body.appendChild(overlay);
 overlay.addEventListener("click",event=>{if(event.target===overlay)overlay.remove()});
 document.addEventListener("keydown",function closeOnEscape(event){
  if(event.key==="Escape"&&overlay.isConnected){overlay.remove();document.removeEventListener("keydown",closeOnEscape)}
 },{once:true});
}

function renderResourceBulkActions(rows,inventory){
 if(!resourceBulkActions)return;
 const selectable=inventory.items.filter(item=>item.entry&&!item.missing&&!item.isDirectory);
 const validIds=new Set(selectable.map(item=>item.id));
 for(const id of selectedArchivePaths)if(!validIds.has(id))selectedArchivePaths.delete(id);
 const selectedItems=selectable.filter(item=>selectedArchivePaths.has(item.id));
 const selectedBytes=selectedItems.reduce((sum,item)=>sum+(Number(item.size)||0),0);
 const selectedUnusedItems=selectedItems.filter(item=>item.resource&&item.status==="unused"&&item.usageCount===0&&item.status!=="system");
 const selectedUnusedBytes=selectedUnusedItems.reduce((sum,item)=>sum+(Number(item.size)||0),0);
 resourceBulkActions.replaceChildren();
 const counter=document.createElement("span");
 counter.className="resource-bulk-count";
 counter.textContent="Выбрано файлов: "+selectedItems.length+" · "+explorerByteLabel(selectedBytes);
 resourceBulkActions.appendChild(counter);
 const filenamePlan=planArchiveFilenameNormalization(inventory.items);
 const normalizeNames=button("Нормализовать имена ("+filenamePlan.changes.length+")",openFilenameNormalizationDialog);
 normalizeNames.disabled=filenamePlan.changes.length===0;
 normalizeNames.title="Очистить имена файлов, сохранить расширения и папки, ограничить имя 15 символами. Ссылки и manifest обновятся автоматически.";
 resourceBulkActions.appendChild(normalizeNames);
 const filePicker=document.createElement("input");
 filePicker.id="resourceFilesPicker";filePicker.type="file";filePicker.multiple=true;filePicker.hidden=true;
 const addFiles=button("Добавить файлы",()=>filePicker.click());
 addFiles.title="Добавить несколько файлов в выбранную папку; без выбранной папки ресурсы попадут в Images/Audio/Video/Html/Files.";
 filePicker.addEventListener("change",async()=>{const files=Array.from(filePicker.files||[]);await importResourceFiles(files);filePicker.value=""});
 const folderPicker=document.createElement("input");
 folderPicker.id="resourceFolderPicker";folderPicker.type="file";folderPicker.multiple=true;folderPicker.hidden=true;
 folderPicker.setAttribute("webkitdirectory","");folderPicker.setAttribute("directory","");
 const addFolder=button("Импортировать папку",()=>folderPicker.click());
 addFolder.title="Импортировать выбранную папку целиком, сохранив её имя и вложенные каталоги.";
 folderPicker.addEventListener("change",async()=>{const files=Array.from(folderPicker.files||[]);await importResourceFiles(files,{preserveRelativePaths:true});folderPicker.value=""});
 resourceBulkActions.append(addFiles,addFolder,filePicker,folderPicker);
 const selectVisible=button("Выбрать видимые",()=>{
  for(const item of rows)if(item.entry&&!item.missing&&!item.isDirectory)selectedArchivePaths.add(item.id);
  renderPackageExplorer();
 });
 selectVisible.disabled=!rows.some(item=>item.entry&&!item.missing&&!item.isDirectory);
 selectVisible.className="resource-bulk-secondary";
 resourceBulkActions.appendChild(selectVisible);
 const clear=button("Снять выделение",()=>{
  selectedArchivePaths.clear();
  renderPackageExplorer();
 });
 clear.disabled=selectedItems.length===0;
 clear.className="resource-bulk-secondary";
 resourceBulkActions.appendChild(clear);
 const deleteUnused=button("Удалить неиспользуемые ("+selectedUnusedItems.length+")",()=>{
  if(!selectedUnusedItems.length)return;
  const skipped=selectedItems.length-selectedUnusedItems.length;
  const question="Будет удалено "+selectedUnusedItems.length+" неиспользуемых файлов ("+explorerByteLabel(selectedUnusedBytes)+")."+(skipped?" Ещё "+skipped+" выбранных файлов используются или не подходят и останутся в пакете.":"")+"\n\nОперация создаст одну запись восстановления. Продолжить?";
  if(!window.confirm(question))return;
  deleteUnused.disabled=true;deleteUnused.textContent="Удаляю…";
  try{
   const result=runHistoryAction("Пакетное удаление неиспользуемых ресурсов",()=>deleteUnusedArchiveResources(current,selectedUnusedItems));
   selectedArchivePaths.clear();
   if(result.paths.includes(selectedArchivePath))selectedArchivePath="";
   log("✓ Пакетно удалено неиспользуемых ресурсов: "+result.count+". Всю операцию можно отменить одной кнопкой.");
   refreshLive({message:"Удалено ресурсов: "+result.count});
  }catch(error){
   log("✗ Пакетная очистка отменена: "+(error.stack||error));
   alert("Не удалось выполнить пакетное удаление. Ничего не удалено:\n"+error.message);
   renderResourceBulkActions(rows,inventory);
  }
 });
 deleteUnused.disabled=selectedUnusedItems.length===0;
 deleteUnused.title="Удаляются только выбранные ресурсы со статусом «Не используется». Все ссылки повторно проверяются перед изменением пакета.";
 resourceBulkActions.appendChild(deleteUnused);
 const download=button("Скачать выбранное одним ZIP",async()=>{
  if(!selectedItems.length)return;
  if(selectedBytes>256*1024*1024&&!window.confirm("Выбрано "+selectedItems.length+" файлов общим размером "+explorerByteLabel(selectedBytes)+". ZIP будет собираться в памяти браузера. Продолжить?"))return;
  download.disabled=true;download.textContent="Собираю ZIP…";
  try{
   const result=await downloadArchiveEntries(selectedItems,{fileName:"selected-resources.zip"});
   log("✓ Подготовлен архив ресурсов: "+result.fileName+" · файлов: "+result.count+" · размер ZIP: "+explorerByteLabel(result.size));
   updateStatus(validatePack(current.model),"Архив выбранных ресурсов скачивается");
  }catch(error){
   log("✗ Не удалось собрать архив ресурсов: "+(error.stack||error));
   alert("Не удалось скачать выбранные ресурсы:\\n"+error.message);
  }finally{
   renderResourceBulkActions(rows,inventory);
  }
 });
 download.disabled=selectedItems.length===0;
 resourceBulkActions.appendChild(download);
}
function disposeArchivePreview(){
 archivePreviewToken++;
 if(archivePreviewCleanup){try{archivePreviewCleanup()}catch{}}
 archivePreviewCleanup=null;
}
function setExplorerView(view){
 if(!workspace||!resourceExplorer||!editorTab||!resourcesTab)return;
 activeView=view==="resources"?"resources":"editor";
 workspace.hidden=activeView!=="editor";
 resourceExplorer.hidden=activeView!=="resources";
 editorTab.classList.toggle("active",activeView==="editor");
 resourcesTab.classList.toggle("active",activeView==="resources");
 editorTab.setAttribute("aria-selected",String(activeView==="editor"));
 resourcesTab.setAttribute("aria-selected",String(activeView==="resources"));
 if(activeView==="resources")renderPackageExplorer();
}
function locateContentItem(item){
 if(!current||!item)return null;
 for(const round of current.model.rounds)for(const theme of round.themes)for(let qi=0;qi<theme.questions.length;qi++){
  const question=theme.questions[qi];
  for(const param of question.parameters||[])if(param.type==="content"){
   const found=param.value.find(x=>x===item||x.sourceNode===item.sourceNode);
   if(found)return {
    item:found,
    label:"Раунд "+(round.order+1)+" «"+(round.name||"без названия")+"» → тема «"+(theme.name||"без названия")+"» → вопрос №"+(qi+1)+" → "+(param.name||"контент")
   };
  }
 }
 return null;
}
function addResourceMeta(host,label,value){
 const cell=document.createElement("div");cell.className="resource-meta-item";
 const caption=document.createElement("span");caption.textContent=label;
 const content=document.createElement("strong");content.textContent=String(value??"—");
 cell.append(caption,content);host.appendChild(cell);
}
function deleteArchiveResourceFromUi(item){
 if(!current||!item?.resource)return;
 if(item.usageCount>0){
  alert("Нельзя удалить используемый ресурс. Сначала измените все ссылки: "+item.usages.map(usage=>usage.label).join("; "));
  return;
 }
 const confirmed=window.confirm("Удалить файл из рабочей копии пакета?\n\n"+item.path+"\n\nФайл будет исключён при следующем экспорте. Исходный .siq на диске не изменится. Действие можно отменить кнопкой восстановления.");
 if(!confirmed)return;
 try{
  const result=runHistoryAction("Удаление ресурса: "+item.path,()=>deleteArchiveResource(current,item));
  disposeArchivePreview();
  selectedArchivePath="";
  log("✓ Ресурс удалён из рабочей копии: "+result.path);
  refreshLive({message:"Ресурс удалён из рабочей копии"});
 }catch(error){
  log("✗ Не удалось удалить ресурс: "+(error.stack||error));
  alert("Не удалось удалить ресурс:\\n"+error.message);
 }
}
function restoreLastArchiveResource(){
 applyHistoryDirection("undo");
}
function resourceConflictKey(path){
 return String(path||"").replaceAll("\\","/").split("/").map(segment=>{
  try{return decodeURIComponent(segment).toLowerCase()}catch{return segment.toLowerCase()}
 }).join("/");
}
function suggestConflictFreeResourcePath(path){
 const normalized=String(path||"").replaceAll("\\","/");
 const slash=normalized.lastIndexOf("/");
 const directory=slash>=0?normalized.slice(0,slash+1):"";
 const file=slash>=0?normalized.slice(slash+1):normalized;
 const dot=file.lastIndexOf(".");
 const base=dot>0?file.slice(0,dot):file;
 const extension=dot>0?file.slice(dot):"";
 const occupied=new Set(buildArchiveInventory(current).items.map(entry=>resourceConflictKey(entry.path)));
 for(const resource of current.model.resources||[])occupied.add(resourceConflictKey(resource.normalizedPath));
 for(const extra of current.extraResources||[])occupied.add(resourceConflictKey(extra.archivePath));
 let suffix=2;
 while(suffix<100000){
  const candidate=directory+base+"_"+suffix+extension;
  if(!occupied.has(resourceConflictKey(candidate)))return candidate;
  suffix++;
 }
 throw Error("Не удалось подобрать свободное имя файла.");
}
function openArchiveResourceRenameDialog(item){
 if(!current||!item?.resource||item.isDirectory||item.status==="system")return;
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal resource-rename-modal";
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent="Переименовать / переместить ресурс";
 const close=button("✕",()=>overlay.remove());close.className="modal-close";head.append(title,close);
 const hint=document.createElement("div");hint.className="destination-hint";
 hint.textContent="Укажите полный путь внутри пакета. Можно изменить имя файла, папку или и то и другое. Существующие файлы не перезаписываются.";
 const label=document.createElement("label");label.className="editor-field";
 const caption=document.createElement("span");caption.textContent="Новый путь";
 const pathInput=document.createElement("input");pathInput.type="text";pathInput.className="resource-rename-path";pathInput.value=item.path;pathInput.spellcheck=false;
 label.append(caption,pathInput);
 const error=document.createElement("div");error.className="destination-error";error.setAttribute("role","alert");error.hidden=true;
 const conflictActions=document.createElement("div");conflictActions.className="resource-conflict-actions";conflictActions.hidden=true;
 const footer=document.createElement("div");footer.className="destination-footer";
 const cancel=button("Отмена",()=>overlay.remove());
 const save=button("Сохранить путь",()=>{
  const target=pathInput.value.trim();
  if(!target){error.hidden=false;error.textContent="Введите путь к файлу.";pathInput.focus();return}
  save.disabled=true;save.textContent="Обновляю ссылки…";
  try{
   const result=runHistoryAction("Перемещение ресурса: "+item.path,()=>renameArchiveResource(current,item,target));
   if(result.unchanged){overlay.remove();return}
   const wasSelected=selectedArchivePaths.delete(item.id);
   if(wasSelected)selectedArchivePaths.add(result.archivePath);
   selectedArchivePath=result.archivePath;
   disposeArchivePreview();
   overlay.remove();
   const details=["Путь изменён: "+result.path+" → "+result.newPath,"обновлено ссылок: "+result.updatedReferences];
   if(result.manifestUpdated)details.push("manifest обновлён");
   if(result.updatedPackageLogo)details.push("логотип пакета перепривязан");
   log("✓ "+details.join("; "));
   refreshLive({rerenderEditor:true,message:"Ресурс переименован / перемещён"});
  }catch(exception){
   save.disabled=false;save.textContent="Сохранить путь";
   // A rejected history transaction may rebuild the XML-backed model; refresh the selected item before retrying.
   const refreshedItem=buildArchiveInventory(current).items.find(entry=>resourceConflictKey(entry.path)===resourceConflictKey(item.path));
   if(refreshedItem)item=refreshedItem;
   const message=exception.message||String(exception);
   error.hidden=false;error.textContent=message;
   conflictActions.replaceChildren();
   if(/уже существует|занято/i.test(message)){
    const candidate=suggestConflictFreeResourcePath(target);
    error.textContent="Целевой путь уже занят. Перезаписывать существующий файл нельзя без отдельного подтверждения последствий.";
    const keepBoth=button("Сохранить оба файла",()=>{
     pathInput.value=candidate;
     conflictActions.hidden=true;
     error.hidden=true;
     save.click();
    });
    keepBoth.dataset.targetPath=candidate;
    keepBoth.title="Новый путь: "+candidate;
    const changePath=button("Указать другой путь",()=>{
     conflictActions.hidden=true;
     pathInput.focus();pathInput.select();
    });
    conflictActions.append(keepBoth,changePath);
    conflictActions.hidden=false;
   }else{
    conflictActions.hidden=true;
   }
   pathInput.focus();pathInput.select();
  }
 });
 save.className="primary";
 footer.append(cancel,save);
 modal.append(head,hint,label,error,conflictActions,footer);overlay.appendChild(modal);document.body.appendChild(overlay);
 overlay.addEventListener("click",event=>{if(event.target===overlay)overlay.remove()});
 pathInput.addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();save.click()}
  if(event.key==="Escape"){event.preventDefault();overlay.remove()}
 });
 pathInput.focus();pathInput.select();
}
function chooseArchiveResourceReplacement(item){
 if(!current||!item?.resource||item.isDirectory||item.status==="system")return;
 const picker=document.createElement("input");
 picker.type="file";picker.hidden=true;
 const extension=item.path.includes(".")?item.path.slice(item.path.lastIndexOf(".")).toLowerCase():"";
 if(extension)picker.accept=extension;
 document.body.appendChild(picker);
 picker.addEventListener("change",async()=>{
  const file=picker.files?.[0];picker.remove();
  if(!file)return;
  if(file.size>256*1024*1024&&!window.confirm("Файл имеет размер "+explorerByteLabel(file.size)+". Его bytes будут загружены в память редактора. Продолжить?"))return;
  try{
   const result=await runHistoryActionAsync("Замена содержимого: "+item.path,async()=>{
    const replaced=await replaceArchiveResource(current,item,file);
    if(!replaced.unchanged)await assertPackageSizeWithinLimit(current,"Замена ресурса");
    return replaced;
   });
   if(result.unchanged){
    log("Ресурс не изменён: выбранный файл содержит те же bytes.");
    return;
   }
   log("↻ Ресурс заменён: "+result.path+" · "+explorerByteLabel(result.oldSize)+" → "+explorerByteLabel(result.size)+(result.manifestUpdated?" · hash manifest обновлён":""));
   refreshLive({message:"Содержимое ресурса заменено"});
  }catch(error){
   log("✗ Ошибка замены ресурса: "+(error.stack||error));
   alert("Не удалось заменить ресурс:\n"+error.message);
  }
 });
 picker.addEventListener("cancel",()=>picker.remove(),{once:true});
 picker.click();
}
function restoreArchiveResourceReplacement(item){
 if(!current||!item?.resource)return;
 try{
  const result=runHistoryAction("Восстановление версии: "+item.path,()=>restoreLastResourceReplacement(current,item));
  log("↶ Восстановлена предыдущая версия: "+result.path+" · "+explorerByteLabel(result.size)+(result.restoredToOriginal?" · исходные ZIP bytes":"")+(result.remainingVersions?" · предыдущих версий в истории: "+result.remainingVersions:""));
  refreshLive({message:result.restoredToOriginal?"Исходные bytes восстановлены":"Предыдущая версия восстановлена"});
 }catch(error){
  alert("Не удалось восстановить предыдущую версию:\n"+error.message);
 }
}
function renderArchiveDetails(item){
 disposeArchivePreview();
 resourceDetails.replaceChildren();
 if(!item){
  const empty=document.createElement("div");empty.className="resource-preview-empty";
  empty.textContent="Выберите файл слева, чтобы увидеть свойства и предпросмотр.";
  resourceDetails.appendChild(empty);return;
 }
 const header=document.createElement("div");header.className="resource-detail-header";
 const headingWrap=document.createElement("div");
 const heading=document.createElement("h2");heading.textContent=item.name;
 const path=document.createElement("div");path.className="resource-detail-path";path.textContent=item.path;
 headingWrap.append(heading,path);
 const status=document.createElement("span");status.className="resource-status "+item.status;status.textContent=item.statusLabel;
 header.append(headingWrap,status);resourceDetails.appendChild(header);

 const meta=document.createElement("div");meta.className="resource-detail-meta";
 addResourceMeta(meta,"Тип",explorerTypeLabel(item.kind));
 addResourceMeta(meta,"Размер",explorerByteLabel(item.size));
 addResourceMeta(meta,"Сжатый размер",explorerByteLabel(item.compressedSize));
 addResourceMeta(meta,"CRC32",item.crc===null||item.crc===undefined?"—":Number(item.crc).toString(16).toUpperCase().padStart(8,"0"));
 addResourceMeta(meta,"Метод сжатия",item.compressionMethod===0?"Без сжатия":item.compressionMethod===8?"Deflate":item.compressionMethod??"—");
 addResourceMeta(meta,"Manifest",item.manifest?"Есть запись":"Нет записи");
 addResourceMeta(meta,"Количество ссылок",item.usageCount);
 addResourceMeta(meta,"Источник",item.source|| (item.entry?"Исходный ZIP":"Отсутствующая ссылка"));
 resourceDetails.appendChild(meta);

 const actionsRow=document.createElement("div");actionsRow.className="resource-detail-actions";
 if(item.entry&&!item.isDirectory){
  actionsRow.appendChild(button("Скачать на ПК",()=>downloadArchiveEntry(item).catch(error=>alert("Не удалось скачать файл:\n"+error.message))));
  if(item.resource){
   if(item.status!=="system"){
    actionsRow.appendChild(button("Переименовать / переместить",()=>openArchiveResourceRenameDialog(item)));
    actionsRow.appendChild(button("Заменить файл",()=>chooseArchiveResourceReplacement(item)));
    if(item.resource.replacementHistory?.length){
     actionsRow.appendChild(button("Восстановить предыдущую версию ("+item.resource.replacementHistory.length+")",()=>restoreArchiveResourceReplacement(item)));
    }
   }
   const remove=button("Удалить из пакета",()=>deleteArchiveResourceFromUi(item));
   remove.disabled=item.usageCount>0||item.status==="system";
   remove.title=remove.disabled
    ?(item.status==="system"?"Системный файл пакета нельзя удалить.":"Ресурс используется ("+item.usageCount+"). Сначала отвяжите все ссылки.")
    :"Удалить файл из рабочей копии архива. Исходный .siq останется без изменений.";
   actionsRow.appendChild(remove);
  }
 }
 if(resourceTargetItem){
  const target=locateContentItem(resourceTargetItem);
  if(target){
   const note=document.createElement("div");note.className="resource-target-note";
   note.textContent="Назначение: "+target.label;
   resourceDetails.appendChild(note);
  }
  const assign=button("Назначить выбранному блоку",()=>assignArchiveItemToTarget(item));
  assign.disabled=!target||!canAssignArchiveItem(item,resourceTargetItem);
  assign.title=assign.disabled?"Выберите существующий media-файл совместимого типа.":"Назначить этот ресурс content item";
  actionsRow.appendChild(assign);
  actionsRow.appendChild(button("Отменить выбор блока",()=>{resourceTargetItem=null;renderPackageExplorer()}));
 }
 if(actionsRow.childElementCount)resourceDetails.appendChild(actionsRow);

 const usages=document.createElement("section");usages.className="resource-usages";
 const usagesHeading=document.createElement("h3");usagesHeading.textContent="Использование";
 usages.appendChild(usagesHeading);
 if(item.usages.length){
  const list=document.createElement("ul");
  for(const usage of item.usages){
   const li=document.createElement("li");li.textContent=usage.label;list.appendChild(li);
  }
  usages.appendChild(list);
 }else{
  const message=document.createElement("div");message.className="resource-preview-empty";
  message.textContent=item.missing?"Ссылка встречается в контенте, но файл не найден в ZIP.":"На этот файл не найдено ссылок из контента.";
  usages.appendChild(message);
 }
 resourceDetails.appendChild(usages);

 const previewHeading=document.createElement("h3");previewHeading.textContent="Предпросмотр";
 resourceDetails.appendChild(previewHeading);
 const previewHost=document.createElement("div");previewHost.className="resource-preview-host";resourceDetails.appendChild(previewHost);
 const token=archivePreviewToken;
 renderArchivePreview(item,previewHost,current).then(cleanup=>{
  if(token===archivePreviewToken)archivePreviewCleanup=cleanup;
  else if(typeof cleanup==="function")cleanup();
 }).catch(error=>{
  if(token!==archivePreviewToken)return;
  const message=document.createElement("div");message.className="resource-preview-empty";
  message.textContent="Не удалось открыть предпросмотр: "+error.message;previewHost.replaceChildren(message);
 });
}
function renderPackageExplorer(){
 if(!current){
  resourceSummary.textContent="Откройте пакет для просмотра файлов.";
  resourceListCount.textContent="0";
  resourceList.replaceChildren();
  renderArchiveDetails(null);return;
 }
 const inventory=buildArchiveInventory(current);
 const savedFolder=resourceFolderFilter.value;
 const folderOptions=[["","Все папки"],["__root__","Корень пакета"],...inventory.folders.filter(Boolean).map(folder=>[folder,folder])];
 resourceFolderFilter.replaceChildren();
 for(const [value,label] of folderOptions){
  const option=document.createElement("option");option.value=value;option.textContent=label;resourceFolderFilter.appendChild(option);
 }
 resourceFolderFilter.value=folderOptions.some(([value])=>value===savedFolder)?savedFolder:"";
 if(resourceFolderFilter.value&&resourceFolderFilter.value!=="__root__")expandResourceFolderPath(resourceFolderFilter.value);
 renderResourceFolderTree(inventory);
 const query=resourceSearch.value.trim().toLocaleLowerCase();
 const folder=resourceFolderFilter.value,type=resourceTypeFilter.value,status=resourceStatusFilter.value;
 const minSizeKb=resourceSizeMin?.value.trim()?Number(resourceSizeMin.value):null;
 const maxSizeKb=resourceSizeMax?.value.trim()?Number(resourceSizeMax.value):null;
 const sizeFilterActive=minSizeKb!==null||maxSizeKb!==null;
 const sortMode=resourceSort?.value||"name";
 const rows=inventory.items.filter(item=>{
  if(query&&!item.path.toLocaleLowerCase().includes(query))return false;
  if(folder==="__root__"&&item.path.includes("/"))return false;
  if(folder&&folder!=="__root__"&&!(item.path===folder||item.path.startsWith(folder+"/")))return false;
  if(type!=="all"&&item.kind!==type)return false;
  if(status!=="all"&&item.status!==status)return false;
  if(sizeFilterActive){
   if(item.isDirectory||item.size===null||item.size===undefined)return false;
   if(minSizeKb!==null&&Number(item.size)<minSizeKb*1024)return false;
   if(maxSizeKb!==null&&Number(item.size)>maxSizeKb*1024)return false;
  }
  return true;
 });
 const comparePath=(a,b)=>a.path.localeCompare(b.path,"ru",{numeric:true,sensitivity:"base"});
 const compareSize=(a,b,direction=1)=>{
  const aKnown=a.size!==null&&a.size!==undefined&&Number.isFinite(Number(a.size));
  const bKnown=b.size!==null&&b.size!==undefined&&Number.isFinite(Number(b.size));
  if(aKnown!==bKnown)return aKnown?-1:1;
  if(!aKnown)return comparePath(a,b);
  return (Number(a.size)-Number(b.size))*direction||comparePath(a,b);
 };
 rows.sort((a,b)=>{
  if(sortMode==="size-asc")return compareSize(a,b,1);
  if(sortMode==="size-desc")return compareSize(a,b,-1);
  if(sortMode==="type")return a.kind.localeCompare(b.kind,"ru")||comparePath(a,b);
  if(sortMode==="status"){
   const rank={used:0,unused:1,missing:2,system:3};
   return (rank[a.status]??9)-(rank[b.status]??9)||comparePath(a,b);
  }
  return comparePath(a,b);
 });
 const deletionHistory=current.resourceDeletionHistory||[];
 const deletionCount=deletionHistory.reduce((sum,entry)=>sum+(entry?.kind==="batch"?(entry.records?.length||0):1),0);
 resourceSummary.replaceChildren(document.createTextNode("В исходном ZIP: "+inventory.stats.originalEntries+" · добавлено в сессию: "+inventory.stats.addedInSession+" · удалено в сессии: "+deletionCount+" · файлов: "+inventory.stats.files+" · используются: "+inventory.stats.used+" · не используются: "+inventory.stats.unused+" · отсутствуют: "+inventory.stats.missing));
 if(undoRedoHistory.canUndo&&/удаление|очистка/i.test(undoRedoHistory.undoLabel)){
  const undo=button("Отменить последнее удаление",()=>applyHistoryDirection("undo"));
  undo.className="resource-undo-button";
  resourceSummary.appendChild(undo);
 }
 renderResourceBulkActions(rows,inventory);
 resourceListCount.textContent=rows.length+" / "+inventory.items.length;
 resourceList.replaceChildren();
 for(const item of rows){
  const wrapper=document.createElement("div");wrapper.className="resource-row-wrap";
  const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.className="resource-row-checkbox";
  checkbox.checked=selectedArchivePaths.has(item.id);
  checkbox.disabled=!item.entry||item.missing||item.isDirectory;
  checkbox.title=checkbox.disabled?"Можно выбрать только существующий файл":"Добавить файл в ZIP для группового скачивания";
  checkbox.setAttribute("aria-label","Выбрать "+item.path);
  checkbox.addEventListener("change",()=>{
   if(checkbox.checked)selectedArchivePaths.add(item.id);
   else selectedArchivePaths.delete(item.id);
   renderResourceBulkActions(rows,inventory);
  });
  const row=button("",()=>{selectedArchivePath=item.id;renderPackageExplorer()});
  row.className="resource-row"+(selectedArchivePath===item.id?" selected":"");
  row.dataset.size=item.size??"";row.dataset.kind=item.kind;row.dataset.status=item.status;
  const name=document.createElement("strong");name.className="resource-row-name";name.textContent=item.name;
  const statusLabel=document.createElement("span");statusLabel.className="resource-status "+item.status;statusLabel.textContent=item.statusLabel;
  const pathLabel=document.createElement("span");pathLabel.className="resource-row-path";pathLabel.textContent=item.path;
  const meta=document.createElement("span");meta.className="resource-row-meta";
  const size=document.createElement("span");size.textContent=item.isDirectory?"Папка":explorerByteLabel(item.size);
  const uses=document.createElement("span");uses.textContent=item.usageCount+" ссыл.";
  meta.append(size,uses);
  row.append(name,statusLabel,pathLabel,meta);wrapper.append(checkbox,row);resourceList.appendChild(wrapper);
 }
 const selectedItem=rows.find(item=>item.id===selectedArchivePath)||null;
 if(selectedItem)renderArchiveDetails(selectedItem);
 else{
  selectedArchivePath="";
  renderArchiveDetails(null);
 }
}
function openResourceExplorerForItem(item){
 resourceTargetItem=item;
 selectedArchivePath="";
 setExplorerView("resources");
}
function assignArchiveItemToTarget(archiveItem){
 const target=locateContentItem(resourceTargetItem);
 if(!target||!canAssignArchiveItem(archiveItem,target.item)){
  alert("Этот файл нельзя назначить выбранному content item. Проверьте тип ресурса.");
  return;
 }
 try{
  runHistoryAction("Назначение ресурса: "+archiveItem.path,()=>setItemResource(current,target.item,archiveItem.resource));
  current.dirty=true;
  log("✓ Ресурс подключён из архива: "+archiveItem.path);
  const previewLabel=archiveItem.path;
  resourceTargetItem=null;
  setExplorerView("editor");
  refreshValidationAndSelection();
  updateStatus(validatePack(current.model),"Ресурс подключён: "+previewLabel);
 }catch(error){
  log("✗ Не удалось подключить ресурс: "+(error.stack||error));
  alert("Не удалось подключить ресурс:\n"+error.message);
 }
}

function button(label,fn){const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=fn;return b}
function copyAcrossButton(kind,id){
 const b=button("Копировать в другой пакет",()=>copyPackEntityAcrossPrompt(kind,id));
 b.disabled=openedPacks.filter(pack=>pack!==current).length===0;
 if(b.disabled)b.title="Сначала откройте второй SIQ-пакет";
 return b;
}
function field(label,value,onInput,type="text"){const w=document.createElement("label");w.className="editor-field";const s=document.createElement("span");s.textContent=label;w.appendChild(s);const e=document.createElement(type==="textarea"?"textarea":"input");if(type!=="textarea")e.type=type;e.value=value??"";if(type==="textarea")e.rows=5;e.addEventListener("focus",()=>beginPendingHistoryEdit(e));e.addEventListener("blur",()=>flushPendingHistoryEdit());e.addEventListener("input",()=>{beginPendingHistoryEdit(e);onInput(e.value);refreshLive();schedulePendingHistoryEdit()});w.appendChild(e);return w}

function renderTree({expandSelected=false}={}){
 const scrollTop=tree.scrollTop;
 const expanded=new Set(Array.from(tree.querySelectorAll("details[open]")).map(x=>x.dataset.nodeId));
 if(expandSelected&&selected){
  if(selected.kind==="round")expanded.add(selected.id);
  else if(selected.kind==="theme"){const location=locateTheme(selected.id);if(location){expanded.add(location.roundId);expanded.add(selected.id)}}
  else if(selected.kind==="question"){const location=locateQuestion(selected.id);if(location){expanded.add(location.roundId);expanded.add(location.themeId)}}
 }
 tree.replaceChildren();
 if(!current){tree.textContent="Пакет ещё не открыт.";return}
 const packEdit=button("Пакет: "+(current.model.metadata.name||current.fileName),()=>selectPackage());packEdit.className="node";if(selected?.kind==="package")packEdit.classList.add("selected");tree.appendChild(packEdit);
 const addRound=button("+ Добавить раунд",()=>mutate(()=>createRound(current)));addRound.className="node add-node";tree.appendChild(addRound);
 for(const r of current.model.rounds){
  const rd=document.createElement("details");rd.dataset.nodeId=r.id;rd.open=expanded.has(r.id)||(expanded.size===0&&!selected);
  const rs=document.createElement("summary");rs.textContent=(r.order+1)+". "+(r.name||"(без названия)");rs.dataset.id=r.id;rs.dataset.kind="round";if(selected?.id===r.id)rs.classList.add("selected");rd.appendChild(rs);
  const tw=document.createElement("div");tw.className="tree-level themes-level";
  for(const t of r.themes){
   const td=document.createElement("details");td.dataset.nodeId=t.id;td.open=expanded.has(t.id);
   const ts=document.createElement("summary");ts.textContent=(t.order+1)+". "+(t.name||"(без названия)");ts.dataset.id=t.id;ts.dataset.kind="theme";if(selected?.id===t.id)ts.classList.add("selected");td.appendChild(ts);
   const qs=document.createElement("div");qs.className="tree-level questions-level";
   for(const q of t.questions){
    const b=button((q.price||0)+" — "+String(q.questionContent?.find(x=>!x.isRef)?.value||"(медиа/пусто)").slice(0,70),null);b.className="node question";b.dataset.id=q.id;b.dataset.kind="question";if(selected?.id===q.id)b.classList.add("selected");qs.appendChild(b)
   }
   td.appendChild(qs);tw.appendChild(td)
  }
  rd.appendChild(tw);tree.appendChild(rd)
 }
 tree.scrollTop=scrollTop;
}
function ensureEntityInfoNode(entity){
 if(entity.info?.sourceNode)return entity.info;
 const doc=entity.sourceNode.ownerDocument;
 const node=doc.createElementNS(entity.sourceNode.namespaceURI,"info");
 const contentName=Array.isArray(entity.themes)?"themes":"questions";
 const contentNode=Array.from(entity.sourceNode.children).find(child=>child.localName===contentName);
 if(contentNode)entity.sourceNode.insertBefore(node,contentNode);
 else entity.sourceNode.appendChild(node);
 entity.info={
  attributes:{},
  authors:[],
  sources:[],
  comments:"",
  showmanComments:"",
  extension:"",
  sourceNode:node
 };
 return entity.info;
}
function ensureRoundInfoNode(round){return ensureEntityInfoNode(round);}
function insertEntityInfoNode(infoNode,key,node){
 const order=["authors","sources","comments","showmanComments","extension"];
 const rank=order.indexOf(key);
 const next=Array.from(infoNode.children).find(child=>{
  const childRank=order.indexOf(child.localName);
  return childRank>=0&&childRank>rank;
 });
 if(next)infoNode.insertBefore(node,next);
 else infoNode.appendChild(node);
}
function insertRoundInfoNode(infoNode,key,node){return insertEntityInfoNode(infoNode,key,node);}
function setEntityInfoText(entity,key,value){
 const next=String(value??"");
 let info=entity.info;
 let infoNode=info?.sourceNode||null;
 if(!infoNode&&!next){
  if(info)info[key]=next;
  return;
 }
 if(!infoNode){info=ensureEntityInfoNode(entity);infoNode=info.sourceNode;}
 let node=Array.from(infoNode.children).find(child=>child.localName===key)||null;
 if(!node){
  if(!next){
   info[key]=next;
   return;
  }
  node=infoNode.ownerDocument.createElementNS(infoNode.namespaceURI,key);
  insertEntityInfoNode(infoNode,key,node);
 }
 node.textContent=next;
 info[key]=next;
 current.dirty=true;
}
function setRoundInfoText(round,key,value){return setEntityInfoText(round,key,value);}
function ensureEntityInfoList(entity,key,childName){
 const info=ensureEntityInfoNode(entity);
 let container=Array.from(info.sourceNode.children).find(child=>child.localName===key)||null;
 if(!container){
  container=info.sourceNode.ownerDocument.createElementNS(info.sourceNode.namespaceURI,key);
  insertEntityInfoNode(info.sourceNode,key,container);
 }
 if(!Array.isArray(info[key]))info[key]=[];
 return {info,container,entries:info[key]};
}
function ensureRoundInfoList(round,key,childName){return ensureEntityInfoList(round,key,childName);}
function renderEntityInfoListEditor(entity,key,childName,label,kind){
 const ownerLabel=kind==="theme"?"темы":"раунда";
 const box=document.createElement("section");
 box.className="round-info-list-editor";
 if(kind==="round")box.dataset.roundInfoList=key;
 else box.dataset.themeInfoList=key;
 const heading=document.createElement("div");
 heading.className="subheading";
 heading.textContent=label;
 box.appendChild(heading);
 const entries=entity.info?.[key]||[];
 if(!entries.length){
  const empty=document.createElement("div");
  empty.className="round-info-empty";
  empty.textContent="Пока не добавлено.";
  box.appendChild(empty);
 }
 entries.forEach((entry,index)=>{
  const row=document.createElement("div");
  row.className="round-info-list-row";
  const edit=field(label.slice(0,-1)+" "+(index+1),entry.value,value=>{
   entry.value=value;
   if(entry.sourceNode)entry.sourceNode.textContent=value;
   current.dirty=true;
  });
  const input=edit.querySelector("input,textarea");
  if(input){
   if(kind==="round")input.dataset.roundInfoEntry=key;
   else input.dataset.themeInfoEntry=key;
  }
  const remove=button("Удалить",()=>{
   const currentIndex=(entity.info?.[key]||[]).indexOf(entry);
   if(currentIndex<0)return;
   runHistoryAction("Удаление записи («"+label+"») "+ownerLabel,()=>{
    entry.sourceNode?.remove();
    entity.info[key].splice(currentIndex,1);
    current.dirty=true;
   });
   refreshLive({rerenderEditor:true,message:label+" "+ownerLabel+": запись удалена"});
  });
  remove.className="round-info-remove";
  row.append(edit,remove);
  box.appendChild(row);
 });
 const add=button("+ Добавить запись",()=>{
  runHistoryAction("Добавление записи («"+label+"») "+ownerLabel,()=>{
   const target=ensureEntityInfoList(entity,key,childName);
   const node=target.info.sourceNode.ownerDocument.createElementNS(target.info.sourceNode.namespaceURI,childName);
   target.container.appendChild(node);
   target.entries.push({name:childName,value:"",attributes:{},sourceNode:node});
   current.dirty=true;
  });
  refreshLive({rerenderEditor:true,message:label+" "+ownerLabel+": запись добавлена"});
 });
 add.className="round-info-add";
 box.appendChild(add);
 return box;
}
function renderRoundInfoListEditor(round,key,childName,label){return renderEntityInfoListEditor(round,key,childName,label,"round");}
function renderEntityInfoEditor(entity,host,kind){
 const ownerLabel=kind==="theme"?"теме":"раунде";
 const box=document.createElement("section");
 box.className="round-info-editor";
 box.dataset.entityInfo=kind;
 const heading=document.createElement("div");
 heading.className="subheading";
 heading.textContent="Дополнительная информация о "+ownerLabel;
 box.appendChild(heading);
 const fields=[
  ["comments","Комментарии"],
  ["showmanComments","Комментарий ведущему"],
  ["extension","Дополнительные данные (extension)"]
 ];
 for(const [key,label] of fields){
  const wrapper=field(label,entity.info?.[key]||"",value=>{
   if(kind==="round")setRoundInfoText(entity,key,value);
   else setEntityInfoText(entity,key,value);
  },"textarea");
  const input=wrapper.querySelector("textarea");
  if(input){
   if(kind==="round")input.dataset.roundInfoField=key;
   else input.dataset.themeInfoField=key;
  }
  box.appendChild(wrapper);
 }
 box.append(
  renderEntityInfoListEditor(entity,"authors","author","Авторы",kind),
  renderEntityInfoListEditor(entity,"sources","source","Источники",kind)
 );
 host.appendChild(box);
}
function renderRoundInfoEditor(round,host){return renderEntityInfoEditor(round,host,"round");}
function renderThemeInfoEditor(theme,host){return renderEntityInfoEditor(theme,host,"theme");}
function roundTypeField(round){
 const wrap=document.createElement("label");wrap.className="editor-field question-type-field round-type-field";
 const caption=document.createElement("span");caption.textContent="Тип раунда";
 const select=document.createElement("select");select.className="round-type-select";
 const description=document.createElement("small");description.className="editor-help";
 for(const type of getRoundTypeOptions(round.type)){
  const option=document.createElement("option");
  option.value=type.value;option.textContent=type.label;option.title=type.description;
  select.appendChild(option);
 }
 select.value=round.type??"";
 description.textContent=getRoundTypeDescription(round.type);
 select.addEventListener("change",()=>{
  round.type=select.value;
  if(round.type)round.sourceNode.setAttribute("type",round.type);
  else round.sourceNode.removeAttribute("type");
  current.dirty=true;
  description.textContent=getRoundTypeDescription(round.type);
  refreshLive();
 });
 wrap.append(caption,select,description);
 return wrap;
}
function editRound(r){
 actions.innerHTML="";const f=document.createElement("div");f.className="editor";
 f.appendChild(field("Название",r.name,v=>{r.name=v;r.sourceNode.setAttribute("name",v);current.dirty=true}));
 f.appendChild(roundTypeField(r));
 renderRoundInfoEditor(r,f);
 actions.append(f,button("+ Добавить тему",()=>mutate(()=>createTheme(current,r.id))),button("Копировать раунд",()=>mutate(()=>copyRound(current,r.id))),copyAcrossButton("round",r.id),button("Удалить раунд",()=>deleteRoundAndRefresh(r.id)));
}
function editTheme(t){
 actions.innerHTML="";const f=document.createElement("div");f.className="editor";
 f.appendChild(field("Название",t.name,v=>{t.name=v;t.sourceNode.setAttribute("name",v);current.dirty=true}));
 renderThemeInfoEditor(t,f);
 actions.append(f,button("+ Добавить вопрос",()=>mutate(()=>createQuestion(current,t.id))),button("Копировать тему → выбрать раунд",()=>copyThemePrompt(t.id)),copyAcrossButton("theme",t.id),button("Удалить тему",()=>deleteThemeAndRefresh(t.id)));
}
function createTheme(pack,roundId){
 const r=findRound(roundId);if(!r)throw Error("Раунд не найден.");
 let themesNode=r.sourceNode.querySelector(":scope > themes");if(!themesNode){themesNode=pack.model.sourceDocument.createElementNS(pack.model.namespace,"themes");r.sourceNode.appendChild(themesNode)}
 const n=pack.model.sourceDocument.createElementNS(pack.model.namespace,"theme");n.setAttribute("id",crypto.randomUUID());n.setAttribute("name","Новая тема");
 themesNode.appendChild(n);
 const t={id:n.getAttribute("id"),name:"Новая тема",order:r.themes.length,info:null,questions:[],attributes:{id:n.getAttribute("id"),name:"Новая тема"},sourceNode:n,roundIndex:r.order};
 r.themes.push(t);pack.dirty=true;return t.id
}
function createQuestion(pack,themeId){
 const t=findTheme(themeId);if(!t)throw Error("Тема не найдена.");
 let qs=t.sourceNode.querySelector(":scope > questions");if(!qs){qs=pack.model.sourceDocument.createElementNS(pack.model.namespace,"questions");t.sourceNode.appendChild(qs)}
 const doc=pack.model.sourceDocument;
 const n=doc.createElementNS(pack.model.namespace,"question");n.setAttribute("id",crypto.randomUUID());n.setAttribute("price","100");n.setAttribute("type","forAll");
 const params=doc.createElementNS(pack.model.namespace,"params");
 const makeContentParam=(name)=>{const p=doc.createElementNS(pack.model.namespace,"param");p.setAttribute("name",name);p.setAttribute("type","content");return p};
 const makeTextItem=()=>{const item=doc.createElementNS(pack.model.namespace,"item");item.setAttribute("id",crypto.randomUUID());item.setAttribute("type","text");item.textContent="";return item};
 const qp=makeContentParam("question");const qi=makeTextItem();qp.appendChild(qi);
 const ap=makeContentParam("answer");const ai=makeTextItem();ap.appendChild(ai);
 params.appendChild(qp);params.appendChild(ap);n.appendChild(params);
 const right=doc.createElementNS(pack.model.namespace,"right");const wrong=doc.createElementNS(pack.model.namespace,"wrong");n.appendChild(right);n.appendChild(wrong);qs.appendChild(n);
 const makeItemModel=(item)=>({id:item.getAttribute("id"),type:"text",value:"",duration:null,placement:"screen",waitForFinish:null,isRef:false,attributes:{id:item.getAttribute("id"),type:"text"},sourceNode:item});
 const qItem=makeItemModel(qi),aItem=makeItemModel(ai);
 const q={id:n.getAttribute("id"),price:100,type:"forAll",parameters:[
   {id:crypto.randomUUID(),name:"question",type:"content",value:[qItem],attributes:{name:"question",type:"content"},sourceNode:qp},
   {id:crypto.randomUUID(),name:"answer",type:"content",value:[aItem],attributes:{name:"answer",type:"content"},sourceNode:ap}
 ],questionContent:[qItem],right:[],wrong:[],attributes:{id:n.getAttribute("id"),price:"100",type:"forAll"},sourceNode:n};
 q.parameters[0].value=q.questionContent;t.questions.push(q);pack.dirty=true;return q.id
}
function createRound(pack){
 const roundsNode=pack.model.sourceDocument.querySelector(":scope > rounds");if(!roundsNode)throw Error("В XML отсутствует <rounds>.");
 const n=pack.model.sourceDocument.createElementNS(pack.model.namespace,"round");n.setAttribute("id",crypto.randomUUID());n.setAttribute("name","Новый раунд");
 const themes=pack.model.sourceDocument.createElementNS(pack.model.namespace,"themes");n.appendChild(themes);roundsNode.appendChild(n);
 const r={id:n.getAttribute("id"),name:"Новый раунд",type:"",order:pack.model.rounds.length,info:null,themes:[],attributes:{id:n.getAttribute("id"),name:"Новый раунд"},sourceNode:n};pack.model.rounds.push(r);pack.dirty=true;return r.id
}
function ensureQuestionParam(q){
 let p=q.sourceNode.querySelector(":scope > params > param[name='question']");if(p)return p;
 let params=q.sourceNode.querySelector(":scope > params");if(!params){params=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"params");q.sourceNode.appendChild(params)}
 p=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"param");p.setAttribute("name","question");p.setAttribute("type","content");params.appendChild(p);return p
}
function syncAnswer(q,name,value){
 Array.from(q.sourceNode.children).filter(x=>x.localName===name).forEach(x=>x.remove());
 const lines=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(lines.length){const container=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,name);for(const line of lines){const answer=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"answer");answer.textContent=line;container.appendChild(answer)}q.sourceNode.appendChild(container)}
 q[name]=lines;current.dirty=true;refreshLive()
}
function itemTypeOptions(selected){
 const options=[["text","Текст"],["image","Изображение"],["audio","Аудио"],["video","Видео"],["html","HTML"]];
 if(selected&&!options.some(([value])=>value===selected))options.push([selected,"Неизвестный тип — "+selected]);
 return options.map(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;option.selected=value===selected;return option});
}
function setItemType(item,v){
 item.type=v;
 item.sourceNode.setAttribute("type",v);
 if(v==="text"||v==="html"){
   item.isRef=false;
   item.sourceNode.removeAttribute("isRef");
   item.sourceNode.removeAttribute("value");
   item.value="";
   item.sourceNode.textContent="";
 }else if(v!=="text"&&v!=="html"){
   if(!item.value)item.value="";
   item.sourceNode.removeAttribute("value");
   item.sourceNode.textContent=item.value;
 }
 current.dirty=true;refreshLive();
}
function setItemValue(item,v){
 item.value=v;
 if(item.sourceNode.hasAttribute("value")) item.sourceNode.setAttribute("value",v);
 else item.sourceNode.textContent=v;
 current.dirty=true;
}
function contentParamTitle(name){
 const n=String(name||"").toLowerCase();
 if(n==="question")return "Вопрос";
 if(n==="answer")return "Ответ";
 return "Контент: "+(name||"без имени");
}
function refreshContentItemLabels(list,param){
 Array.from(list.children).forEach((row,index)=>{
  const item=param.value[index];
  if(!item)return;
  row.dataset.itemId=item.id;
  const label=row.querySelector(".content-item-title");
  if(label)label.textContent=contentParamTitle(param.name)+" — элемент "+(index+1)+" ("+(item.type||"без типа")+")";
  const handle=row.querySelector(".drag-handle");
  if(handle){
   handle.setAttribute("aria-label","Переместить элемент "+(index+1));
   handle.title="Перетащите элемент или используйте стрелки ↑ / ↓";
  }
 });
}
function clearContentDragState(list){
 if(!list)return;
 for(const row of list.querySelectorAll(".is-dragging,.drop-before,.drop-after")){
  row.classList.remove("is-dragging","drop-before","drop-after");
 }
 activeContentDrag=null;
}
function reorderContentItemInList(param,list,sourceId,targetId,position){
 const sourceRow=Array.from(list.children).find(row=>row.dataset.itemId===sourceId);
 const targetRow=Array.from(list.children).find(row=>row.dataset.itemId===targetId);
 if(!sourceRow||!targetRow||sourceId===targetId)return false;
 try{
  const changed=runHistoryAction("Изменение порядка контента",()=>moveContentItem(current,param,sourceId,targetId,position));
  if(!changed)return false;
  const reference=position==="after"?targetRow.nextSibling:targetRow;
  list.insertBefore(sourceRow,reference);
  rebuildPackReferences(current);
  refreshContentItemLabels(list,param);
  refreshParallelContentList(list,param);
  const newIndex=param.value.findIndex(item=>item.id===sourceId);
  log("↕ Элемент перемещён на позицию "+(newIndex+1)+" в параметре «"+(param.name||"без имени")+"»");
  refreshLive({message:"Порядок элементов обновлён"});
  return true;
 }catch(error){
  log("✗ Не удалось переместить элемент: "+error.message);
  updateStatus(validatePack(current.model),"Ошибка перестановки элементов");
  return false;
 }
}
function createContentItemDragHandle(param,list,row,item){
 const handle=document.createElement("span");
 handle.className="drag-handle";
 handle.draggable=true;
 handle.tabIndex=0;
 handle.setAttribute("role","button");
 handle.setAttribute("aria-label","Переместить элемент");
 handle.title="Перетащите элемент или используйте стрелки ↑ / ↓";
 handle.textContent="⠿";
 handle.addEventListener("dragstart",event=>{
  activeContentDrag={param,itemId:item.id};
  row.classList.add("is-dragging");
  if(event.dataTransfer){
   event.dataTransfer.effectAllowed="move";
   event.dataTransfer.setData("text/plain",item.id);
  }
 });
 handle.addEventListener("dragend",()=>clearContentDragState(list));
 handle.addEventListener("keydown",event=>{
  if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;
  const index=param.value.findIndex(entry=>entry.id===item.id);
  const target=param.value[index+(event.key==="ArrowUp"?-1:1)];
  if(!target)return;
  event.preventDefault();
  const position=event.key==="ArrowUp"?"before":"after";
  reorderContentItemInList(param,list,item.id,target.id,position);
  handle.focus();
 });
 row.addEventListener("dragover",event=>{
  if(!activeContentDrag)return;
  if(activeContentDrag.param!==param){
   event.preventDefault();
   if(event.dataTransfer)event.dataTransfer.dropEffect="none";
   return;
  }
  if(activeContentDrag.itemId===item.id)return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect="move";
  const rect=row.getBoundingClientRect();
  const after=event.clientY>=rect.top+rect.height/2;
  row.classList.toggle("drop-before",!after);
  row.classList.toggle("drop-after",after);
 });
 row.addEventListener("dragleave",event=>{
  if(event.relatedTarget&&row.contains(event.relatedTarget))return;
  row.classList.remove("drop-before","drop-after");
 });
 row.addEventListener("drop",event=>{
  if(!activeContentDrag)return;
  event.preventDefault();
  if(activeContentDrag.param!==param){
   clearContentDragState(list);
   return;
  }
  const sourceId=activeContentDrag.itemId;
  const rect=row.getBoundingClientRect();
  const after=event.clientY>=rect.top+rect.height/2;
  reorderContentItemInList(param,list,sourceId,item.id,after?"after":"before");
  clearContentDragState(list);
 });
 return handle;
}
function isContentItemParallelToNext(item){
 const raw=String(item?.waitForFinish??"").trim();
 return /^false$/i.test(raw)||raw==="0";
}
function refreshParallelContentList(list,param){
 Array.from(list.children).forEach((row,index)=>{
  const item=param.value.find(entry=>entry.id===row.dataset.itemId);
  const badge=row.querySelector(".content-item-parallel-badge");
  const toggle=row.querySelector(".content-item-parallel-toggle");
  if(!item||!badge||!toggle)return;
  const joinsNext=isContentItemParallelToNext(item);
  const joinsPrevious=index>0&&isContentItemParallelToNext(param.value[index-1]);
  row.classList.toggle("content-item-parallel",joinsNext||joinsPrevious);
  badge.hidden=!(joinsNext||joinsPrevious);
  badge.textContent=joinsNext&&joinsPrevious
   ?"Одновременная цепочка"
   :joinsPrevious?"Одновременно с предыдущим":"Одновременно со следующим";
  toggle.textContent=joinsNext?"Разъединить":"Объединить со следующим";
  toggle.disabled=index===param.value.length-1;
  toggle.title=index===param.value.length-1
   ?"У последнего элемента нет следующего блока."
   :joinsNext?"Остановить одновременное воспроизведение со следующим элементом."
   :"Запустить следующий элемент одновременно с этим.";
 });
}
function renderContentParameter(param,host,addButton=true){
 const box=document.createElement("div");
 box.className="content-parameter";
 const title=document.createElement("div");
 title.className="subheading";
 title.textContent=contentParamTitle(param.name);
 box.appendChild(title);
 const parallelHelp=document.createElement("small");
 parallelHelp.className="content-parallel-help";
 parallelHelp.textContent="Чтобы запустить соседние элементы одновременно, нажмите «Объединить со следующим» у каждого элемента, кроме последнего. Для одного общего экрана установите у всех элементов «Основной экран».";
 box.appendChild(parallelHelp);
 const list=document.createElement("div");
 const refreshParallelControls=()=>refreshParallelContentList(list,param);
 list.className="item-list";
 const render=()=>{
   list.innerHTML="";
   param.value.forEach((item,i)=>{
     const row=document.createElement("div");
     row.className="content-item";
     row.dataset.itemId=item.id;
     const head=document.createElement("div");
     head.className="item-head";
     const label=document.createElement("b");
     label.className="content-item-title";
     label.textContent=contentParamTitle(param.name)+" — элемент "+(i+1)+" ("+(item.type||"без типа")+")";
     head.appendChild(createContentItemDragHandle(param,list,row,item));
     head.appendChild(label);
     const parallelBadge=document.createElement("span");
     parallelBadge.className="content-item-parallel-badge";
     parallelBadge.hidden=true;
     const parallelToggle=button("Объединить со следующим",()=>{
       const currentIndex=param.value.findIndex(entry=>entry.id===item.id);
       if(currentIndex<0||currentIndex>=param.value.length-1)return;
       const shouldJoin=!isContentItemParallelToNext(item);
       runHistoryAction(shouldJoin?"Объединение элементов контента":"Разделение элементов контента",()=>{
         if(shouldJoin){
           item.waitForFinish="false";
           item.sourceNode.setAttribute("waitForFinish","false");
         }else{
           const original=item.attributes?.waitForFinish;
           if(original!=null&&!/^false$/i.test(String(original).trim())&&String(original).trim()!=="0"){
             item.waitForFinish=original;
             item.sourceNode.setAttribute("waitForFinish",original);
           }else{
             item.waitForFinish=null;
             item.sourceNode.removeAttribute("waitForFinish");
           }
         }
         current.dirty=true;
       });
       refreshParallelControls();
       refreshLive();
     });
     parallelToggle.classList.add("content-item-parallel-toggle");
     head.append(parallelBadge,parallelToggle);
     head.appendChild(button("Удалить элемент",()=>{
       const currentIndex=param.value.findIndex(entry=>entry.id===item.id);
       if(currentIndex<0)return;
       runHistoryAction("Удаление элемента контента",()=>{
        item.sourceNode.remove();
        param.value.splice(currentIndex,1);
        rebuildPackReferences(current);
        current.dirty=true;
       });
       refreshValidationAndSelection();
     }));
     row.appendChild(head);

     const fs=document.createElement("div");
     fs.className="item-fields";

     const typeLabel=document.createElement("label");
     typeLabel.className="editor-field";
     const typeSpan=document.createElement("span");
     typeSpan.textContent="Тип элемента";
     const typeSel=document.createElement("select");
     for(const o of itemTypeOptions(item.type))typeSel.appendChild(o);
     typeSel.onchange=()=>{
       setItemType(item,typeSel.value);
       rebuildPackReferences(current);
       refreshValidationAndSelection();
     };
     typeLabel.append(typeSpan,typeSel);
     fs.appendChild(typeLabel);

     const valueLabel=document.createElement("label");
     valueLabel.className="editor-field value-field";
     const valueSpan=document.createElement("span");
     valueSpan.textContent=(item.isRef||["image","audio","video"].includes(item.type))?"Путь / файл":"Текст";
     const value=document.createElement("textarea");
     value.rows=3;
     value.value=item.value||"";
     value.placeholder=["image","audio","video"].includes(item.type)?"Имя файла ресурса":"Введите текст";
     value.addEventListener("input",()=>{
       setItemValue(item,value.value);
       rebuildPackReferences(current);
       refreshLive();
       if(item.isRef)renderResourcePreview(item,row);
     });
     valueLabel.append(valueSpan,value);
     fs.appendChild(valueLabel);

     const placement=document.createElement("label");
     placement.className="editor-field placement-field";
     const ps=document.createElement("span");
     ps.textContent="Где показывать элемент";
     const pe=document.createElement("select");
     pe.className="placement-select";
     const placementOptions=[
       ["screen","Основной экран"],
       ["replic","Реплика ведущего"],
       ["background","Фоновое воспроизведение"]
     ];
     for(const [code,label] of placementOptions){
       const option=document.createElement("option");
       option.value=code;option.textContent=label;
       pe.appendChild(option);
     }
     const currentPlacement=String(item.placement||"screen");
     if(!placementOptions.some(([code])=>code===currentPlacement)){
       const unknown=document.createElement("option");
       unknown.value=currentPlacement;
       unknown.textContent="Неизвестное значение — "+currentPlacement;
       pe.appendChild(unknown);
     }
     pe.value=currentPlacement;
     pe.addEventListener("change",()=>{
       item.placement=pe.value;
       item.sourceNode.setAttribute("placement",pe.value);
       current.dirty=true;
       refreshLive();
     });
     placement.append(ps,pe);
     const placementHelp=document.createElement("small");
     placementHelp.className="field-help";
     placementHelp.textContent="Основной экран — обычный контент; реплика — текст ведущего; фон — воспроизведение за основным контентом.";
     placement.appendChild(placementHelp);
     fs.appendChild(placement);

     const duration=document.createElement("div");
     duration.className="editor-field duration-field";
     const ds=document.createElement("span");
     ds.textContent="Продолжительность (часы : минуты : секунды)";
     const durationParts=document.createElement("div");
     durationParts.className="duration-input-group";
     const durationPattern=/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/;
     const rawDuration=String(item.duration??"").trim();
     const parsedDuration=durationPattern.exec(rawDuration);
     const parsedParts=parsedDuration?parsedDuration.slice(1).map(Number):null;
     const parsedDurationValid=!!parsedParts&&parsedParts[0]<=99&&parsedParts[1]<=59&&parsedParts[2]<=59;
     const durationPartsMeta=[
       {name:"hours",short:"ч",label:"Часы",max:99},
       {name:"minutes",short:"мин",label:"Минуты",max:59},
       {name:"seconds",short:"с",label:"Секунды",max:59}
     ];
     const durationInputs=[];
     const lastCommittedParts=parsedDurationValid?parsedParts.map(value=>String(value).padStart(2,"0")):["","",""];
     durationPartsMeta.forEach((part,index)=>{
       const group=document.createElement("div");
       group.className="duration-part-group";
       const input=document.createElement("input");
       input.type="text";
       input.inputMode="numeric";
       input.autocomplete="off";
       input.maxLength=2;
       input.pattern="[0-9]{0,2}";
       input.className="duration-part";
       input.dataset.part=part.name;
       input.setAttribute("aria-label",part.label);
       input.placeholder="00";
       input.value=lastCommittedParts[index];
       const unit=document.createElement("span");
       unit.textContent=part.short;
       group.append(input,unit);
       durationParts.appendChild(group);
       durationInputs.push({input,part,index});
     });
     const durationHelp=document.createElement("small");
     durationHelp.className="field-help duration-help";
     const durationAutoButton=document.createElement("button");
     durationAutoButton.type="button";
     durationAutoButton.className="duration-auto-button";
     durationAutoButton.textContent="Автоматически";
     durationAutoButton.title="Убрать duration и оставить время на усмотрение SIGame";
     durationAutoButton.disabled=!item.duration;
     if(rawDuration&&!parsedDurationValid){
       durationHelp.classList.add("field-help-warning");
       durationHelp.textContent="В пакете сохранено нестандартное значение: "+rawDuration+". Заполните поля для замены или нажмите «Автоматически».";
     }else if(rawDuration&&parsedDurationValid&&rawDuration!==lastCommittedParts.join(":")){
       durationHelp.textContent="Старый формат будет приведён к HH:MM:SS только после изменения значения.";
     }else{
       durationHelp.textContent="Оставьте все поля пустыми для автоматической продолжительности.";
     }
     const commitDuration=()=>{
       const values=durationInputs.map(({input})=>input.value.trim());
       const parsed=values.map((value,index)=>value===""?0:Number(value));
       const invalid=durationPartsMeta.find((part,index)=>parsed[index]>part.max||!Number.isInteger(parsed[index]));
       if(invalid)return false;
       if(!values.some(Boolean)){
         item.duration=null;
         item.sourceNode.removeAttribute("duration");
         lastCommittedParts.fill("");
         durationHelp.textContent="Оставлено автоматическое время.";
       }else{
         const canonical=parsed.map(value=>String(value).padStart(2,"0")).join(":");
         item.duration=canonical;
         item.sourceNode.setAttribute("duration",canonical);
         values.forEach((value,index)=>{lastCommittedParts[index]=value===""?"00":value.padStart(2,"0")});
         durationHelp.textContent="В SIQ сохранено: "+canonical;
       }
       durationAutoButton.disabled=!item.duration;
       current.dirty=true;
       refreshLive();
       return true;
     };
     durationAutoButton.addEventListener("click",()=>{
       for(const {input} of durationInputs){
         input.value="";
         input.setCustomValidity("");
         input.classList.remove("duration-part-invalid");
       }
       item.duration=null;
       item.sourceNode.removeAttribute("duration");
       lastCommittedParts.fill("");
       durationAutoButton.disabled=true;
       durationHelp.classList.remove("field-help-warning");
       durationHelp.textContent="Оставлено автоматическое время.";
       current.dirty=true;
       refreshLive();
     });
     for(const {input,part,index} of durationInputs){
       input.addEventListener("input",()=>{
         const entered=input.value;
         if(!/^\d{0,2}$/.test(entered)){
           input.value=lastCommittedParts[index]||"";
           input.setCustomValidity("Допускаются только цифры, не более двух.");
           input.classList.add("duration-part-invalid");
           durationHelp.classList.add("field-help-warning");
           durationHelp.textContent=part.label+": введите не более двух цифр.";
           return;
         }
         const numeric=entered===""?0:Number(entered);
         if(numeric>part.max){
           input.setCustomValidity(part.label+" должны быть от 0 до "+part.max+".");
           input.classList.add("duration-part-invalid");
           durationHelp.classList.add("field-help-warning");
           durationHelp.textContent=part.label+": допустимо значение от 0 до "+part.max+".";
           return;
         }
         input.setCustomValidity("");
         input.classList.remove("duration-part-invalid");
         durationHelp.classList.remove("field-help-warning");
         commitDuration();
       });
       input.addEventListener("blur",()=>{
         if(input.validity.customError){
           input.value=lastCommittedParts[index]||"";
           input.setCustomValidity("");
           input.classList.remove("duration-part-invalid");
           durationHelp.classList.remove("field-help-warning");
           durationHelp.textContent=item.duration
             ?"Текущее значение: "+item.duration
             :"Оставьте все поля пустыми для автоматической продолжительности.";
         }
       });
     }
     duration.append(ds,durationParts,durationHelp,durationAutoButton);
     fs.appendChild(duration);

     const ref=document.createElement("label");
     ref.className="check-field";
     const cb=document.createElement("input");
     cb.type="checkbox";
     cb.checked=item.isRef;
     cb.onchange=()=>{
       item.isRef=cb.checked;
       if(cb.checked)item.sourceNode.setAttribute("isRef","true");
       else item.sourceNode.removeAttribute("isRef");
       rebuildPackReferences(current);
       current.dirty=true;
       renderResourcePreview(item,row);refreshLive();
     };
     ref.append(cb,document.createTextNode(" Это ссылка на ресурс"));
     fs.appendChild(ref);

     row.appendChild(fs);
     attachResourcePicker(item,row);
     attachContentItemDropZone(item,row);
     list.appendChild(row);
     renderResourcePreview(item,row);
   });
   refreshParallelControls();
 };
 box.appendChild(list);
 if(addButton){
   const add=document.createElement("div");
   add.className="actions";
   for(const [v,t] of [["text","Текст"],["image","Изображение"],["audio","Аудио"],["video","Видео"],["html","HTML"]]){
     add.appendChild(button("+ "+t,()=>{
       runHistoryAction("Добавление элемента контента",()=>{
        const n=current.model.sourceDocument.createElementNS(current.model.namespace,"item");
        const id=crypto.randomUUID();
        n.setAttribute("id",id);
        n.setAttribute("type",v);
        if(v==="text"||v==="html")n.textContent="";
        param.sourceNode.appendChild(n);
        const item={id,type:v,value:"",duration:null,placement:"screen",waitForFinish:null,isRef:false,attributes:{id,type:v},sourceNode:n};
        param.value.push(item);
        current.dirty=true;
       });
       refreshValidationAndSelection();
     }));
   }
   box.appendChild(add);
 }
 render();
 host.appendChild(box);
}
async function renderResourcePreview(item,row){
 const old=row.querySelector(".resource-preview");
 if(old){
  if(old.dataset.url)URL.revokeObjectURL(old.dataset.url);
  old.remove();
 }
 if(!item.value)return;
 const type=String(item.type||"text").toLowerCase();
 const resource=item.isRef?findResource(current,item.value,type):null;
 if(item.isRef&&!resource){
  const missing=document.createElement("div");missing.className="resource-preview resource-preview-empty";
  missing.textContent="Ресурс не найден: "+item.value;row.appendChild(missing);return;
 }
 if(type==="html"){
  const box=document.createElement("div");box.className="resource-preview resource-preview-html";
  const label=document.createElement("div");label.textContent=item.isRef?"HTML-ресурс: "+item.value:"Встроенный HTML";box.appendChild(label);
  try{
   const preview=await createSafeHtmlPreview(current,{source:item.isRef?"":item.value,resource,basePath:resource?.normalizedPath||"Html/inline.html",title:"Безопасный предпросмотр HTML элемента"});
   box.append(preview.container);
  }catch(error){
   const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Не удалось открыть HTML: "+error.message;box.appendChild(message);
  }
  row.appendChild(box);return;
 }
 if(!item.isRef){
  if(!["image","audio","video"].includes(type))return;
  const external=safeExternalMediaUrl(item.value);
  if(!external)return;
  const box=document.createElement("div");box.className="resource-preview";
  const note=document.createElement("div");note.textContent="Внешний ресурс · сетевой запрос выполняется только после нажатия.";box.appendChild(note);
  const load=document.createElement("button");load.type="button";load.className="preview-external-load";load.textContent="Загрузить из Интернета";load.dataset.externalUrl=external;
  load.addEventListener("click",()=>{
   load.disabled=true;load.textContent="Загрузка…";
   let media;
   if(type==="image"){
    media=document.createElement("img");media.alt="Внешнее изображение";media.loading="lazy";media.referrerPolicy="no-referrer";
   }else if(type==="audio"){
    media=document.createElement("audio");media.controls=true;media.preload="none";media.referrerPolicy="no-referrer";
   }else{
    media=document.createElement("video");media.controls=true;media.preload="none";media.referrerPolicy="no-referrer";
   }
   media.addEventListener("error",()=>{
    const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Не удалось загрузить внешний ресурс. Проверьте ссылку и доступность сайта.";box.appendChild(message);
   },{once:true});
   media.src=external;box.appendChild(media);load.remove();
  },{once:true});
  box.appendChild(load);row.appendChild(box);return;
 }
 const box=document.createElement("div");box.className="resource-preview";
 const label=document.createElement("div");label.textContent="Ресурс: "+item.value;box.appendChild(label);
 try{
  const url=await objectUrlForResource(resource);box.dataset.url=url;
  if(type==="image"){
   const img=document.createElement("img");img.src=url;img.alt="";
   img.addEventListener("error",()=>{const warning=document.createElement("div");warning.textContent="Браузер не смог декодировать изображение. Скачайте исходный файл.";box.appendChild(warning)},{once:true});
   box.appendChild(img);
  }else if(type==="audio"||type==="video"){
   const media=document.createElement(type);media.controls=true;media.preload=type==="audio"?"none":"metadata";media.src=url;
   media.addEventListener("error",()=>{const warning=document.createElement("div");warning.textContent="Браузер не поддерживает этот контейнер/кодек. Скачайте исходный файл.";box.appendChild(warning)},{once:true});
   box.appendChild(media);
  }
  const link=document.createElement("a");link.href=url;link.download=resource.archivePath;link.textContent="Скачать исходный файл";box.appendChild(link);
 }catch(error){
  const message=document.createElement("div");message.className="resource-preview-empty";message.textContent="Не удалось прочитать ресурс: "+error.message;box.appendChild(message);
 }
 row.appendChild(box);
}
function droppedMediaType(file){
 const name=String(file?.name||"").toLowerCase();
 if(/\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?|ico)$/.test(name))return "image";
 if(/\.(mp3|wav|ogg|oga|opus|m4a|flac|aac|wma)$/.test(name))return "audio";
 if(/\.(mp4|webm|avi|mov|mkv|m4v|mpg|mpeg|3gp)$/.test(name))return "video";
 if(/\.(html|htm)$/.test(name))return "html";
 return null;
}
function validateDroppedFiles(files,{single=false}={}){
 const list=Array.from(files||[]).filter(Boolean);
 if(!list.length)return {files:[],type:null,error:"Не удалось получить файлы из Drop."};
 if(single&&list.length!==1)return {files:list,type:null,error:"На один content item можно перетащить только один файл."};
 const types=list.map(droppedMediaType);
 const unsupported=list.filter((file,index)=>!types[index]);
 if(unsupported.length){
  return {files:list,type:null,error:"Неподдерживаемый файл: "+unsupported.map(file=>file.name).join(", ")+"\nПоддерживаются изображения, аудио, видео и HTML."};
 }
 return {files:list,type:types[0]};
}
function isFileDragEvent(event){
 const transfer=event?.dataTransfer;
 if(!transfer)return false;
 const types=Array.from(transfer.types||[]).map(type=>String(type).toLowerCase());
 if(types.includes("files"))return true;
 return Array.from(transfer.items||[]).some(item=>item?.kind==="file");
}
function setDropVisual(node,active){
 if(!node)return;
 node.classList.toggle("file-drop-active",!!active);
}
function attachContentItemDropZone(item,row){
 const onDragOver=event=>{
  if(!isFileDragEvent(event))return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect="copy";
  setDropVisual(row,true);
 };
 const onDragLeave=event=>{
  if(!row.contains(event.relatedTarget))setDropVisual(row,false);
 };
 const onDrop=async event=>{
  const hasFiles=isFileDragEvent(event)||!!event.dataTransfer?.files?.length;
  if(!hasFiles)return;
  event.preventDefault();
  setDropVisual(row,false);
  const check=validateDroppedFiles(event.dataTransfer?.files,{single:true});
  if(check.error){
   log("✗ Drop в content item отклонён: "+check.error.replaceAll("\\n"," "));
   alert(check.error);
   return;
  }
  try{
   const file=check.files[0];
   const result=await runHistoryActionAsync("Drop ресурса в content item: "+file.name,async()=>{
    item.type=check.type;
    item.sourceNode.setAttribute("type",check.type);
    const added=await addResourceToPack(current,file);
    setItemResource(current,item,added.resource);
    await assertPackageSizeWithinLimit(current,"Добавление медиа");
    return added;
   });
   log((result.reused?"✓ Переиспользован ресурс: ":"✓ Добавлен и назначен ресурс: ")+result.resource.archivePath);
   refreshResourceRows();
   refreshValidationAndSelection();
  }catch(error){
   log("✗ Ошибка Drop ресурса: "+(error.stack||error));
   alert("Не удалось назначить файл:\n"+error.message);
  }
 };
 row.addEventListener("dragover",onDragOver);
 row.addEventListener("dragleave",onDragLeave);
 row.addEventListener("drop",onDrop);
}
function attachResourcePicker(item,row){
 const picker=document.createElement("input");picker.type="file";picker.accept="image/*,audio/*,video/*,.html,.htm";picker.style.display="none";
 const choose=button(item.isRef?"Заменить ресурс":"Выбрать файл",()=>picker.click());
 const chooseExisting=button("Выбрать в пакете",()=>openResourceExplorerForItem(item));
 row.append(choose,chooseExisting,picker);
 picker.addEventListener("change",async()=>{
  const file=picker.files?.[0];if(!file)return;
  try{
   const result=await runHistoryActionAsync("Добавление и назначение ресурса: "+file.name,async()=>{
    const added=await addResourceToPack(current,file);
    setItemResource(current,item,added.resource);
    await assertPackageSizeWithinLimit(current,"Добавление ресурса");
    return added;
   });
   log((result.reused?"✓ Переиспользован существующий ресурс: ":"✓ Добавлен ресурс: ")+result.resource.archivePath);
   refreshResourceRows();
   refreshValidationAndSelection();
  }catch(e){
   log("✗ Ошибка добавления ресурса: "+(e.stack||e));
   alert("Не удалось добавить ресурс:\n"+e.message);
  }
 })
}
function refreshResourceRows(){
 if(activeView==="resources")renderPackageExplorer();
}
function clearSelection({renderTree:shouldRenderTree=true}={}){
 selected=null;selectionTitle.textContent="Выбор";selectionInfo.textContent="Выберите раунд, тему или вопрос.";
 actions.replaceChildren();
 if(current)updateStatus(validatePack(current.model));
 if(shouldRenderTree)renderTree();
}
function selectPackage({renderTree:shouldRenderTree=true}={}){
 if(!current)return;
 selected={id:"__package__",kind:"package"};
 selectionTitle.textContent="Пакет";
 selectionInfo.textContent="Метаданные пакета";
 editPackage(current);
 updateStatus(validatePack(current.model));
 if(shouldRenderTree)renderTree();
}
function selectedObjectExists(){
 if(!selected)return false;
 if(selected.kind==="package")return !!current;
 if(selected.kind==="round")return !!findRound(selected.id);
 if(selected.kind==="theme")return !!findTheme(selected.id);
 if(selected.kind==="question")return !!findQuestion(selected.id);
 return false;
}
function updateSelectionSummary(){
 if(!selected)return;
 if(selected.kind==="package"){
  selectionTitle.textContent="Пакет";selectionInfo.textContent="Метаданные пакета";return;
 }
 const obj=selected.kind==="round"?findRound(selected.id):selected.kind==="theme"?findTheme(selected.id):findQuestion(selected.id);
 if(!obj)return;
 selectionTitle.textContent=selected.kind==="round"?"Раунд":selected.kind==="theme"?"Тема":"Вопрос";
 if(selected.kind==="question"){
  const location=locateQuestion(selected.id);
  const round=location?findRound(location.roundId):null;
  const theme=location?findTheme(location.themeId):null;
  const preview=(obj.questionContent||[]).map(item=>{
   if(item.isRef)return "["+(item.type||"ресурс")+"] "+(item.value||"");
   return String(item.value||"").trim();
  }).filter(Boolean).join(" · ").slice(0,150);
  const path=round&&theme?"Раунд "+(round.order+1)+" → "+(theme.order+1)+". "+(theme.name||"Тема")+" → вопрос №"+((location?.index??0)+1):"";
  selectionInfo.textContent=["Цена: "+obj.price,"Тип: "+obj.type,"Элементов: "+obj.questionContent.length,path,preview?"«"+preview+"»":"Пустой вопрос"].filter(Boolean).join("  |  ");
 }else{
  selectionInfo.textContent=obj.name||"(без названия)";
 }
}
function refreshLive({rerenderEditor=false,message=""}={}){
 if(!current){updateStatus(null,message);return}
 const v=validatePack(current.model);
 renderValidation(v);
 renderTree();
 if(selected&&!selectedObjectExists())clearSelection({renderTree:false});
 else if(selected)updateSelectionSummary();
 if(rerenderEditor&&selected){
  if(selected.kind==="package")selectPackage({renderTree:false});
  else selectNode(selected.id,selected.kind,{renderTree:false});
 }
 updateStatus(v,message);
 exportBtn.disabled=!v.ok;
 if(activeView==="resources")renderPackageExplorer();
}
function refreshValidationAndSelection(){refreshLive({rerenderEditor:true})}
function locateQuestion(id){
 for(const r of current.model.rounds)for(const t of r.themes){
  const index=t.questions.findIndex(q=>q.id===id);
  if(index>=0)return {roundId:r.id,themeId:t.id,index};
 }
 return null;
}
function locateTheme(id){
 for(const r of current.model.rounds){
  const index=r.themes.findIndex(t=>t.id===id);
  if(index>=0)return {roundId:r.id,index};
 }
 return null;
}
function locateRound(id){
 const index=current.model.rounds.findIndex(r=>r.id===id);
 return index>=0?{index}:null;
}
function deleteQuestionAndRefresh(id){
 const location=locateQuestion(id);
 if(!location){
  log("Вопрос уже удалён или не найден.");
  refreshLive({rerenderEditor:true,message:"Вопрос уже удалён"});
  return false;
 }
 const parentThemeNode=findTheme(location.themeId)?.sourceNode||null;
 return mutate(()=>deleteQuestion(current,id),{
  after:()=>{
   if(!parentThemeNode)return {kind:"package"};
   for(const round of current.model.rounds){
    const theme=round.themes.find(item=>item.sourceNode===parentThemeNode);
    if(theme)return {kind:"theme",id:theme.id};
   }
   return {kind:"package"};
  },
  message:"Вопрос удалён — выбрана родительская тема"
 });
}
function deleteThemeAndRefresh(id){
 const location=locateTheme(id);
 if(!location){
  log("Тема уже удалена или не найдена.");
  refreshLive({rerenderEditor:true,message:"Тема уже удалена"});
  return false;
 }
 const parentRoundNode=findRound(location.roundId)?.sourceNode||null;
 return mutate(()=>deleteTheme(current,id),{
  after:()=>{
   if(!parentRoundNode)return {kind:"package"};
   const round=current.model.rounds.find(item=>item.sourceNode===parentRoundNode);
   return round?{kind:"round",id:round.id}:{kind:"package"};
  },
  message:"Тема удалена — выбран родительский раунд"
 });
}
function deleteRoundAndRefresh(id){
 const location=locateRound(id);
 if(!location){
  log("Раунд уже удалён или не найден.");
  refreshLive({rerenderEditor:true,message:"Раунд уже удалён"});
  return false;
 }
 return mutate(()=>deleteRound(current,id),{
  after:()=>({kind:"package"}),
  message:"Раунд удалён — выбран пакет"
 });
}
function parameterEditor(param,host,depth=0){
 const wrap=document.createElement("div");wrap.className="parameter-editor";wrap.style.marginLeft=(depth*12)+"px";
 const title=document.createElement("div");title.className="subheading";title.textContent="Параметр: "+(param.name||"(без имени)")+" ["+(param.type||"simple")+"]";wrap.appendChild(title);
 if(param.type==="content"){
   const list=document.createElement("div");list.className="item-list";
   param.value.forEach((item,i)=>{const row=document.createElement("div");row.className="content-item";row.dataset.itemId=item.id;const head=document.createElement("div");head.className="item-head";const itemTitle=document.createElement("b");itemTitle.className="content-item-title";itemTitle.textContent="Элемент "+(i+1);head.appendChild(createContentItemDragHandle(param,list,row,item));head.appendChild(itemTitle);
     head.appendChild(button("Удалить",()=>{const currentIndex=param.value.findIndex(entry=>entry.id===item.id);if(currentIndex<0)return;runHistoryAction("Удаление элемента параметра",()=>{item.sourceNode.remove();param.value.splice(currentIndex,1);rebuildPackReferences(current);current.dirty=true});refreshValidationAndSelection()}));row.appendChild(head);
     const fs=document.createElement("div");fs.className="item-fields";
     const tl=document.createElement("label");tl.className="editor-field";const ts=document.createElement("span");ts.textContent="Тип";const sel=document.createElement("select");for(const o of itemTypeOptions(item.type))sel.appendChild(o);sel.onchange=()=>{setItemType(item,sel.value);rebuildPackReferences(current);refreshValidationAndSelection()};tl.append(ts,sel);fs.appendChild(tl);
     fs.appendChild(field("Значение / путь",item.value,v=>{item.value=v;if(item.sourceNode.hasAttribute("value"))item.sourceNode.setAttribute("value",v);else item.sourceNode.textContent=v;rebuildPackReferences(current);current.dirty=true}));
     fs.appendChild(field("Placement",item.placement||"screen",v=>{item.placement=v;item.sourceNode.setAttribute("placement",v);current.dirty=true}));
     fs.appendChild(field("Duration",item.duration||"",v=>{item.duration=v;if(v)item.sourceNode.setAttribute("duration",v);else item.sourceNode.removeAttribute("duration");current.dirty=true}));
     const ref=document.createElement("label");ref.className="check-field";const cb=document.createElement("input");cb.type="checkbox";cb.checked=item.isRef;cb.onchange=()=>{item.isRef=cb.checked;if(cb.checked)item.sourceNode.setAttribute("isRef","true");else item.sourceNode.removeAttribute("isRef");rebuildPackReferences(current);current.dirty=true;refreshValidationAndSelection()};ref.append(cb,document.createTextNode(" isRef"));fs.appendChild(ref);row.appendChild(fs);attachResourcePicker(item,row);list.appendChild(row);renderResourcePreview(item,row)
   });
   wrap.appendChild(list);
 }else if(param.type==="group"){
   for(const child of param.value)parameterEditor(child,wrap,depth+1);
 }else if(param.type==="numberSet"){
   const ns=param.value||{};
   const grid=document.createElement("div");grid.className="editor-grid";
   for(const key of ["minimum","maximum","step"])grid.appendChild(field(key,ns[key]??"",v=>{ns[key]=v;if(ns.sourceNode)ns.sourceNode.setAttribute(key,v);current.dirty=true},key==="step"?"number":"number"));
   wrap.appendChild(grid);
 }else{
   wrap.appendChild(field("Значение",param.value||"",v=>{param.value=v;param.sourceNode.textContent=v;current.dirty=true}));
 }
 host.appendChild(wrap);
}
function renderParameters(q,form){
 const box=document.createElement("div");box.className="parameters-editor";const h=document.createElement("div");h.className="subheading";h.textContent="Параметры вопроса";box.appendChild(h);
 for(const p of q.parameters)parameterEditor(p,box);
 const add=document.createElement("div");add.className="editor-toolbar";
 const name=document.createElement("input");name.placeholder="Имя нового параметра";name.className="param-name-input";
 const type=document.createElement("select");for(const [v,t] of [["simple","Простой текст"],["content","Контент"],["group","Группа"],["numberSet","Набор чисел"]]){const o=document.createElement("option");o.value=v;o.textContent=t;type.appendChild(o)}
 add.append(name,type,button("+ Добавить параметр",()=>{const n=name.value.trim();if(!n)return alert("Укажите имя параметра.");runHistoryAction("Добавление параметра вопроса",()=>{const paramsNode=q.sourceNode.querySelector(":scope > params")||(()=>{const x=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"params");q.sourceNode.appendChild(x);return x})();const p=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"param");p.setAttribute("name",n);p.setAttribute("type",type.value);if(type.value==="content"){}else if(type.value==="numberSet"){const ns=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"numberSet");ns.setAttribute("minimum","0");ns.setAttribute("maximum","100");ns.setAttribute("step","1");p.appendChild(ns)}paramsNode.appendChild(p);const np={id:crypto.randomUUID(),name:n,type:type.value,value:type.value==="content"?[]:type.value==="group"?[]:type.value==="numberSet"?{minimum:"0",maximum:"100",step:"1",attributes:{},sourceNode:p.firstElementChild}: "",attributes:{name:n,type:type.value},sourceNode:p};q.parameters.push(np);current.dirty=true});name.value="";refreshValidationAndSelection()}));
 box.appendChild(add);form.appendChild(box)
}
function renderExtraParameters(q,form){
 const extras=q.parameters.filter(p=>p.name!=="question"&&p.type!=="content");
 if(!extras.length)return;
 const box=document.createElement("div");box.className="parameters-editor";const h=document.createElement("div");h.className="subheading";h.textContent="Дополнительные параметры";box.appendChild(h);
 for(const p of extras)parameterEditor(p,box);
 form.appendChild(box);
}
function editPackage(pack){
 actions.innerHTML="";const f=document.createElement("div");f.className="editor";
 const grid=document.createElement("div");grid.className="editor-grid";
 for(const key of ["name","publisher","id","restriction","date","difficulty","language"])grid.appendChild(field(key,pack.model.metadata[key]||"",v=>{pack.model.metadata[key]=v;const root=pack.model.sourceDocument.documentElement;if(v)root.setAttribute(key,v);else root.removeAttribute(key);current.dirty=true}));
 grid.appendChild(field("logo",pack.model.metadata.logo||"",v=>{pack.model.metadata.logo=v;const root=pack.model.sourceDocument.documentElement;if(v)root.setAttribute("logo",v);else root.removeAttribute("logo");current.dirty=true}));
 f.appendChild(grid);
 const logoTools=document.createElement("div");logoTools.className="logo-upload-tools";
 const logoPicker=document.createElement("input");logoPicker.id="logoFileInput";logoPicker.type="file";logoPicker.accept="image/*";logoPicker.hidden=true;
 const upload=button("Загрузить логотип",()=>logoPicker.click());
 upload.title="Добавить изображение в Images/ и автоматически записать ссылку @имя-файла";
 logoTools.append(upload,logoPicker);
 logoPicker.addEventListener("change",async()=>{
  const file=logoPicker.files?.[0];if(!file)return;
  try{
   if(! /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(file.name))throw Error("Поддерживаются PNG, JPG, GIF, WebP, AVIF, BMP и SVG.");
   const result=await runHistoryActionAsync("Обновление логотипа пакета",async()=>{
    const added=await addResourceToPack(current,file,{deduplicateFolder:"Images"});
    const logoValue=packageLogoReferenceValue(added.resource);
    current.model.metadata.logo=logoValue;
    current.model.sourceDocument.documentElement.setAttribute("logo",logoValue);
    current.dirty=true;
    return added;
   });
   log((result.reused?"✓ Использовано существующее изображение логотипа: ":"✓ Добавлено изображение логотипа: ")+result.resource.normalizedPath);
   refreshLive({rerenderEditor:true,message:"Логотип обновлён"});
  }catch(error){
   log("✗ Не удалось установить логотип: "+(error.stack||error));
   alert("Не удалось установить логотип:\\n"+error.message);
  }finally{
   logoPicker.value="";
  }
 });
 f.appendChild(logoTools);
 actions.appendChild(f);
}
function renderLegacyContent(q,form){
 const box=document.createElement("div");box.className="content-editor";const h=document.createElement("div");h.className="subheading";h.textContent="Контент вопроса";box.appendChild(h);
 const list=document.createElement("div");list.className="item-list";box.appendChild(list);
 const refresh=()=>{list.innerHTML="";q.questionContent.forEach((item,i)=>{
  const row=document.createElement("div");row.className="content-item";const head=document.createElement("div");head.className="item-head";head.innerHTML="<b>Item "+(i+1)+"</b>";
  head.appendChild(button("Удалить",()=>{item.sourceNode.remove();q.questionContent.splice(i,1);rebuildPackReferences(current);current.dirty=true;refresh();renderValidation(validatePack(current.model))}));row.appendChild(head);
  const fs=document.createElement("div");fs.className="item-fields";
  const typeLabel=document.createElement("label");typeLabel.className="editor-field";const typeSpan=document.createElement("span");typeSpan.textContent="Тип";const typeSel=document.createElement("select");for(const o of itemTypeOptions(item.type))typeSel.appendChild(o);typeSel.onchange=()=>setItemType(item,typeSel.value);typeLabel.append(typeSpan,typeSel);fs.appendChild(typeLabel);
  fs.appendChild(field("Значение / путь",item.value,v=>{item.value=v;if(item.sourceNode.hasAttribute("value"))item.sourceNode.setAttribute("value",v);else item.sourceNode.textContent=v;rebuildPackReferences(current);current.dirty=true;renderResourcePreview(item,row)}));
  fs.appendChild(field("Placement",item.placement||"screen",v=>{item.placement=v;item.sourceNode.setAttribute("placement",v);current.dirty=true}));
  fs.appendChild(field("Duration",item.duration||"",v=>{item.duration=v;if(v)item.sourceNode.setAttribute("duration",v);else item.sourceNode.removeAttribute("duration");current.dirty=true}));
  const ref=document.createElement("label");ref.className="check-field";const cb=document.createElement("input");cb.type="checkbox";cb.checked=item.isRef;cb.onchange=()=>{item.isRef=cb.checked;if(cb.checked)item.sourceNode.setAttribute("isRef","true");else item.sourceNode.removeAttribute("isRef");rebuildPackReferences(current);current.dirty=true;renderResourcePreview(item,row)};ref.append(cb,document.createTextNode(" isRef"));fs.appendChild(ref);
  row.appendChild(fs);attachResourcePicker(item,row);list.appendChild(row);renderResourcePreview(item,row)
 })};
 const addItem=(type)=>{const p=ensureQuestionParam(q),n=q.sourceNode.ownerDocument.createElementNS(q.sourceNode.namespaceURI,"item"),id=crypto.randomUUID();n.setAttribute("id",id);n.setAttribute("type",type);if(type==="text"||type==="html")n.setAttribute("value","");p.appendChild(n);q.questionContent.push({id,type,value:"",duration:null,placement:"screen",waitForFinish:null,isRef:false,attributes:{id,type},sourceNode:n});current.dirty=true;refresh()};
 const addRow=document.createElement("div");addRow.className="actions";for(const [v,t] of [["text","Текст"],["image","Изображение"],["audio","Аудио"],["video","Видео"],["html","HTML"]])addRow.appendChild(button("+ "+t,()=>addItem(v)));box.appendChild(addRow);refresh();form.appendChild(box)
}
function renderContent(q,form){
 const contentParams=q.parameters.filter(p=>p.type==="content");
 const questionParam=contentParams.find(p=>p.name==="question");
 const answerParam=contentParams.find(p=>p.name==="answer");
 if(questionParam)renderContentParameter(questionParam,form,true);
 if(answerParam)renderContentParameter(answerParam,form,true);
 for(const p of contentParams)if(p!==questionParam&&p!==answerParam)renderContentParameter(p,form,true);
}
function questionTypeField(q){
 const wrap=document.createElement("label");wrap.className="editor-field question-type-field";
 const caption=document.createElement("span");caption.textContent="Тип вопроса";
 const select=document.createElement("select");select.className="question-type-select";
 const description=document.createElement("small");description.className="editor-help";
 for(const type of getQuestionTypeOptions(q.type)){
  const option=document.createElement("option");
  option.value=type.value;option.textContent=type.label;option.title=type.description;
  select.appendChild(option);
 }
 select.value=q.type??"";
 description.textContent=getQuestionTypeDescription(q.type);
 select.addEventListener("change",()=>{
  q.type=select.value;
  if(q.type)q.sourceNode.setAttribute("type",q.type);else q.sourceNode.removeAttribute("type");
  current.dirty=true;
  description.textContent=getQuestionTypeDescription(q.type);
  refreshLive();
 });
 wrap.append(caption,select,description);
 return wrap;
}
function isFinalQuestionRound(round){
 const type=String(round?.type||round?.attributes?.type||round?.sourceNode?.getAttribute("type")||"").trim().toLowerCase();
 if(type==="final")return true;
 return String(round?.name||"").normalize("NFKC").toLocaleLowerCase("ru").includes("финал");
}
function getBulkQuestionTypePlan(pack){
 const plan={normalRounds:[],finalRounds:[],normalQuestions:0,finalQuestions:0,totalQuestions:0};
 for(const round of pack?.model?.rounds||[]){
  const questionCount=(round.themes||[]).reduce((sum,theme)=>sum+(theme.questions||[]).length,0);
  plan.totalQuestions+=questionCount;
  if(isFinalQuestionRound(round)){
   plan.finalRounds.push(round);
   plan.finalQuestions+=questionCount;
  }else{
   plan.normalRounds.push(round);
   plan.normalQuestions+=questionCount;
  }
 }
 return plan;
}
function applyBulkQuestionTypes(pack){
 if(!pack||pack!==current||!openedPacks.includes(pack)){
  alert("Активный пакет изменился. Откройте нужную вкладку и повторите операцию.");
  return false;
 }
 const plan=getBulkQuestionTypePlan(pack);
 if(!plan.finalRounds.length){
  alert("Не найден финальный раунд. Для безопасности пакет не изменён. У финального раунда должен быть type='final' или название с «ФИНАЛ».");
  return false;
 }
 try{
  const result=runHistoryAction("Массовое изменение типов вопросов",()=>{
   const stats={normalChanged:0,finalChanged:0,normalUnchanged:0,finalUnchanged:0};
   for(const round of pack.model.rounds||[]){
    const finalRound=isFinalQuestionRound(round);
    const nextType=finalRound?"stakeAll":"forAll";
    for(const theme of round.themes||[])for(const question of theme.questions||[]){
     if(!question.sourceNode)throw Error("У вопроса "+(question.id||"без ID")+" отсутствует исходный XML-узел.");
     const xmlType=question.sourceNode.getAttribute("type");
     if(question.type===nextType&&xmlType===nextType){
      if(finalRound)stats.finalUnchanged++;
      else stats.normalUnchanged++;
      continue;
     }
     question.type=nextType;
     question.attributes={...(question.attributes||{}),type:nextType};
     question.sourceNode.setAttribute("type",nextType);
     if(finalRound)stats.finalChanged++;
     else stats.normalChanged++;
    }
   }
   if(stats.normalChanged+stats.finalChanged)pack.dirty=true;
   return stats;
  });
  const changed=result.normalChanged+result.finalChanged;
  if(!changed){
   refreshLive({rerenderEditor:true,message:"Типы всех вопросов уже соответствуют правилам."});
   log("ℹ Массовое назначение типов не потребовалось: все "+plan.totalQuestions+" вопросов уже имеют нужные типы.");
   return true;
  }
  refreshLive({rerenderEditor:true,message:"Типы вопросов обновлены: "+changed+" из "+plan.totalQuestions});
  log("✓ Массово назначены типы вопросов: обычные раунды — изменено "+result.normalChanged+", без изменений "+result.normalUnchanged+"; финал — изменено "+result.finalChanged+", без изменений "+result.finalUnchanged+".");
  log("ℹ Обработано вопросов: "+plan.totalQuestions+". Изменения записаны в одной операции Undo/Redo.");
  return true;
 }catch(error){
  log("✗ Не удалось массово изменить типы вопросов: "+(error.stack||error));
  alert("Не удалось изменить типы вопросов:\n"+error.message+"\nПакет восстановлен к исходному состоянию операции.");
  refreshLive({rerenderEditor:true,message:"Массовое изменение типов отменено"});
  return false;
 }
}
function openBulkQuestionTypesDialog(){
 const pack=current;
 if(!pack)return false;
 const plan=getBulkQuestionTypePlan(pack);
 const overlay=document.createElement("div");overlay.className="destination-overlay bulk-question-types-overlay";
 const modal=document.createElement("div");modal.className="destination-modal bulk-question-types-modal";
 modal.setAttribute("role","dialog");modal.setAttribute("aria-modal","true");modal.setAttribute("aria-labelledby","bulkQuestionTypesTitle");
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.id="bulkQuestionTypesTitle";title.textContent="Массовое назначение типов вопросов";
 const close=button("✕",()=>finish());close.className="modal-close";close.setAttribute("aria-label","Закрыть");
 head.append(title,close);
 const summary=document.createElement("div");summary.className="destination-hint bulk-question-types-summary";
 const packName=pack.model.metadata.name||pack.fileName||"Без названия";
 const summaryLines=[
  "Открытый пакет: "+packName,
  "Обычные раунды: "+plan.normalRounds.length+" · вопросов: "+plan.normalQuestions+" → «Для всех» (forAll).",
  "Финальные раунды: "+plan.finalRounds.length+" · вопросов: "+plan.finalQuestions+" → «Для всех со ставкой» (stakeAll).",
  "Всего будет проверено вопросов: "+plan.totalQuestions+".",
  "Меняется только тип самого вопроса. Контент, ответы, цена и остальные параметры не затрагиваются."
 ];
 for(const line of summaryLines){const row=document.createElement("div");row.textContent=line;summary.appendChild(row)}
 const warning=document.createElement("div");warning.className="destination-hint bulk-question-types-warning";
 if(!plan.finalRounds.length){
  warning.textContent="Финальный раунд не распознан. Для безопасности операция отключена: укажите type='final' или добавьте «ФИНАЛ» в название раунда.";
 }else if(!plan.totalQuestions){
  warning.textContent="В пакете пока нет вопросов для изменения.";
 }else{
  warning.textContent="Операция применяется только к этой открытой вкладке и отменяется одним нажатием «Отменить».";
 }
 const footer=document.createElement("div");footer.className="destination-footer";
 let settled=false;
 function finish(){if(settled)return;settled=true;overlay.remove()}
 const cancel=button("Отмена",finish);
 const apply=button("Применить типы вопросов",()=>{finish();applyBulkQuestionTypes(pack)});
 apply.disabled=!plan.finalRounds.length||!plan.totalQuestions;
 apply.title=apply.disabled?"Нужен распознанный финальный раунд и хотя бы один вопрос.":"Изменить типы вопросов в текущем открытом пакете.";
 footer.append(cancel,apply);
 modal.append(head,summary,warning,footer);overlay.appendChild(modal);document.body.appendChild(overlay);
 overlay.addEventListener("click",event=>{if(event.target===overlay)finish()});
 overlay.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();finish()}});
 apply.focus();
 return true;
}
function editQuestion(q){
 actions.innerHTML="";const f=document.createElement("div");f.className="editor";
 const grid=document.createElement("div");grid.className="editor-grid";
 grid.appendChild(field("Цена",q.price,v=>{q.price=Number(v)||0;q.sourceNode.setAttribute("price",String(q.price));current.dirty=true},"number"));
 grid.appendChild(questionTypeField(q));f.appendChild(grid);
 const ans=document.createElement("div");ans.className="answers-grid";
 const rb=document.createElement("div");rb.className="answer-box";const rh=document.createElement("div");rh.className="subheading";rh.textContent="Правильный ответ";const rt=document.createElement("textarea");rt.rows=4;rt.value=q.right.join("\n");rt.oninput=()=>syncAnswer(q,"right",rt.value);rb.append(rh,rt);
 const wb=document.createElement("div");wb.className="answer-box";const wh=document.createElement("div");wh.className="subheading";wh.textContent="Неверные ответы";const wt=document.createElement("textarea");wt.rows=4;wt.value=q.wrong.join("\n");wt.oninput=()=>syncAnswer(q,"wrong",wt.value);wb.append(wh,wt);ans.append(rb,wb);f.appendChild(ans);
 renderContent(q,f);renderExtraParameters(q,f);actions.append(f,button("Предпросмотр",()=>openQuestionPreview(current,q).catch(e=>{log("✗ Ошибка предпросмотра: "+(e.stack||e));alert("Не удалось открыть предпросмотр:\\n"+e.message)})),button("Копировать вопрос → выбрать тему",()=>copyQuestionPrompt(q.id)),copyAcrossButton("question",q.id),button("Удалить вопрос",()=>deleteQuestionAndRefresh(q.id)))
}
function refreshResourceRows(){if(selected?.kind==="question"){const q=findQuestion(selected.id);if(q)editQuestion(q)}}
function expandSelectionPath(id,kind){
 let roundId=null,themeId=null;
 if(kind==="round")roundId=id;
 else if(kind==="theme"){const location=locateTheme(id);roundId=location?.roundId;themeId=id}
 else if(kind==="question"){const location=locateQuestion(id);roundId=location?.roundId;themeId=location?.themeId}
 for(const node of tree.querySelectorAll("details")){
  if(node.dataset.nodeId===roundId||node.dataset.nodeId===themeId)node.open=true;
 }
}
function selectNode(id,kind,{renderTree:shouldRenderTree=true}={}){
 const obj=kind==="round"?findRound(id):kind==="theme"?findTheme(id):kind==="question"?findQuestion(id):null;
 if(!obj){clearSelection({renderTree:shouldRenderTree});return false}
 selected={id,kind};
 updateSelectionSummary();
 if(kind==="round")editRound(obj);else if(kind==="theme")editTheme(obj);else editQuestion(obj);
 updateStatus(validatePack(current.model));
 if(shouldRenderTree){expandSelectionPath(id,kind);renderTree()}
 return true;
}
function copyDestinationPicker(kind,onChoose){
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal";
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent=kind==="theme"?"Куда скопировать тему":"Куда скопировать вопрос";
 const close=button("✕",()=>overlay.remove());close.className="modal-close";head.append(title,close);
 const hint=document.createElement("div");hint.className="destination-hint";hint.textContent=kind==="theme"?"Выберите раунд назначения":"Выберите раунд, затем тему назначения";
 const breadcrumb=document.createElement("div");breadcrumb.className="destination-breadcrumb";breadcrumb.textContent="Пакет";
 const list=document.createElement("div");list.className="destination-tree";
 const footer=document.createElement("div");footer.className="destination-footer";footer.append(button("Отмена",()=>overlay.remove()));
 modal.append(head,hint,breadcrumb,list,footer);overlay.appendChild(modal);document.body.appendChild(overlay);
 const choose=(id)=>{const success=onChoose(id);if(success)overlay.remove();};
 const setBreadcrumb=(parts)=>{breadcrumb.innerHTML="";parts.forEach((p,i)=>{const b=button(p.label,()=>{if(i<parts.length-1)p.action()});b.className="breadcrumb-item";breadcrumb.appendChild(b);if(i<parts.length-1)breadcrumb.appendChild(document.createTextNode(" / "));});};
 const showRounds=()=>{
   list.innerHTML="";setBreadcrumb([{label:"Пакет",action:()=>showRounds()}]);
   current.model.rounds.forEach(r=>{const row=button((r.order+1)+". "+(r.name||"(без названия)"),()=>kind==="theme"?choose(r.id):showThemes(r));row.className="destination-node round-node";list.appendChild(row)});
 };
 const showThemes=(r)=>{
   list.innerHTML="";setBreadcrumb([{label:"Пакет",action:()=>showRounds()},{label:(r.order+1)+". "+(r.name||"(без названия)"),action:()=>showThemes(r)}]);
   r.themes.forEach(t=>{const row=button((t.order+1)+". "+(t.name||"(без названия)"),()=>choose(t.id));row.className="destination-node theme-node";list.appendChild(row)});
 };
 showRounds();
}
function copyThemePrompt(id){copyDestinationPicker("theme",targetRoundId=>mutate(()=>copyTheme(current,id,targetRoundId)))}
function copyQuestionPrompt(id){copyDestinationPicker("question",targetThemeId=>mutate(()=>copyQuestion(current,id,targetThemeId)))}
function copyPackEntityAcrossPrompt(kind,sourceId){
 const sourcePack=current;
 const targets=openedPacks.filter(pack=>pack!==sourcePack);
 if(!sourcePack||!targets.length){alert("Сначала откройте второй SIQ-пакет.");return false}
 const labels={round:"раунд",theme:"тему",question:"вопрос"};
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal";
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent="Копировать "+labels[kind]+" в другой пакет";
 const close=button("✕",()=>overlay.remove());close.className="modal-close";head.append(title,close);
 const hint=document.createElement("div");hint.className="destination-hint";hint.textContent="Выберите целевой пакет и место, куда добавить копию. Исходный пакет не изменится.";
 const breadcrumb=document.createElement("div");breadcrumb.className="destination-breadcrumb";
 const list=document.createElement("div");list.className="destination-tree";
 const footer=document.createElement("div");footer.className="destination-footer";footer.append(button("Отмена",()=>overlay.remove()));
 modal.append(head,hint,breadcrumb,list,footer);overlay.appendChild(modal);document.body.appendChild(overlay);
 const setBreadcrumb=parts=>{
  breadcrumb.replaceChildren();
  parts.forEach((part,index)=>{
   const item=button(part.label,()=>{if(index<parts.length-1)part.action()});
   item.className="breadcrumb-item";item.disabled=index===parts.length-1;
   breadcrumb.appendChild(item);
   if(index<parts.length-1)breadcrumb.appendChild(document.createTextNode(" / "));
  });
 };
 const packTitle=pack=>(pack.model.metadata.name||pack.fileName||"Без названия")+" — "+pack.fileName;
 const renderPacks=()=>{
  list.replaceChildren();setBreadcrumb([{label:"Целевой пакет",action:renderPacks}]);
  for(const pack of targets){
   const row=button(packTitle(pack),()=>renderDestination(pack));
   row.className="destination-node round-node";list.appendChild(row);
  }
 };
 const execute=async(targetPack,targetId=null)=>{
  const buttons=[...list.querySelectorAll("button")];buttons.forEach(item=>item.disabled=true);
  try{
   const label="Копирование "+labels[kind]+" из другого пакета";
   const result=await runPackHistoryActionAsync(targetPack,label,async()=>{
    const existingResources=new Set(targetPack.model.resources||[]);
    const copied=await copyPackEntityAcross(sourcePack,targetPack,{kind,sourceId,targetId});
    if(isQualityControlEnabled(targetPack)){
     const violations=findQualityMediaViolations(targetPack).filter(item=>!existingResources.has(item.resource));
     if(violations.length)throw Error("Копирование добавляет медиафайл выше лимита SIGame: "+violations[0].path+" ("+formatSigameBytes(violations[0].size)+", максимум "+formatSigameBytes(violations[0].limit)+").");
    }
    await assertPackageSizeWithinLimit(targetPack,"Межпакетное копирование");
    return copied;
   });
   overlay.remove();
   activateOpenedPack(targetPack);
   setExplorerView("editor");
   selectNode(result.id,kind);
   expandSelectionPath(result.id,kind);
   const validation=validatePack(current.model);
   renderValidation(validation);renderTree({expandSelected:true});updateStatus(validation,"Скопировано в пакет: "+(targetPack.model.metadata.name||targetPack.fileName));
   exportBtn.disabled=!validation.ok;
   log("✓ Межпакетное копирование: "+labels[kind]+" добавлена в «"+(targetPack.model.metadata.name||targetPack.fileName)+"»");
   log("Медиа-зависимости: добавлено "+result.importedResources.length+", переиспользовано "+result.reusedResources.length);
   return true;
  }catch(error){
   log("✗ Не удалось скопировать "+labels[kind]+": "+(error.stack||error));
   alert("Не удалось скопировать в другой пакет:\n"+error.message);
   buttons.forEach(item=>item.disabled=false);
   return false;
  }
 };
 const showRounds=(targetPack)=>{
  list.replaceChildren();
  setBreadcrumb([{label:"Целевой пакет",action:renderPacks},{label:packTitle(targetPack),action:()=>renderDestination(targetPack)}]);
  if(kind==="round"){
   const row=button("Добавить в конец списка раундов",()=>execute(targetPack));
   row.className="destination-node round-node";list.appendChild(row);return;
  }
  const rounds=targetPack.model.rounds||[];
  if(!rounds.length){list.textContent="В целевом пакете пока нет раундов. Сначала добавьте раунд.";return}
  for(const round of rounds){
   const row=button((round.order+1)+". "+(round.name||"(без названия)"),()=>kind==="theme"?execute(targetPack,round.id):showThemes(targetPack,round));
   row.className="destination-node round-node";list.appendChild(row);
  }
 };
 const showThemes=(targetPack,round)=>{
  list.replaceChildren();
  setBreadcrumb([
   {label:"Целевой пакет",action:renderPacks},
   {label:packTitle(targetPack),action:()=>renderDestination(targetPack)},
   {label:(round.order+1)+". "+(round.name||"(без названия)"),action:()=>showRounds(targetPack)}
  ]);
  if(!(round.themes||[]).length){list.textContent="В выбранном раунде нет тем. Выберите другой раунд или добавьте тему.";return}
  for(const theme of round.themes){
   const row=button((theme.order+1)+". "+(theme.name||"(без названия)"),()=>execute(targetPack,theme.id));
   row.className="destination-node theme-node";list.appendChild(row);
  }
 };
 const renderDestination=targetPack=>showRounds(targetPack);
 renderPacks();
 return true;
}
async function createNewPack(){
 if(newPackBtn)newPackBtn.disabled=true;
 try{
  const now=new Date();
  const date=[String(now.getDate()).padStart(2,"0"),String(now.getMonth()+1).padStart(2,"0"),now.getFullYear()].join(".");
  const sessionId=crypto.randomUUID();
  const packageId=crypto.randomUUID();
  const xml='<?xml version="1.0" encoding="utf-8"?>'+
   '<package xmlns="https://github.com/VladimirKhil/SI/blob/master/assets/siq_5.xsd"'+
   ' name="Новый пакет" version="5" id="'+packageId+'" restriction="" date="'+date+'" difficulty="5" language="ru-RU">'+
   '<rounds></rounds><files></files></package>';
  const writer=new ZipWriter();
  writer.add("content.xml",new TextEncoder().encode(xml),{method:0});
  writer.add("quality.marker",new Uint8Array(0),{method:0});
  const bytes=await writer.build();
  const fileName="Новый пакет.siq";
  const file=new File([bytes],fileName,{type:"application/octet-stream"});
  const parsed=await readSiq(file);
  const validation=validatePack(parsed.model);
  if(!validation.ok)throw Error("Не удалось создать валидный SIQ v5: "+validation.errors.join("; "));
  const pack={
   ...parsed,
   sessionId,
   sourceKey:"new-pack:"+sessionId,
   isNewPack:true,
   dirty:true,
   extraResources:[],
   deletedResourcePaths:new Set(),
   resourceDeletionHistory:[],
   history:new UndoRedoHistory(40),
   uiState:{
    selected:{id:"__package__",kind:"package"},
    activeView:"editor",
    resourceTypeFilter:"all",
    resourceStatusFilter:"all",
    resourceSort:"name"
   }
  };
  ensureQualityControlMarker(pack);
  flushPendingHistoryEdit();
  disposeArchivePreview();
  resourceTargetItem=null;
  openedPacks.push(pack);
  current=pack;
  restorePackUiState(pack);
  if(resourcesTab)resourcesTab.disabled=false;
  selectPackage({renderTree:false});
  refreshLive({rerenderEditor:true,message:"Создан новый пустой SIQ v5"});
  setExplorerView("editor");
  renderPackTabs();
  updateHistoryControls();
  log("✓ Создан новый пакет: "+fileName);
  log("Пустой SIQ v5 проверен: 0 раундов, 0 ресурсов, manifest и content.xml готовы.");
  return pack;
 }catch(error){
  log("✗ Не удалось создать новый пакет: "+(error.stack||error));
  alert("Не удалось создать новый SIQ-пакет:\\n"+error.message);
  return null;
 }finally{
  if(newPackBtn)newPackBtn.disabled=false;
 }
}
function openMergePacksDialog(){
 if(openedPacks.length<2)return false;
 const overlay=document.createElement("div");overlay.className="destination-overlay";
 const modal=document.createElement("div");modal.className="destination-modal merge-packs-modal";
 let sourcePageStart=0,onResize=null;
 function closeDialog(){if(onResize)window.removeEventListener("resize",onResize);overlay.remove();}
 const head=document.createElement("div");head.className="destination-head";
 const title=document.createElement("h3");title.textContent="Объединение SIQ-пакетов";
 const close=button("✕",closeDialog);close.className="modal-close";head.append(title,close);
 const intro=document.createElement("p");intro.className="merge-packs-intro";intro.textContent="Выберите целевой пак и источники. Раунд переносится целиком, отдельные темы — вместе с вопросами и медиа. Исходные паки не меняются.";
 const targetLabel=document.createElement("label");targetLabel.className="merge-target-field";
 const targetCaption=document.createElement("span");targetCaption.textContent="Целевой пакет";
 const targetSelect=document.createElement("select");
 for(const pack of openedPacks){
  const option=document.createElement("option");option.value=pack.sessionId;option.textContent=packLabel(pack)+" — "+(pack.fileName||"пакет");targetSelect.appendChild(option);
 }
 targetSelect.value=current?.sessionId||openedPacks[0].sessionId;
 targetLabel.append(targetCaption,targetSelect);
 const selectionToolbar=document.createElement("div");selectionToolbar.className="merge-selection-toolbar";
 const selectAllButton=button("Выбрать всё",()=>setAllSelections(true));
 const clearAllButton=button("Снять всё",()=>setAllSelections(false));
 selectionToolbar.append(selectAllButton,clearAllButton);
 const sourceHeading=document.createElement("div");sourceHeading.className="merge-source-heading";
 const sourceHeadingLabel=document.createElement("h4");sourceHeadingLabel.textContent="Паки-источники и состав переноса";
 const sourceNavigation=document.createElement("div");sourceNavigation.className="merge-source-navigation";
 const previousSourcesButton=button("←",()=>{sourcePageStart=Math.max(0,sourcePageStart-getSourcePageSize());renderTree();});
 previousSourcesButton.className="merge-source-page-button";previousSourcesButton.title="Предыдущие паки";previousSourcesButton.setAttribute("aria-label","Предыдущие паки");
 const sourcePageLabel=document.createElement("span");sourcePageLabel.className="merge-source-page-label";
 const nextSourcesButton=button("→",()=>{sourcePageStart+=getSourcePageSize();renderTree();});
 nextSourcesButton.className="merge-source-page-button";nextSourcesButton.title="Следующие паки";nextSourcesButton.setAttribute("aria-label","Следующие паки");
 sourceNavigation.append(previousSourcesButton,sourcePageLabel,nextSourcesButton);
 sourceHeading.append(sourceHeadingLabel,sourceNavigation);
 const sourceList=document.createElement("div");sourceList.className="merge-source-list";
 const preview=document.createElement("div");preview.className="merge-preview";
 const error=document.createElement("div");error.className="merge-error";error.hidden=true;
 const footer=document.createElement("div");footer.className="destination-footer";
 const cancel=button("Отмена",closeDialog);
 const mergeButton=button("Объединить выбранное",executeMerge);mergeButton.className="primary";
 footer.append(cancel,mergeButton);
 modal.append(head,intro,targetLabel,selectionToolbar,sourceHeading,sourceList,preview,error,footer);overlay.appendChild(modal);document.body.appendChild(overlay);

 const selectionState=new Map();

 function getSourcePageSize(){
  if(window.innerWidth<=760)return 1;
  if(window.innerWidth<=1050)return 2;
  return 3;
 }
 function updateSourceNavigation(total){
  const pageSize=getSourcePageSize();
  const lastStart=Math.floor(Math.max(0,total-1)/pageSize)*pageSize;
  sourcePageStart=Math.min(Math.floor(sourcePageStart/pageSize)*pageSize,lastStart);
  const end=Math.min(total,sourcePageStart+pageSize);
  sourcePageLabel.textContent=total?`${sourcePageStart+1}–${end} из ${total}`:"Нет источников";
  previousSourcesButton.disabled=sourcePageStart===0;
  nextSourcesButton.disabled=end>=total;
  sourceList.dataset.visibleCount=String(end-sourcePageStart);
  sourceList.dataset.pageSize=String(pageSize);
  sourceList.dataset.totalSources=String(total);
 }
 function createState(pack){
  return {rounds:new Set((pack.model.rounds||[]).map(round=>round.id)),themes:new Map()};
 }
 function stateFor(pack){
  if(!selectionState.has(pack))selectionState.set(pack,createState(pack));
  return selectionState.get(pack);
 }
 function sourceRoundThemeStats(pack,round){
  const themes=round.themes||[];
  const questions=themes.reduce((sum,theme)=>sum+(theme.questions?.length||0),0);
  return {themes:themes.length,questions};
 }
 function selectedRoundThemeIds(pack,round){
  const state=stateFor(pack);
  if(state.rounds.has(round.id))return new Set((round.themes||[]).map(theme=>theme.id));
  return new Set(state.themes.get(round.id)||[]);
 }
 function selectionCounts(pack){
  const state=stateFor(pack);
  let rounds=0,themes=0,questions=0,media=0;
  for(const round of pack.model.rounds||[]){
   const roundSelected=state.rounds.has(round.id);
   const themeIds=selectedRoundThemeIds(pack,round);
   if(!roundSelected&&!themeIds.size)continue;
   rounds++;
   const selectedThemes=roundSelected?(round.themes||[]):(round.themes||[]).filter(theme=>themeIds.has(theme.id));
   themes+=selectedThemes.length;
   questions+=selectedThemes.reduce((sum,theme)=>sum+(theme.questions?.length||0),0);
   const mediaPaths=new Set();
   const nodes=roundSelected?[round.sourceNode]:selectedThemes.map(theme=>theme.sourceNode);
   for(const node of nodes){
    if(!node)continue;
    for(const item of [node,...node.querySelectorAll("*")]){
     if(item.localName==="item"&&/^true$/i.test(item.getAttribute("isRef")||"")){
      const value=String(item.hasAttribute("value")?item.getAttribute("value"):item.textContent||"").trim();
      if(value&&!/^(?:https?:|data:|blob:)/i.test(value))mediaPaths.add(value.toLowerCase());
     }
    }
   }
   media+=mediaPaths.size;
  }
  return {rounds,themes,questions,media};
 }
 function normalizeRoundSelection(pack,round){
  const state=stateFor(pack);
  const total=(round.themes||[]).length;
  const selected=selectedRoundThemeIds(pack,round);
  if(selected.size===total&&total>0){
   state.rounds.add(round.id);state.themes.delete(round.id);
  }else if(selected.size===0){
   state.rounds.delete(round.id);state.themes.delete(round.id);
  }
 }
 function setRoundSelection(pack,round,checked){
  const state=stateFor(pack);
  if(checked){
   state.rounds.add(round.id);state.themes.delete(round.id);
  }else{
   state.rounds.delete(round.id);state.themes.delete(round.id);
  }
 }
 function setThemeSelection(pack,round,theme,checked){
  const state=stateFor(pack);
  state.rounds.delete(round.id);
  const set=new Set(state.themes.get(round.id)||[]);
  if(checked)set.add(theme.id);else set.delete(theme.id);
  if(set.size){
   if(set.size===(round.themes||[]).length){
    state.rounds.add(round.id);
    state.themes.delete(round.id);
   }else{
    state.themes.set(round.id,set);
   }
  }else{
   state.themes.delete(round.id);
  }
 }
 function setPackSelection(pack,checked){
  const state=stateFor(pack);
  state.rounds.clear();state.themes.clear();
  if(checked){
   for(const round of pack.model.rounds||[])state.rounds.add(round.id);
  }
 }
 function selectionStatus(pack,round=null){
  const state=stateFor(pack);
  if(!round){
   const rounds=pack.model.rounds||[];
   let selectedCount=0;
   for(const item of rounds){
    if(state.rounds.has(item.id))selectedCount++;
    else if((state.themes.get(item.id)||new Set()).size>0)selectedCount+=0.5;
   }
   return rounds.length&&selectedCount===rounds.length?"checked":selectedCount>0?"indeterminate":"unchecked";
  }
  if(state.rounds.has(round.id))return "checked";
  const total=(round.themes||[]).length;
  const ids=selectedRoundThemeIds(pack,round);
  if(total&&ids.size===total)return "checked";
  if(ids.size)return "indeterminate";
  return "unchecked";
 }
 function setCheckboxState(input,status){
  input.checked=status==="checked";
  input.indeterminate=status==="indeterminate";
 }
 function selectionHasAny(pack){
  return (selectionCounts(pack).rounds>0);
 }
 function refreshPreview(){
  const selected=openedPacks.filter(pack=>pack!==openedPacks.find(item=>item.sessionId===targetSelect.value)&&selectionHasAny(pack));
  const totals=selected.reduce((total,pack)=>{
   const count=selectionCounts(pack);total.rounds+=count.rounds;total.themes+=count.themes;total.questions+=count.questions;return total;
  },{rounds:0,themes:0,questions:0});
  const media=selected.reduce((total,pack)=>total+selectionCounts(pack).media,0);
  preview.textContent=selected.length
   ?`Будет добавлено: пакетов — ${selected.length}; раундов — ${totals.rounds}; тем — ${totals.themes}; вопросов — ${totals.questions}; медиа-зависимостей — ${media}. Вопросы отдельно не выбираются; одинаковые media dependencies будут переиспользованы по SHA-256.`
   :"Выберите хотя бы один раунд или тему.";
  mergeButton.disabled=!selected.length||totals.rounds===0;
 }
 function renderTree(){
  sourceList.replaceChildren();
  const target=openedPacks.find(pack=>pack.sessionId===targetSelect.value);
  const sources=openedPacks.filter(pack=>pack!==target);
  const pageSize=getSourcePageSize();
  updateSourceNavigation(sources.length);
  const visibleSources=sources.slice(sourcePageStart,sourcePageStart+pageSize);
  for(const pack of visibleSources){
   const state=stateFor(pack);
   const packRow=document.createElement("div");packRow.className="merge-source-pack";
   const packHead=document.createElement("div");packHead.className="merge-source-row";
   const packCheck=document.createElement("input");packCheck.type="checkbox";packCheck.className="merge-source-check";packCheck.dataset.packId=pack.sessionId;
   const packName=document.createElement("span");packName.className="merge-source-name";packName.textContent=packLabel(pack)+" — "+(pack.fileName||"пакет");
   const packStats=document.createElement("small");packStats.className="merge-source-stats";
   packHead.append(packCheck,packName,packStats);packRow.appendChild(packHead);
   packCheck.addEventListener("change",()=>{setPackSelection(pack,packCheck.checked);renderTree();});
   const roundTree=document.createElement("div");roundTree.className="merge-round-tree";
   for(const round of pack.model.rounds||[]){
    const roundRow=document.createElement("div");roundRow.className="merge-round-row";
    const roundCheck=document.createElement("input");roundCheck.type="checkbox";roundCheck.className="merge-round-check";
    const roundName=document.createElement("span");roundName.className="merge-round-name";roundName.textContent=(round.order+1)+". "+(round.name||"(без названия)");
    const stats=sourceRoundThemeStats(pack,round);const roundStats=document.createElement("small");roundStats.className="merge-round-stats";roundStats.textContent=`${stats.themes} тем, ${stats.questions} вопросов`;
    roundRow.append(roundCheck,roundName,roundStats);roundTree.appendChild(roundRow);
    roundCheck.addEventListener("change",()=>{setRoundSelection(pack,round,roundCheck.checked);renderTree();});
    const themeTree=document.createElement("div");themeTree.className="merge-theme-tree";
    for(const theme of round.themes||[]){
     const themeRow=document.createElement("label");themeRow.className="merge-theme-row";
     const themeCheck=document.createElement("input");themeCheck.type="checkbox";themeCheck.className="merge-theme-check";
     const themeName=document.createElement("span");themeName.className="merge-theme-name";themeName.textContent=(theme.order+1)+". "+(theme.name||"(без названия)");
     const themeStats=document.createElement("small");themeStats.className="merge-theme-stats";themeStats.textContent=`${theme.questions?.length||0} вопросов`;
     themeRow.append(themeCheck,themeName,themeStats);themeTree.appendChild(themeRow);
     themeCheck.addEventListener("change",()=>{setThemeSelection(pack,round,theme,themeCheck.checked);renderTree();});
    }
    roundRow.appendChild(themeTree);
    roundTree.appendChild(roundRow);
   }
   packRow.appendChild(roundTree);sourceList.appendChild(packRow);
   setCheckboxState(packCheck,selectionStatus(pack));packStats.textContent=`${selectionCounts(pack).rounds} раунд., ${selectionCounts(pack).themes} тем, ${selectionCounts(pack).questions} вопросов выбрано`;
   for(const round of pack.model.rounds||[]){
    const roundRow=roundTree.children[round.order]||roundTree.querySelectorAll(".merge-round-row")[round.order];
    if(!roundRow)continue;
    const roundCheck=roundRow.querySelector(".merge-round-check");
    setCheckboxState(roundCheck,selectionStatus(pack,round));
    for(const theme of round.themes||[]){
     const index=(round.themes||[]).indexOf(theme);
     const themeCheck=roundRow.querySelectorAll(".merge-theme-check")[index];
     if(themeCheck)themeCheck.checked=selectedRoundThemeIds(pack,round).has(theme.id);
    }
   }
  }
  refreshPreview();
 }
 function setAllSelections(checked){
  const target=openedPacks.find(pack=>pack.sessionId===targetSelect.value);
  for(const pack of openedPacks){
   if(pack===target)continue;
   setPackSelection(pack,checked);
  }
  renderTree();
 }
 async function executeMerge(){
  const target=openedPacks.find(pack=>pack.sessionId===targetSelect.value);
  const sources=openedPacks.filter(pack=>pack!==target&&selectionHasAny(pack));
  if(!target||!sources.length)return;
  mergeButton.disabled=true;targetSelect.disabled=true;sourceList.querySelectorAll("input").forEach(input=>input.disabled=true);
  previousSourcesButton.disabled=true;nextSourcesButton.disabled=true;
  selectAllButton.disabled=true;clearAllButton.disabled=true;error.hidden=true;
  const selections=new Map();
  for(const source of sources){
   const state=stateFor(source);
   selections.set(source,{rounds:new Set(state.rounds),themes:new Map([...state.themes].map(([id,set])=>[id,new Set(set)]))});
  }
  try{
   const label="Объединение выбранного содержимого из "+sources.length+" пакетов";
   const result=await runPackHistoryActionAsync(target,label,async()=>{
    const existingResources=new Set(target.model.resources||[]);
    const merged=await mergePacksIntoTarget(target,sources,selections);
    if(isQualityControlEnabled(target)){
     const violations=findQualityMediaViolations(target).filter(item=>!existingResources.has(item.resource));
     if(violations.length)throw Error("Объединение добавляет медиафайл выше лимита SIGame: "+violations[0].path+" ("+formatSigameBytes(violations[0].size)+", максимум "+formatSigameBytes(violations[0].limit)+").");
    }
    await assertPackageSizeWithinLimit(target,"Объединение пакетов");
    return merged;
   });
   closeDialog();
   activateOpenedPack(target);
   setExplorerView("editor");
   selectPackage();
   const validation=validatePack(target.model);
   renderTree({expandSelected:false});
   renderPackTabs();
   updateStatus(validation,"Объединение завершено");
   exportBtn.disabled=!validation.ok;
   log("✓ Объединены пакеты: "+result.sourceNames.join(", "));
   log("Добавлено: "+result.rounds+" раундов, "+result.themes+" тем, "+result.questions+" вопросов.");
   log("Медиа-зависимости: добавлено "+result.importedResources.length+", переиспользовано "+result.reusedResources.length+"; источники не изменены.");
  }catch(exception){
   error.textContent="Объединение отменено: "+exception.message+" Все изменения целевого пакета откатились.";
   error.hidden=false;targetSelect.disabled=false;sourceList.querySelectorAll("input").forEach(input=>input.disabled=false);
   selectAllButton.disabled=false;clearAllButton.disabled=false;mergeButton.disabled=false;
   updateSourceNavigation(openedPacks.filter(pack=>pack.sessionId!==targetSelect.value).length);
   log("✗ Ошибка объединения пакетов: "+(exception.stack||exception));
  }
 }
 targetSelect.addEventListener("change",()=>{sourcePageStart=0;renderTree();});
 onResize=()=>{if(overlay.isConnected)renderTree();};
 window.addEventListener("resize",onResize);
 renderTree();
 return true;
}
function inferSelection(id){
 if(!id)return null;
 if(findQuestion(id))return {id,kind:"question"};
 if(findTheme(id))return {id,kind:"theme"};
 if(findRound(id))return {id,kind:"round"};
 return null;
}
function mutate(fn,{after=null,message=""}={}){
 flushPendingHistoryEdit();
 const before=current?undoRedoHistory.begin(current):null;
 try{
  const result=fn();
  current.dirty=true;
  commitHistoryAction(before,message||"Изменение структуры пакета");
  const target=after?after(result):(inferSelection(result)|| (selectedObjectExists()?selected:null));
  if(target?.kind==="package")selectPackage({renderTree:false});
  else if(target?.id&&target?.kind){selectNode(target.id,target.kind,{renderTree:false});expandSelectionPath(target.id,target.kind)}
  else clearSelection({renderTree:false});
  const v=validatePack(current.model);
  renderValidation(v);renderTree({expandSelected:true});updateStatus(v,message);
  exportBtn.disabled=!v.ok;
  log("✓ Операция выполнена"+(result&&typeof result==="string"?": "+result:""));
  if(message)log("ℹ "+message);
  if(!v.ok)log("⚠ После операции обнаружены ошибки проверки: "+v.errors.join("; "));
  return result||true;
 }catch(e){
  if(before&&current){try{undoRedoHistory.restore(current,before)}catch(restoreError){log("✗ Не удалось откатить частичное изменение: "+restoreError.message)}}
  updateHistoryControls();
  log("✗ "+(e.stack||e));
  refreshLive({rerenderEditor:true,message:"Операция не выполнена"});
  alert("Операция не выполнена:\n"+e.message);
  return false;
 }
}
editorTab?.addEventListener("click",()=>{
 resourceTargetItem=null;
 setExplorerView("editor");
});
resourcesTab?.addEventListener("click",()=>{
 if(current)setExplorerView("resources");
});
resourceSearch?.addEventListener("input",renderPackageExplorer);
resourceFolderFilter?.addEventListener("change",renderPackageExplorer);
resourceTypeFilter?.addEventListener("change",renderPackageExplorer);
resourceStatusFilter?.addEventListener("change",renderPackageExplorer);
resourceSort?.addEventListener("change",renderPackageExplorer);
resourceSizeMin?.addEventListener("input",renderPackageExplorer);
resourceSizeMax?.addEventListener("input",renderPackageExplorer);

// Prevent the browser from navigating to a dropped file. During dragover,
// browsers expose DataTransfer.types/items, while DataTransfer.files may still be empty.
document.addEventListener("dragover",event=>{
 if(!isFileDragEvent(event))return;
 event.preventDefault();
 const target=event.target instanceof Element?event.target.closest(".content-item, #tree"):null;
 if(event.dataTransfer)event.dataTransfer.dropEffect=current&&target?"copy":"none";
},true);
document.addEventListener("drop",event=>{
 if(isFileDragEvent(event)||!!event.dataTransfer?.files?.length)event.preventDefault();
},true);

// In an empty workspace, a single .siq file opens as a package.
// Existing media/resource Drag & Drop handlers remain unchanged once a package is active.
packDropZone?.addEventListener("dragover",event=>{
 if(!isFileDragEvent(event))return;
 event.preventDefault();
 if(event.dataTransfer)event.dataTransfer.dropEffect="copy";
 packDropZone.classList.add("pack-drop-active");
});
packDropZone?.addEventListener("dragleave",event=>{
 if(event.relatedTarget&&packDropZone.contains(event.relatedTarget))return;
 packDropZone.classList.remove("pack-drop-active");
});
packDropZone?.addEventListener("drop",async event=>{
 packDropZone.classList.remove("pack-drop-active");
 const transfer=event.dataTransfer;
 const hasFiles=isFileDragEvent(event)||!!transfer?.files?.length;
 if(!hasFiles)return;
 event.preventDefault();
 event.stopPropagation();
 let files=Array.from(transfer?.files||[]);
 if(!files.length){
  files=Array.from(transfer?.items||[]).filter(item=>item?.kind==="file").map(item=>item.getAsFile()).filter(Boolean);
 }
 await openPackageFiles(files,{siqOnly:true});
});

workspace?.addEventListener("dragover",event=>{
 if(current||!isFileDragEvent(event))return;
 event.preventDefault();
 if(event.dataTransfer)event.dataTransfer.dropEffect="copy";
 workspace.classList.add("siq-drop-active");
});
workspace?.addEventListener("dragleave",event=>{
 if(event.relatedTarget&&workspace.contains(event.relatedTarget))return;
 workspace.classList.remove("siq-drop-active");
});
workspace?.addEventListener("drop",async event=>{
 workspace.classList.remove("siq-drop-active");
 if(current)return;
 const files=Array.from(event.dataTransfer?.files||[]);
 if(!isFileDragEvent(event)&&!files.length)return;
 event.preventDefault();
 if(files.length!==1){
  log("✗ Drop отклонён: перетащите ровно один файл .siq");
  return;
 }
 if(!/\.siq$/i.test(files[0].name||"")){
  log("✗ Drop отклонён: поддерживаются только файлы с расширением .siq");
  return;
 }
 await openPackageFile(files[0],{siqOnly:true});
});

tree.addEventListener("dragover",event=>{
 if(!current||!isFileDragEvent(event))return;
 event.preventDefault();
 if(event.dataTransfer)event.dataTransfer.dropEffect="copy";
 setDropVisual(tree,true);
});
tree.addEventListener("dragleave",event=>{
 if(!tree.contains(event.relatedTarget))setDropVisual(tree,false);
});
tree.addEventListener("drop",async event=>{
 const hasFiles=isFileDragEvent(event)||!!event.dataTransfer?.files?.length;
 setDropVisual(tree,false);
 if(!hasFiles)return;
 event.preventDefault();
 if(!current)return;
 const check=validateDroppedFiles(event.dataTransfer?.files);
 if(!current||check.error){
  if(check.error)log("✗ Drop отклонён: "+check.error.replaceAll("\\n"," "));
  return;
 }
 try{
  const result=await runHistoryActionAsync(
   "Импорт ресурсов через Drop: "+check.files.length+" файл(ов)",
   async()=>{
    const imported=await addResourceFilesToPack(current,check.files,{conflictPolicy:"keep-both"});
    rebuildPackReferences(current);
    await assertPackageSizeWithinLimit(current,"Drop-импорт");
    return imported;
   }
  );
  rebuildPackReferences(current);
  refreshResourceRows();
  refreshValidationAndSelection();
  log("✓ Drop-импорт завершён: добавлено "+result.added.length+", переиспользовано "+result.reused+", пропущено "+result.skipped+".");
 }catch(error){
  log("✗ Ошибка Drop-импорта: "+(error.stack||error));
  alert("Не удалось импортировать файлы:\n"+error.message);
 }
});
tree.addEventListener("click",e=>{
 const el=e.target.closest("[data-id]");
 if(!el)return;
 if(el.tagName==="SUMMARY"){
  selectNode(el.dataset.id,el.dataset.kind,{renderTree:false});
  tree.querySelectorAll(".selected").forEach(node=>node.classList.remove("selected"));
  el.classList.add("selected");
  return;
 }
 selectNode(el.dataset.id,el.dataset.kind);
});
async function openPackageFile(file,{siqOnly=false,clearLog=true}={}){
 if(!file)return false;
 if(siqOnly&&!/\.siq$/i.test(file.name||"")){
  log("✗ Drop отклонён: поддерживаются только файлы с расширением .siq");
  return false;
 }
 const sourceKey=[file.name,file.size,file.lastModified||0].join("|");
 const existing=openedPacks.find(pack=>pack.sourceKey===sourceKey)||null;
 if(existing&&existing!==current){
  if(input)input.value="";
  activateOpenedPack(existing);
  log("Открыт уже загруженный пакет: "+file.name);
  updateStatus(validatePack(current.model),"Пакет переключён");
  return true;
 }
 if(existing===current&&current?.dirty&&!window.confirm("Пакет «"+(current.model.metadata.name||current.fileName)+"» уже открыт и содержит изменения. Перезагрузить его из исходного файла? Несохранённые изменения будут потеряны.")){
  if(input)input.value="";
  return false;
 }
 if(clearLog)output.textContent="";
 exportBtn.disabled=true;
 statusBar.textContent="Читаю пакет: "+file.name+"…";
 log("Выбран файл: "+file.name);log("Начинаю чтение...");
 try{
  const r=await readSiq(file),v=validatePack(r.model);
  const pack={
   ...r,
   sessionId:crypto.randomUUID(),
   sourceKey,
   dirty:false,
   extraResources:[],
   deletedResourcePaths:new Set(),
   resourceDeletionHistory:[],
   history:new UndoRedoHistory(40),
   uiState:{
    selected:{id:"__package__",kind:"package"},
    activeView:"editor",
    resourceTypeFilter:"all",
    resourceStatusFilter:"all",
    resourceSort:"name"
   }
  };
  const qualityMarkerAdded=ensureQualityControlMarker(pack);
  if(existing&&existing===current){
   flushPendingHistoryEdit();
   disposeArchivePreview();
   const index=openedPacks.indexOf(existing);
   if(index>=0)openedPacks[index]=pack;
   current=null;
  }else openedPacks.push(pack);
  resourceTargetItem=null;
  activateOpenedPack(pack);
  if(resourcesTab)resourcesTab.disabled=false;
  log("Файл: "+file.name);log("Размер: "+file.size+" bytes");log("SIQ version: "+r.model.version);log("ZIP entries: "+r.zip.entries.length);log("Package: "+r.model.metadata.name);
  if(qualityMarkerAdded)log("✓ quality.marker отсутствовал — добавлен автоматически. Включён QC, лимит пакета 150 МБ.");
  log("");log(v.ok?"✓ Validation: OK":"✗ Validation: FAILED");
  for(const e of v.errors.slice(0,30))log("  "+e);
  selectPackage({renderTree:false});
  refreshLive({rerenderEditor:true,message:"Пакет открыт"});
  setExplorerView("editor");
  renderPackTabs();
  return true;
 }catch(e){
  log("✗ "+(e.stack||e));
  if(current)refreshLive({rerenderEditor:true,message:"Не удалось открыть пакет"});
  else{details.textContent="Ошибка чтения";tree.textContent="Не удалось открыть пакет.";updateStatus(null,"Ошибка чтения файла")}
  exportBtn.disabled=!current||!validatePack(current.model).ok;
  return false;
 }finally{
  updateHistoryControls();
 }
}
async function openPackageFiles(files,{siqOnly=false}={}){
 const list=Array.from(files||[]).filter(Boolean);
 const rejected=siqOnly?list.filter(file=>!/\.siq$/i.test(file.name||"")):[];
 const accepted=siqOnly?list.filter(file=>/\.siq$/i.test(file.name||"")):list;
 if(output)output.textContent="";
 if(rejected.length){
  const names=rejected.slice(0,5).map(file=>file.name||"без имени").join(", ");
  log("⚠ Пропущено файлов с неподдерживаемым расширением: "+rejected.length+" ("+names+(rejected.length>5?" и ещё "+(rejected.length-5):"")+")");
 }
 if(!accepted.length){
  if(!rejected.length)log("Нет файлов для открытия.");
  return {opened:0,alreadyOpen:0,failed:0,rejected:rejected.length};
 }
 const knownKeys=new Set(openedPacks.map(pack=>pack.sourceKey).filter(Boolean));
 let opened=0,alreadyOpen=0,failed=0;
 for(const file of accepted){
  const sourceKey=[file.name,file.size,file.lastModified||0].join("|");
  const existed=knownKeys.has(sourceKey);
  const alreadyActive=openedPacks.find(pack=>pack.sourceKey===sourceKey)===current;
  if(alreadyActive){
   alreadyOpen++;
   log("Пакет уже активен: "+file.name);
   continue;
  }
  const success=await openPackageFile(file,{siqOnly,clearLog:false});
  if(!success){failed++;continue}
  if(existed)alreadyOpen++;
  else{opened++;knownKeys.add(sourceKey)}
 }
 log("✓ Пакеты обработаны: добавлено вкладок — "+opened+"; уже открытые — "+alreadyOpen+"; ошибок — "+failed+"; неподходящих файлов — "+rejected.length+".");
 return {opened,alreadyOpen,failed,rejected:rejected.length};
}
checkUpdatesBtn?.addEventListener("click",()=>{void checkForAppUpdates();});
input.addEventListener("click",()=>{input.value="";});
input.addEventListener("change",()=>{void openPackageFile(input.files?.[0]);});
exportBtn.addEventListener("click",async()=>{
 if(!current)return;
 exportBtn.disabled=true;
 try{
  log("");log("Собираю новый ZIP...");
  const bytes=await writeSiq(current,{});
  const packageLimit=qualityPackageLimit(current);
  if(bytes.length>packageLimit)throw Error("Пакет весит "+formatSigameBytes(bytes.length)+", текущий лимит SIGame — "+formatSigameBytes(packageLimit)+". Удалите/сожмите ресурсы или измените режим контроля качества.");
  if(isQualityControlEnabled(current)){
   const violations=findQualityMediaViolations(current);
   if(violations.length){
    const first=violations[0];
    const remainder=violations.length>1?" и ещё "+(violations.length-1)+" файл(ов)":"";
    throw Error("Контроль качества не пройден: "+first.path+" — "+formatSigameBytes(first.size)+", лимит "+formatSigameBytes(first.limit)+remainder+". Откройте «Лимиты SIGame», чтобы увидеть список.");
   }
  }
  log("✓ ZIP собран: "+bytes.length+" bytes");
  const safeBaseName=String(current.model.metadata.name||current.fileName.replace(/\.siq$/i,"")||"Новый пакет")
   .trim().replace(/[<>:"\/\\|?*\u0000-\u001f]/g,"_").replace(/[. ]+$/g,"").slice(0,120)||"Новый пакет";
  const name=current.isNewPack?safeBaseName+".siq":current.fileName.replace(/\.siq$/i,"")+" - edited.siq";
  const roundtrip=await readSiq(new File([bytes],name,{type:"application/octet-stream"}));
  log("✓ Экспортированный ZIP повторно прочитан");
  const rv=validatePack(roundtrip.model);
  if(!rv.ok)throw Error("Round-trip validation failed: "+rv.errors.join("; "));
  downloadSiq(bytes,name);
  if(current.isNewPack){current.isNewPack=false;current.fileName=name}
  current.dirty=false;undoRedoHistory.markSaved(current);renderPackTabs();updateHistoryControls();
  log("✓ Экспорт завершён: "+name);log("Размер нового ZIP: "+bytes.length+" bytes");log("✓ Round-trip validation: OK");
  refreshLive({message:"Экспорт завершён"});
 }catch(e){log("✗ Ошибка экспорта: "+(e.stack||e));updateStatus(validatePack(current.model),"Ошибка экспорта")}
 finally{exportBtn.disabled=!current||!validatePack(current.model).ok}
});
log("SiGame Pack Editor запущен.");