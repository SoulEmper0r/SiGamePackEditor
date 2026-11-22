import {findResource,objectUrlForResource} from "./resource-manager.js";
import {createSafeHtmlPreview,safeExternalMediaUrl} from "./html-preview.js";

function element(tag,className="",text=""){
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
}

function answerContent(question){
  return question.parameters?.find(p=>p.name==="answer"&&p.type==="content")?.value||[];
}

function parseDuration(value){
  const raw=String(value??"").trim();
  if(!raw)return null;
  const match=/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/.exec(raw);
  if(!match)return {raw,valid:false};
  const hours=Number(match[1]),minutes=Number(match[2]),seconds=Number(match[3]);
  if(minutes>59||seconds>59)return {raw,valid:false};
  const totalSeconds=hours*3600+minutes*60+seconds;
  const normalized=[hours,minutes,seconds].map(part=>String(part).padStart(2,"0")).join(":");
  const human=hours>0
    ?[hours+" ч",minutes+" мин",seconds+" с"].filter((part,index)=>index===0||!part.startsWith("0 ")).join(" ")
    :minutes>0?minutes+" мин "+seconds+" с":seconds+" с";
  return {raw,valid:true,totalSeconds,normalized,human,isLegacy:raw!==normalized};
}

function placementInfo(value){
  const raw=String(value||"screen").trim();
  switch(raw.toLowerCase()){
    case "":
    case "screen":return {value:"screen",label:"Игровой экран",description:"Элемент выводится на основном игровом экране."};
    case "replic":return {value:"replic",label:"Реплика ведущего",description:"Текст показывается как реплика ведущего, а не как основной экранный блок."};
    case "background":return {value:"background",label:"Фоновое воспроизведение",description:"Элемент воспроизводится в фоне, не занимая основную область контента."};
    default:return {value:"unknown",label:"Неизвестное размещение: "+raw,description:"Исходное значение placement сохранено без изменений.",raw};
  }
}

function waitForFinishInfo(value){
  const raw=String(value??"").trim();
  if(!raw)return {value:true,isDefault:true,label:"Ждать завершения",description:"Атрибут отсутствует; в SIQ v5 значение по умолчанию — true."};
  if(/^true$/i.test(raw)||raw==="1")return {value:true,isDefault:false,label:"Ждать завершения",description:"Следующий элемент ожидает завершения текущего."};
  if(/^false$/i.test(raw)||raw==="0")return {value:false,isDefault:false,label:"Не ждать завершения",description:"Следующий элемент может появиться до завершения текущего."};
  return {value:null,isDefault:false,label:"waitForFinish: "+raw,description:"Неизвестное значение атрибута сохранено без изменений.",raw};
}

function appendMetaChip(meta,text,className,title){
  const chip=element("span","preview-meta-chip"+(className?" "+className:""),text);
  if(title)chip.title=title;
  meta.appendChild(chip);
}

function appendItemMetadata(block,item,type){
  const placement=placementInfo(item.placement);
  const wait=waitForFinishInfo(item.waitForFinish);
  const duration=parseDuration(item.duration);
  block.dataset.placement=placement.value;
  if(wait.value!==null)block.dataset.waitForFinish=String(wait.value);

  const meta=element("div","preview-item-meta");
  appendMetaChip(meta,type.toUpperCase(),"preview-meta-type");
  appendMetaChip(meta,placement.label,"preview-meta-placement",placement.description);

  if(duration){
    if(duration.valid){
      const title=duration.isLegacy
        ?"Нестандартная запись из исходного пакета. В предпросмотре нормализована только строка отображения; исходный XML не меняется."
        :"Формат SIQ v5: часы:минуты:секунды.";
      appendMetaChip(meta,"Время показа: "+duration.normalized+" · "+duration.human,"preview-meta-duration",title);
    }else{
      appendMetaChip(meta,"Duration: "+duration.raw+" · формат не распознан","preview-meta-duration preview-meta-warning","Исходное значение сохранено. Ожидается формат HH:MM:SS.");
    }
  }else{
    appendMetaChip(meta,"Время показа: автоматически","preview-meta-duration","Явный duration не задан; время определяется правилами SIGame и типом контента.");
  }

  const waitText=wait.label+(wait.isDefault?" · по умолчанию":"");
  appendMetaChip(meta,waitText,wait.value===null?"preview-meta-warning":"preview-meta-wait",wait.description);
  block.appendChild(meta);
}

