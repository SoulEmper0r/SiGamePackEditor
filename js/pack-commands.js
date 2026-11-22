import {buildPackModel,normalizeResourceReference} from "./pack-model.js";

function cloneWithNewIds(node){
  const clone=node.cloneNode(true);
  const seen=new Set();
  for(const el of [clone,...clone.querySelectorAll("*")]){
    if(el.hasAttribute("id")){
      let id=crypto.randomUUID();
      while(seen.has(id))id=crypto.randomUUID();
      seen.add(id);el.setAttribute("id",id);
    }
  }
  return clone;
}

function requireNode(pack,id,name){
  const findModel=()=>{
    if(name==="Вопрос"){
      for(const r of pack.model.rounds)for(const t of r.themes){const q=t.questions.find(x=>x.id===id);if(q)return q.sourceNode;}
    }else if(name==="Тема"){
      for(const r of pack.model.rounds){const t=r.themes.find(x=>x.id===id);if(t)return t.sourceNode;}
    }else if(name==="Раунд"){
      const r=pack.model.rounds.find(x=>x.id===id);if(r)return r.sourceNode;
    }
    return null;
  };
  const modelNode=findModel();
  if(modelNode)return modelNode;
  const root=pack.model.sourceDocument.documentElement;
  const all=[root,...root.querySelectorAll("*")];
  const node=all.find(x=>x.getAttribute("id")===id);
  if(!node)throw Error(name+" не найден: "+id);
  return node;
}

function collectModelIds(model){
  const ids=new Map();
  const remember=item=>{if(item?.sourceNode&&item.id)ids.set(item.sourceNode,item.id)};
  const rememberInfo=info=>{
    if(!info)return;
    remember(info);
    for(const key of ["authors","sources","comments","showmanComments"])for(const item of info[key]||[])remember(item);
  };
  const rememberParameter=parameter=>{
    remember(parameter);
    if(parameter.type==="content")for(const item of parameter.value||[])remember(item);
    else if(parameter.type==="group")for(const child of parameter.value||[])rememberParameter(child);
    else if(parameter.type==="numberSet")remember(parameter.value);
  };
  for(const round of model.rounds||[]){
    remember(round);rememberInfo(round.info);
    for(const theme of round.themes||[]){
      remember(theme);rememberInfo(theme.info);
      for(const question of theme.questions||[]){
        remember(question);
        for(const parameter of question.parameters||[])rememberParameter(parameter);
      }
    }
  }
  return ids;
}
function restoreModelIds(model,ids){
  const remap=new Map();
  const restore=item=>{
    if(!item?.sourceNode||!ids.has(item.sourceNode))return;
    const previousId=ids.get(item.sourceNode);
    if(item.id!==previousId)remap.set(item.id,previousId);
    item.id=previousId;
  };
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
  return remap;
}
function rebuild(pack){
  const previous=pack.model;
  const previousIds=collectModelIds(previous);
  const rebuilt=buildPackModel(pack.document,pack.zip.entries);
  const idRemap=restoreModelIds(rebuilt,previousIds);

  // Structural edits only change content.xml. Keep the live resource overlay:
  // imported, renamed, replaced and deduplicated resources are not in zip.entries yet.
  rebuilt.resources=previous.resources||rebuilt.resources;
  const manifestByPath=new Map((rebuilt.manifest?.entries||[]).map(entry=>[
    normalizeResourceReference(entry.normalizedPath||entry.name).toLowerCase(),entry
  ]));
  const resourcesByPath=new Map(rebuilt.resources.map(resource=>[
    normalizeResourceReference(resource.normalizedPath||resource.archivePath).toLowerCase(),resource
  ]));
  for(const resource of rebuilt.resources){
    resource.manifestEntry=manifestByPath.get(
      normalizeResourceReference(resource.normalizedPath||resource.archivePath).toLowerCase()
    )||null;
  }
  rebuilt.references=(rebuilt.references||[]).map(reference=>({
    ...reference,
    roundId:idRemap.get(reference.roundId)||reference.roundId,
    themeId:idRemap.get(reference.themeId)||reference.themeId,
    questionId:idRemap.get(reference.questionId)||reference.questionId,
    itemId:idRemap.get(reference.itemId)||reference.itemId,
    resource:resourcesByPath.get(normalizeResourceReference(reference.normalizedPath||reference.rawValue).toLowerCase())||null
  }));
  pack.model=rebuilt;
  return pack.model;
}

