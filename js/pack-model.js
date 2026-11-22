export function localName(n){return n?.localName||n?.nodeName?.split(":").pop()||n?.nodeName}
export function children(n,name){return Array.from(n?.children||[]).filter(x=>!name||localName(x)===name)}
export function first(n,name){return children(n,name)[0]||null}
export function text(n){return n?.textContent||""}

function attrs(n){return Object.fromEntries(Array.from(n?.attributes||[]).map(a=>[a.name,a.value]))}

function contentItem(n){
  return {id:n.getAttribute("id")||crypto.randomUUID(),type:n.getAttribute("type")||"text",value:n.getAttribute("value")??n.textContent??"",duration:n.getAttribute("duration"),placement:n.getAttribute("placement")||"screen",waitForFinish:n.getAttribute("waitForFinish"),isRef:/^true$/i.test(n.getAttribute("isRef")||""),attributes:attrs(n),sourceNode:n}
}

function parameter(n){
  const type=n.getAttribute("type")||"simple";
  let value;
  if(type==="content") value=children(n,"item").map(contentItem);
  else if(type==="group") value=children(n,"param").map(parameter);
  else if(type==="numberSet"){
    const ns=first(n,"numberSet");
    value=ns?{minimum:ns.getAttribute("minimum"),maximum:ns.getAttribute("maximum"),step:ns.getAttribute("step"),attributes:attrs(ns),sourceNode:ns}:{minimum:null,maximum:null,step:null,attributes:{},sourceNode:null};
  } else value=text(n);
  return {id:n.getAttribute("id")||crypto.randomUUID(),name:n.getAttribute("name")||"",type,value,attributes:attrs(n),sourceNode:n};
}

function infoBlock(n){
  if(!n)return null;
  const result={
    attributes:attrs(n),
    authors:[],
    sources:[],
    comments:"",
    showmanComments:"",
    extension:"",
    sourceNode:n
  };
  for(const key of ["authors","sources"]){
    const container=first(n,key);
    if(container)result[key]=children(container).map(x=>({name:localName(x),value:text(x),attributes:attrs(x),sourceNode:x}));
  }
  for(const key of ["comments","showmanComments","extension"]){
    const node=first(n,key);
    if(node)result[key]=text(node);
  }
  return result;
}

function question(n){
  const params=first(n,"params");
  const parameters=params?children(params,"param").map(parameter):[];
  const qp=parameters.find(p=>p.name==="question");
  return {id:n.getAttribute("id")||crypto.randomUUID(),price:Number(n.getAttribute("price")||0),type:n.getAttribute("type")||"",parameters,questionContent:qp?.value||[],right:(()=>{const x=first(n,"right");return x?children(x,"answer").length?children(x,"answer").map(text):[text(x)].filter(Boolean):[]})(),wrong:(()=>{const x=first(n,"wrong");return x?children(x,"answer").length?children(x,"answer").map(text):[text(x)].filter(Boolean):[]})(),attributes:attrs(n),sourceNode:n};
}

function theme(n,ri,ti){
  const qs=first(n,"questions");
  return {id:n.getAttribute("id")||crypto.randomUUID(),name:n.getAttribute("name")||"",order:ti,info:infoBlock(first(n,"info")),questions:qs?children(qs,"question").map(question):[],attributes:attrs(n),sourceNode:n,roundIndex:ri};
}

function round(n,ri){
  const ts=first(n,"themes");
  return {id:n.getAttribute("id")||crypto.randomUUID(),name:n.getAttribute("name")||"",type:n.getAttribute("type")||"",order:ri,info:infoBlock(first(n,"info")),themes:ts?children(ts,"theme").map((x,i)=>theme(x,ri,i)):[],attributes:attrs(n),sourceNode:n};
}

export function normalizeResourceReference(value){
  let p=String(value).replaceAll("\\","/").replace(/^\/+/, "");
  try{return decodeURIComponent(p)}catch{return p}
}

export function packageLogoPathCandidates(value){
  const raw=normalizeResourceReference(value).trim();
  if(!raw)return [];
  const withoutMarker=raw.startsWith("@")?raw.slice(1):raw;
  const candidates=raw.startsWith("@")
    ?[withoutMarker,withoutMarker.toLowerCase().startsWith("images/")?withoutMarker:"Images/"+withoutMarker,raw,raw.toLowerCase().startsWith("@images/")?raw.slice(1):raw.includes("/")?raw:"Images/"+raw]
    :[raw,raw.includes("/")?raw:"Images/"+raw];
  return [...new Set(candidates.filter(Boolean))];
}