async function renderItem(pack,item,urls,isActive=()=>true){
  const block=element("article","question-preview-item");
  const type=String(item.type||"text").toLowerCase();
  appendItemMetadata(block,item,type);

  if(type==="html"){
    try{
      const resource=item.isRef?findResource(pack,item.value,type):null;
      if(item.isRef&&!resource)throw new Error("HTML-ресурс не найден: "+(item.value||"(пустая ссылка)"));
      const preview=await createSafeHtmlPreview(pack,{
        source:item.isRef?"":String(item.value||""),
        resource,
        basePath:resource?.normalizedPath||"Html/inline.html",
        title:"Безопасный предпросмотр HTML-вопроса"
      });
      if(!isActive())return block;
      block.append(preview.container);
    }catch(error){
      block.appendChild(element("div","preview-resource-error","Не удалось открыть HTML: "+error.message));
    }
    return block;
  }

  if(item.isRef){
    const resource=findResource(pack,item.value,type);
    if(!resource){
      block.appendChild(element("div","preview-resource-error","Ресурс не найден: "+(item.value||"(пустая ссылка)")));
      return block;
    }
    try{
      const url=await objectUrlForResource(resource);
      if(!isActive()){
        URL.revokeObjectURL(url);
        return block;
      }
      urls.push(url);
      if(type==="image"){
        const img=element("img","preview-image");
        img.src=url;
        img.alt=resource.archivePath;
        img.addEventListener("error",()=>block.appendChild(element("div","preview-resource-error","Браузер не смог декодировать изображение. Файл можно скачать ниже.")),{once:true});
        block.appendChild(img);
      }else if(type==="audio"||type==="video"){
        const media=element(type,type==="audio"?"preview-audio":"preview-video");
        media.controls=true;
        media.preload=type==="audio"?"none":"metadata";
        media.src=url;
        media.addEventListener("error",()=>block.appendChild(element("div","preview-resource-error","Браузер не поддерживает этот аудиоформат/кодек. Используйте скачивание исходного файла.")),{once:true});
        block.appendChild(media);
      }
      const download=element("a","preview-resource-link","Скачать исходный файл");
      download.href=url;
      download.download=resource.archivePath.split("/").pop()||"resource";
      block.appendChild(download);
    }catch(error){
      block.appendChild(element("div","preview-resource-error","Не удалось прочитать ресурс: "+error.message));
    }
    return block;
  }

  if(type==="text"){
    block.appendChild(element("div","preview-text",item.value||""));
  }else if(["image","audio","video"].includes(type)){
    const external=safeExternalMediaUrl(item.value);
    if(!external){
      block.appendChild(element("div","preview-resource-error","Файл не привязан к ресурсу, а внешняя ссылка не является безопасным HTTP(S)-адресом: "+(item.value||"путь не указан")));
      return block;
    }
    block.appendChild(element("div","preview-external-note","Внешний ресурс · сетевой запрос выполняется только после нажатия."));
    const loadExternal=element("button","preview-external-load","Загрузить из Интернета");
    loadExternal.type="button";loadExternal.dataset.externalUrl=external;
    loadExternal.addEventListener("click",()=>{
      loadExternal.disabled=true;
      loadExternal.textContent="Загрузка…";
      let media;
      if(type==="image"){
        media=element("img","preview-image");
        media.alt="Внешнее изображение";media.loading="lazy";media.referrerPolicy="no-referrer";
      }else if(type==="audio"){
        media=element("audio","preview-audio");
        media.controls=true;media.preload="none";media.referrerPolicy="no-referrer";
      }else{
        media=element("video","preview-video");
        media.controls=true;media.preload="none";media.referrerPolicy="no-referrer";
      }
      media.addEventListener("error",()=>{
        block.appendChild(element("div","preview-resource-error","Не удалось загрузить внешний ресурс. Проверьте ссылку и доступность сайта."));
      },{once:true});
      media.src=external;
      block.appendChild(media);
      loadExternal.remove();
    },{once:true});
    block.appendChild(loadExternal);
  }else{
    block.appendChild(element("pre","preview-raw",item.value||""));
  }
  return block;
}