function modelIdForNode(pack,node,kind){
  if(kind==="question"){
    for(const round of pack.model.rounds)for(const theme of round.themes){
      const question=theme.questions.find(item=>item.sourceNode===node);
      if(question)return question.id;
    }
  }else if(kind==="theme"){
    for(const round of pack.model.rounds){
      const theme=round.themes.find(item=>item.sourceNode===node);
      if(theme)return theme.id;
    }
  }else if(kind==="round"){
    const round=pack.model.rounds.find(item=>item.sourceNode===node);
    if(round)return round.id;
  }
  return null;
}

export function copyQuestion(pack,questionId,targetThemeId){
  const source=requireNode(pack,questionId,"Вопрос");
  const target=requireNode(pack,targetThemeId,"Тема");
  const questions=Array.from(target.children).find(x=>x.localName==="questions");
  if(!questions)throw Error("У целевой темы отсутствует <questions>");
  const clone=cloneWithNewIds(source);
  questions.appendChild(clone);
  rebuild(pack);
  return modelIdForNode(pack,clone,"question")||clone.getAttribute("id");
}

export function copyTheme(pack,themeId,targetRoundId){
  const source=requireNode(pack,themeId,"Тема");
  const target=requireNode(pack,targetRoundId,"Раунд");
  const themes=Array.from(target.children).find(x=>x.localName==="themes");
  if(!themes)throw Error("У целевого раунда отсутствует <themes>");
  const clone=cloneWithNewIds(source);
  themes.appendChild(clone);
  rebuild(pack);
  return modelIdForNode(pack,clone,"theme")||clone.getAttribute("id");
}

export function copyRound(pack,roundId){
  const source=requireNode(pack,roundId,"Раунд");
  const rounds=Array.from(pack.document.documentElement.children).find(x=>x.localName==="rounds");
  if(!rounds)throw Error("У package отсутствует <rounds>");
  const clone=cloneWithNewIds(source);
  rounds.appendChild(clone);
  rebuild(pack);
  return modelIdForNode(pack,clone,"round")||clone.getAttribute("id");
}

export function deleteQuestion(pack,questionId){
  const node=requireNode(pack,questionId,"Вопрос");
  node.parentNode.removeChild(node);
  rebuild(pack);
}

export function deleteTheme(pack,themeId){
  const node=requireNode(pack,themeId,"Тема");
  node.parentNode.removeChild(node);
  rebuild(pack);
}

export function deleteRound(pack,roundId){
  const node=requireNode(pack,roundId,"Раунд");
  node.parentNode.removeChild(node);
  rebuild(pack);
}

export function moveContentItem(pack,param,itemId,targetItemId,position="before"){
  if(!pack||!pack.model||!param||param.type!=="content"||!Array.isArray(param.value)){
    throw Error("Нельзя переставить элемент: выбранный параметр не является content.");
  }
  if(position!=="before"&&position!=="after"){
    throw Error("Неизвестная позиция элемента: "+position);
  }
  if(itemId===targetItemId)return false;

  const fromIndex=param.value.findIndex(item=>item.id===itemId);
  const targetIndex=param.value.findIndex(item=>item.id===targetItemId);
  if(fromIndex<0)throw Error("Перемещаемый элемент уже отсутствует в параметре.");
  if(targetIndex<0)throw Error("Элемент назначения уже отсутствует в параметре.");

  const source=param.value[fromIndex];
  const target=param.value[targetIndex];
  const parent=param.sourceNode;
  if(!parent||source.sourceNode?.parentNode!==parent||target.sourceNode?.parentNode!==parent){
    throw Error("Элементы должны принадлежать одному XML content-параметру.");
  }
  if(parent.ownerDocument!==pack.model.sourceDocument){
    throw Error("Content-параметр относится к другому XML-документу.");
  }

  const remaining=param.value.filter(item=>item.id!==itemId);
  const targetIndexAfterMove=remaining.findIndex(item=>item.id===targetItemId);
  const insertIndex=position==="after"?targetIndexAfterMove+1:targetIndexAfterMove;
  if(insertIndex===fromIndex)return false;

  const reference=position==="after"?target.sourceNode.nextSibling:target.sourceNode;
  parent.insertBefore(source.sourceNode,reference);
  param.value.splice(fromIndex,1);
  param.value.splice(insertIndex,0,source);
  pack.dirty=true;
  return true;
}