export function resolvePackageLogoResource(resources,value){
  const candidates=packageLogoPathCandidates(value);
  for(const candidate of candidates){
    const key=candidate.toLowerCase();
    const resource=(resources||[]).find(item=>item.normalizedPath.toLowerCase()===key);
    if(resource)return {resource,normalizedPath:resource.normalizedPath,candidates};
  }
  const fallback=candidates.find(path=>path.startsWith("Images/"))||candidates[0]||"";
  return {resource:null,normalizedPath:fallback,candidates};
}

export function packageLogoReferenceValue(resource){
  const path=normalizeResourceReference(resource?.normalizedPath||resource?.archivePath||"");
  if(!path)throw Error("Не удалось определить путь изображения для логотипа.");
  const prefix="Images/";
  if(path.includes("/")&&!path.toLowerCase().startsWith(prefix.toLowerCase()))throw Error("Логотип должен находиться в корне архива или в папке Images/.");
  const fileName=path.toLowerCase().startsWith(prefix.toLowerCase())?path.slice(prefix.length):path;
  if(!fileName)throw Error("Имя файла логотипа пустое.");
  return "@"+fileName;
}

function parseManifest(root){
  const node=first(root,"files");
  return {node,entries:node?children(node,"file").map(f=>({name:f.getAttribute("name")||"",normalizedPath:normalizeResourceReference(f.getAttribute("name")||""),hash:f.getAttribute("hash")||"",attributes:attrs(f),sourceNode:f})) : []};
}

export function buildPackModel(document,zipEntries){
  const root=document.documentElement,version=root.getAttribute("version")||"";
  if(version!=="5")throw Error("Первый этап поддерживает SIQ v5, обнаружена версия: "+(version||"unknown"));
  const rs=first(root,"rounds");
  const rounds=rs?children(rs,"round").map((x,i)=>round(x,i)):[];
  const resources=zipEntries.filter(e=>{const n=e.name.toLowerCase();return n!=="content.xml"&&n!=="quality.marker"}).map(e=>({id:crypto.randomUUID(),archivePath:e.rawName,normalizedPath:e.name,size:e.uncompressedSize,compressedSize:e.compressedSize,method:e.method,crc:e.crc,entry:e}));
  const rm=new Map(resources.map(r=>[r.normalizedPath.toLowerCase(),r]));
  const references=[];
  for(const r of rounds)for(const t of r.themes)for(const q of t.questions)for(const p of q.parameters)if(p.type==="content")for(const item of p.value)if(item.isRef&&item.value){
    let path=normalizeResourceReference(item.value);
    if(!path.includes("/")){
      const folder=item.type==="image"?"Images":item.type==="audio"?"Audio":item.type==="video"?"Video":item.type==="html"?"Html":"";
      if(folder)path=folder+"/"+path;
    }
    references.push({roundId:r.id,themeId:t.id,questionId:q.id,parameterName:p.name,itemId:item.id,rawValue:item.value,normalizedPath:path,resource:rm.get(path.toLowerCase())||null});
  }
  const manifest=parseManifest(root);
  const manifestByPath=new Map(manifest.entries.map(x=>[x.normalizedPath.toLowerCase(),x]));
  for(const resource of resources)resource.manifestEntry=manifestByPath.get(resource.normalizedPath.toLowerCase())||null;
  return {
    version,namespace:root.namespaceURI,
    metadata:{name:root.getAttribute("name")||"",publisher:root.getAttribute("publisher")||"",id:root.getAttribute("id")||"",restriction:root.getAttribute("restriction")||"",date:root.getAttribute("date")||"",difficulty:root.getAttribute("difficulty")||"",logo:root.getAttribute("logo")||"",language:root.getAttribute("language")||"",attributes:attrs(root)},
    tags:first(root,"tags")?children(first(root,"tags"),"tag").map(x=>({value:text(x),attributes:attrs(x),sourceNode:x})) : [],
    info:infoBlock(first(root,"info")),
    manifest,rounds,resources,references,sourceDocument:document
  };
}