export async function openQuestionPreview(pack,question){
  if(!pack||!question)throw new Error("Не удалось открыть предпросмотр: вопрос или пакет не найден.");

  const urls=[];
  let disposed=false;
  const overlay=element("div","question-preview-overlay");
  const modal=element("section","question-preview-modal");
  modal.setAttribute("role","dialog");
  modal.setAttribute("aria-modal","true");
  modal.setAttribute("aria-label","Предпросмотр вопроса");

  const header=element("header","question-preview-header");
  const heading=element("div","question-preview-heading");
  heading.appendChild(element("h2","","Предпросмотр вопроса"));
  heading.appendChild(element("div","preview-price","Цена: "+(question.price??0)));
  const closeButton=element("button","preview-close","Закрыть");
  closeButton.type="button";
  header.append(heading,closeButton);

  const content=element("div","question-preview-content");
  const items=question.questionContent||[];
  if(!items.length)content.appendChild(element("div","preview-empty","В вопросе пока нет содержимого."));

  const answerItems=answerContent(question);
  const answerSection=element("section","question-preview-answer");
  const revealButton=element("button","preview-reveal","Показать ответ");
  revealButton.type="button";
  const answerBody=element("div","preview-answer-body");
  answerBody.hidden=true;
  if(answerItems.length)answerBody.appendChild(element("h3","","Контент ответа"));
  if(question.right?.length){
    answerBody.appendChild(element("h3","","Правильные варианты"));
    for(const answer of question.right)answerBody.appendChild(element("div","preview-answer-line",answer));
  }
  if(question.wrong?.length){
    answerBody.appendChild(element("h3","","Неверные варианты"));
    for(const answer of question.wrong)answerBody.appendChild(element("div","preview-answer-line preview-wrong",answer));
  }
  if(!answerItems.length&&!question.right?.length&&!question.wrong?.length){
    answerBody.appendChild(element("div","preview-empty","Ответы не заполнены."));
  }

  answerSection.append(revealButton,answerBody);
  modal.append(header,content,answerSection);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    document.removeEventListener("keydown",onKeyDown);
    for(const url of urls)URL.revokeObjectURL(url);
    overlay.remove();
  };
  const onKeyDown=event=>{if(event.key==="Escape")dispose()};
  const isActive=()=>!disposed;
  closeButton.addEventListener("click",dispose);
  overlay.addEventListener("click",event=>{if(event.target===overlay)dispose()});
  revealButton.addEventListener("click",()=>{
    answerBody.hidden=!answerBody.hidden;
    revealButton.textContent=answerBody.hidden?"Показать ответ":"Скрыть ответ";
  });
  document.addEventListener("keydown",onKeyDown);

  try{
    for(const item of items){
      const block=await renderItem(pack,item,urls,isActive);
      if(!isActive())break;
      content.appendChild(block);
    }
    for(const item of answerItems){
      const block=await renderItem(pack,item,urls,isActive);
      if(!isActive())break;
      answerBody.appendChild(block);
    }
  }catch(error){
    if(isActive())content.appendChild(element("div","preview-resource-error","Ошибка предпросмотра: "+error.message));
  }
  if(isActive())closeButton.focus();
  return {close:dispose};
}
