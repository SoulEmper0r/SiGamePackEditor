/* GENERATED FILE. DO NOT EDIT. Source: build-bundle.cjs + app modules. */
"use strict";
const __modules = Object.create(null);
__modules["zip.js"] = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder("utf-8");

  function u16(b,o){return b[o]|b[o+1]<<8}
  function u32(b,o){return (b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0}
  function put16(a,o,v){a[o]=v&255;a[o+1]=(v>>>8)&255}
  function put32(a,o,v){a[o]=v&255;a[o+1]=(v>>>8)&255;a[o+2]=(v>>>16)&255;a[o+3]=(v>>>24)&255}
  function concat(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
  function eocd(b){for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(b,i)===0x06054b50)return i;throw Error("ZIP: EOCD not found")}
  async function inflateRaw(b){const ds=new DecompressionStream("deflate-raw");return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(ds)).arrayBuffer())}
  async function deflateRaw(b){const cs=new CompressionStream("deflate-raw");return new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(cs)).arrayBuffer())}

  function normalizeArchivePath(name){
    let p=String(name).replaceAll("\\","/").replace(/^\/+/, "");
    try{return decodeURIComponent(p)}catch{return p}
  }

  function crc32(bytes){
    if(!crc32.table){const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[i]=c>>>0}crc32.table=t}
    let c=0xffffffff;for(const x of bytes)c=crc32.table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0
  }

  class ZipEntry{
    constructor(o){Object.assign(this,o);this._data=null}
    compressedBytes(){
      return this.source.subarray(this.dataOffset,this.dataOffset+this.compressedSize)
    }
    async bytes(){
      if(this._data)return this._data;
      const c=this.source.subarray(this.dataOffset,this.dataOffset+this.compressedSize);
      this._data=this.method===0?c.slice():this.method===8?await inflateRaw(c):null;
      if(!this._data)throw Error("ZIP: unsupported compression method "+this.method+" for "+this.rawName);
      if(this._data.length!==this.uncompressedSize)throw Error("ZIP: size mismatch for "+this.rawName);
      return this._data
    }
  }

  class ZipReader{
    constructor(bytes){this.bytes=bytes;this.entries=[];this.byName=new Map()}
    static async fromFile(file){return new ZipReader(new Uint8Array(await file.arrayBuffer())).parse()}
    parse(){
      const b=this.bytes,o=eocd(b),count=u16(b,o+10),size=u32(b,o+12),offset=u32(b,o+16);
      if(count===0xffff||size===0xffffffff||offset===0xffffffff)throw Error("ZIP64 пока не поддерживается");
      let p=offset;
      for(let i=0;i<count;i++){
        if(u32(b,p)!==0x02014b50)throw Error("ZIP: invalid central directory");
        const flags=u16(b,p+8),method=u16(b,p+10),crc=u32(b,p+16),cs=u32(b,p+20),us=u32(b,p+24),nl=u16(b,p+28),el=u16(b,p+30),cl=u16(b,p+32),lo=u32(b,p+42);
        const rawName=dec.decode(b.subarray(p+46,p+46+nl));
        const name=normalizeArchivePath(rawName);
        const ln=u16(b,lo+26),le=u16(b,lo+28);
        const entry=new ZipEntry({name,rawName,flags,method,crc,compressedSize:cs,uncompressedSize:us,dataOffset:lo+30+ln+le,source:b});
        this.entries.push(entry);this.byName.set(name.toLowerCase(),entry);p+=46+nl+el+cl
      }
      return this
    }
    get(name){return this.byName.get(normalizeArchivePath(name).toLowerCase())||null}
  }

  class ZipWriter{
    constructor(){this.entries=[];this.pathKeys=new Set()}
    add(name,data,{method=0}={}){
      const normalizedName=normalizeArchivePath(name);
      const key=normalizedName.toLowerCase();
      if(!normalizedName||this.pathKeys.has(key))throw Error("ZIP: duplicate or empty archive path: "+name);
      this.pathKeys.add(key);
      this.entries.push({name,data:data instanceof Uint8Array?data:new Uint8Array(data),method,compressed:false})
    }
    addCompressed(name,compressedData,{method=0,crc,uncompressedSize}={}){
      const normalizedName=normalizeArchivePath(name);
      const key=normalizedName.toLowerCase();
      if(!normalizedName||this.pathKeys.has(key))throw Error("ZIP: duplicate or empty archive path: "+name);
      if(![0,8].includes(method))throw Error("ZIP: unsupported preserved compression method "+method+" for "+name);
      if(!Number.isInteger(crc)||!Number.isInteger(uncompressedSize)||uncompressedSize<0)throw Error("ZIP: invalid preserved-entry metadata for "+name);
      this.pathKeys.add(key);
      this.entries.push({name,data:compressedData instanceof Uint8Array?compressedData:new Uint8Array(compressedData),method,crc:crc>>>0,uncompressedSize,compressed:true})
    }
    async build(){
      const locals=[],centrals=[];let offset=0;
      for(const e of this.entries){
        const name=enc.encode(e.name);
        let payload,method,rawSize,crc;
        if(e.compressed){
          payload=e.data;method=e.method;rawSize=e.uncompressedSize;crc=e.crc;
        }else{
          const raw=e.data;payload=raw;method=e.method;
          if(method===8&&raw.length){
            try{payload=await deflateRaw(raw)}
            catch(error){throw new Error("ZIP: deflate failed for "+e.name+" ("+raw.length+" bytes): "+error.message,{cause:error})}
          }else method=0;
          rawSize=raw.length;crc=crc32(raw);
        }
        const local=new Uint8Array(30+name.length+payload.length);
        put32(local,0,0x04034b50);put16(local,4,20);put16(local,6,0x800);put16(local,8,method);put16(local,10,0);put16(local,12,0);put32(local,14,crc);put32(local,18,payload.length);put32(local,22,rawSize);put16(local,26,name.length);local.set(name,30);local.set(payload,30+name.length);locals.push(local);
        const c=new Uint8Array(46+name.length);put32(c,0,0x02014b50);put16(c,4,20);put16(c,6,20);put16(c,8,0x800);put16(c,10,method);put16(c,12,0);put16(c,14,0);put32(c,16,crc);put32(c,20,payload.length);put32(c,24,rawSize);put16(c,28,name.length);put16(c,30,0);put16(c,32,0);put16(c,34,0);put16(c,36,0);put32(c,38,0);put32(c,42,offset);c.set(name,46);centrals.push(c);offset+=local.length
      }
      const cd=concat(centrals),eocd=new Uint8Array(22);put32(eocd,0,0x06054b50);put16(eocd,8,this.entries.length);put16(eocd,10,this.entries.length);put32(eocd,12,cd.length);put32(eocd,16,offset);
      return concat([...locals,cd,eocd])
    }
  }
  return { normalizeArchivePath, crc32, ZipEntry, ZipReader, ZipWriter };
})();
__modules["pack-model.js"] = (() => {
  function localName(n){return n?.localName||n?.nodeName?.split(":").pop()||n?.nodeName}
  function children(n,name){return Array.from(n?.children||[]).filter(x=>!name||localName(x)===name)}
  function first(n,name){return children(n,name)[0]||null}
  function text(n){return n?.textContent||""}

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

  function normalizeResourceReference(value){
    let p=String(value).replaceAll("\\","/").replace(/^\/+/, "");
    try{return decodeURIComponent(p)}catch{return p}
  }

  function packageLogoPathCandidates(value){
    const raw=normalizeResourceReference(value).trim();
    if(!raw)return [];
    const withoutMarker=raw.startsWith("@")?raw.slice(1):raw;
    const candidates=raw.startsWith("@")
      ?[withoutMarker,withoutMarker.toLowerCase().startsWith("images/")?withoutMarker:"Images/"+withoutMarker,raw,raw.toLowerCase().startsWith("@images/")?raw.slice(1):raw.includes("/")?raw:"Images/"+raw]
      :[raw,raw.includes("/")?raw:"Images/"+raw];
    return [...new Set(candidates.filter(Boolean))];
  }

  function resolvePackageLogoResource(resources,value){
    const candidates=packageLogoPathCandidates(value);
    for(const candidate of candidates){
      const key=candidate.toLowerCase();
      const resource=(resources||[]).find(item=>item.normalizedPath.toLowerCase()===key);
      if(resource)return {resource,normalizedPath:resource.normalizedPath,candidates};
    }
    const fallback=candidates.find(path=>path.startsWith("Images/"))||candidates[0]||"";
    return {resource:null,normalizedPath:fallback,candidates};
  }

  function packageLogoReferenceValue(resource){
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

  function buildPackModel(document,zipEntries){
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
  return { localName, children, first, text, normalizeResourceReference, packageLogoPathCandidates, resolvePackageLogoResource, packageLogoReferenceValue, buildPackModel };
})();
__modules["siq-reader.js"] = (() => {
  const ZipReader = __modules["zip.js"].ZipReader;
  const buildPackModel = __modules["pack-model.js"].buildPackModel;
  async function readSiq(file){
    const zip=await ZipReader.fromFile(file),entry=zip.get("content.xml");
    if(!entry)throw Error("SIQ: внутри ZIP отсутствует content.xml");
    const xml=new TextDecoder("utf-8").decode(await entry.bytes());
    const document=new DOMParser().parseFromString(xml,"application/xml");
    if(document.querySelector("parsererror"))throw Error("content.xml содержит некорректный XML");
    return {fileName:file.name,size:file.size,zip,xmlText:xml,document,model:buildPackModel(document,zip.entries)}
  }
  return { readSiq };
})();
__modules["validator.js"] = (() => {
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const resolvePackageLogoResource = __modules["pack-model.js"].resolvePackageLogoResource;
  function validatePack(pack){
    const errors=[],warnings=[],rm=new Map(pack.resources.map(r=>[r.normalizedPath.toLowerCase(),r])),usage=new Map();
    for(const ref of pack.references){
      const key=normalizeResourceReference(ref.normalizedPath||ref.rawValue).toLowerCase();
      if(!rm.has(key))errors.push("Битая ссылка: "+ref.rawValue+" (question="+ref.questionId+")");
      usage.set(key,(usage.get(key)||0)+1);
    }
    if(pack.metadata.logo){
      const logo=resolvePackageLogoResource(pack.resources,pack.metadata.logo);
      if(logo.resource){
        const logoKey=logo.resource.normalizedPath.toLowerCase();
        usage.set(logoKey,(usage.get(logoKey)||0)+1);
      }else{
        errors.push("Битая ссылка на логотип пакета: "+pack.metadata.logo);
      }
    }
    const unused=pack.resources.filter(r=>!usage.has(r.normalizedPath.toLowerCase()));
    const manifestPaths=new Map(pack.manifest.entries.map(e=>[e.normalizedPath.toLowerCase(),e]));
    const manifestOrphans=pack.manifest.entries.filter(e=>!rm.has(e.normalizedPath.toLowerCase())).map(e=>e.name);
    const manifestMissing=pack.resources.filter(r=>!manifestPaths.has(r.normalizedPath.toLowerCase())).map(r=>r.normalizedPath);
    if(manifestOrphans.length)warnings.push("Manifest содержит записи без файла: "+manifestOrphans.length);
    if(manifestMissing.length)warnings.push("Файлы есть в ZIP, но отсутствуют в manifest: "+manifestMissing.length);
    const themes=pack.rounds.reduce((s,r)=>s+r.themes.length,0);
    const questions=pack.rounds.reduce((s,r)=>s+r.themes.reduce((x,t)=>x+t.questions.length,0),0);
    return {ok:errors.length===0,errors,warnings,stats:{rounds:pack.rounds.length,themes,questions,resources:pack.resources.length,references:pack.references.length,manifestEntries:pack.manifest.entries.length,missingResources:errors.length,unusedResources:unused.length,manifestOrphans:manifestOrphans.length,manifestMissing:manifestMissing.length}};
  }
  return { validatePack };
})();
__modules["siq-writer.js"] = (() => {
  const ZipWriter = __modules["zip.js"].ZipWriter;
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const encoder=new TextEncoder();

  function serializePackDocument(document){
    return new XMLSerializer().serializeToString(document);
  }

  async function writeSiq(pack,{xmlText=null,compressionMethod=8}={}){
    const writer=new ZipWriter();
    const written=new Set();
    const deleted=new Set([...(pack.deletedResourcePaths||[])].map(path=>normalizeResourceReference(path).toLowerCase()));
    const replacementsByPath=new Map((pack.model.resources||[]).filter(resource=>resource.replacement?.data).map(resource=>[normalizeResourceReference(resource.normalizedPath).toLowerCase(),resource]));
    for(const entry of pack.zip.entries){
      if(entry.name.toLowerCase()==="content.xml")continue;
      const key=normalizeResourceReference(entry.name).toLowerCase();
      if(deleted.has(key)||replacementsByPath.has(key)||written.has(key))continue;
      writer.addCompressed(entry.rawName||entry.name,entry.compressedBytes(),{
        method:entry.method,crc:entry.crc,uncompressedSize:entry.uncompressedSize
      });
      written.add(key);
    }
    for(const resource of pack.model.resources||[]){
      if(!resource.renamedFrom||resource.extra||!resource.entry)continue;
      const sourceKey=normalizeResourceReference(resource.renamedFrom).toLowerCase();
      const targetKey=normalizeResourceReference(resource.normalizedPath).toLowerCase();
      if(!deleted.has(sourceKey)||deleted.has(targetKey)||written.has(targetKey))continue;
      if(resource.replacement?.data)writer.add(resource.archivePath||resource.normalizedPath,resource.replacement.data,{method:compressionMethod});
      else writer.addCompressed(resource.archivePath||resource.normalizedPath,resource.entry.compressedBytes(),{
        method:resource.entry.method,crc:resource.entry.crc,uncompressedSize:resource.entry.uncompressedSize
      });
      written.add(targetKey);
    }
    for(const extra of pack.extraResources||[]){
      const key=normalizeResourceReference(extra.archivePath).toLowerCase();
      if(deleted.has(key)||written.has(key))continue;
      const resource=replacementsByPath.get(key);
      writer.add(extra.archivePath,resource?.replacement?.data||extra.data,{method:compressionMethod});
      written.add(key);
    }
    for(const resource of pack.model.resources||[]){
      if(resource.extra||resource.renamedFrom||!resource.entry||!resource.replacement?.data)continue;
      const key=normalizeResourceReference(resource.normalizedPath).toLowerCase();
      if(deleted.has(key)||written.has(key))continue;
      writer.add(resource.archivePath||resource.normalizedPath,resource.replacement.data,{method:compressionMethod});
      written.add(key);
    }
    const xml=xmlText??serializePackDocument(pack.model.sourceDocument);
    writer.add("content.xml",encoder.encode(xml),{method:compressionMethod});
    return writer.build();
  }

  function createSiqBlob(bytes){return new Blob([bytes],{type:"application/octet-stream"})}

  function downloadSiq(bytes,fileName){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(createSiqBlob(bytes));
    a.download=fileName.endsWith(".siq")?fileName:fileName+".siq";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  return { serializePackDocument, writeSiq, createSiqBlob, downloadSiq };
})();
__modules["pack-commands.js"] = (() => {
  const buildPackModel = __modules["pack-model.js"].buildPackModel;
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
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

  function copyQuestion(pack,questionId,targetThemeId){
    const source=requireNode(pack,questionId,"Вопрос");
    const target=requireNode(pack,targetThemeId,"Тема");
    const questions=Array.from(target.children).find(x=>x.localName==="questions");
    if(!questions)throw Error("У целевой темы отсутствует <questions>");
    const clone=cloneWithNewIds(source);
    questions.appendChild(clone);
    rebuild(pack);
    return modelIdForNode(pack,clone,"question")||clone.getAttribute("id");
  }

  function copyTheme(pack,themeId,targetRoundId){
    const source=requireNode(pack,themeId,"Тема");
    const target=requireNode(pack,targetRoundId,"Раунд");
    const themes=Array.from(target.children).find(x=>x.localName==="themes");
    if(!themes)throw Error("У целевого раунда отсутствует <themes>");
    const clone=cloneWithNewIds(source);
    themes.appendChild(clone);
    rebuild(pack);
    return modelIdForNode(pack,clone,"theme")||clone.getAttribute("id");
  }

  function copyRound(pack,roundId){
    const source=requireNode(pack,roundId,"Раунд");
    const rounds=Array.from(pack.document.documentElement.children).find(x=>x.localName==="rounds");
    if(!rounds)throw Error("У package отсутствует <rounds>");
    const clone=cloneWithNewIds(source);
    rounds.appendChild(clone);
    rebuild(pack);
    return modelIdForNode(pack,clone,"round")||clone.getAttribute("id");
  }

  function deleteQuestion(pack,questionId){
    const node=requireNode(pack,questionId,"Вопрос");
    node.parentNode.removeChild(node);
    rebuild(pack);
  }

  function deleteTheme(pack,themeId){
    const node=requireNode(pack,themeId,"Тема");
    node.parentNode.removeChild(node);
    rebuild(pack);
  }

  function deleteRound(pack,roundId){
    const node=requireNode(pack,roundId,"Раунд");
    node.parentNode.removeChild(node);
    rebuild(pack);
  }

  function moveContentItem(pack,param,itemId,targetItemId,position="before"){
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
  return { copyQuestion, copyTheme, copyRound, deleteQuestion, deleteTheme, deleteRound, moveContentItem };
})();
__modules["quality-limits.js"] = (() => {
  const SIGAME_SIZE_LIMITS = Object.freeze({
    packageDefault: 100 * 1024 * 1024,
    packageQuality: 150 * 1024 * 1024,
    image: 1 * 1024 * 1024,
    audio: 5 * 1024 * 1024,
    video: 10 * 1024 * 1024
  });

  const IMAGE_EXTENSIONS = new Set(["png","jpg","jpeg","gif","webp","avif","bmp","svg","tif","tiff","ico"]);
  const AUDIO_EXTENSIONS = new Set(["mp3","wav","ogg","oga","opus","m4a","flac","aac","wma"]);
  const VIDEO_EXTENSIONS = new Set(["mp4","webm","avi","mov","mkv","m4v","mpg","mpeg","3gp"]);

  function normalizedPath(value){
    return String(value||"").replaceAll("\\","/").replace(/^\/+/, "").toLowerCase();
  }

  function extensionOf(path){
    const name=String(path||"").split(/[\\/]/).pop()||"";
    const match=name.match(/\.([^.]+)$/);
    return match?match[1].toLowerCase():"";
  }

  function qualityMediaType(path){
    const ext=extensionOf(path);
    if(IMAGE_EXTENSIONS.has(ext))return "image";
    if(AUDIO_EXTENSIONS.has(ext))return "audio";
    if(VIDEO_EXTENSIONS.has(ext))return "video";
    return "";
  }

  function qualityMediaLimit(path){
    const type=qualityMediaType(path);
    return type?SIGAME_SIZE_LIMITS[type]:null;
  }

  function qualityMediaTypeLabel(type){
    return ({image:"Изображение",audio:"Аудио",video:"Видео"})[type]||"Медиа";
  }

  function isQualityControlEnabled(pack){
    const marker="quality.marker";
    if([...(pack?.deletedResourcePaths||[])].some(path=>normalizedPath(path)===marker))return false;
    const inOriginal=(pack?.zip?.entries||[]).some(entry=>normalizedPath(entry.name)===marker);
    const inExtras=(pack?.extraResources||[]).some(resource=>normalizedPath(resource.archivePath)===marker);
    return inOriginal||inExtras;
  }

  function qualityPackageLimit(pack){
    return isQualityControlEnabled(pack)
      ?SIGAME_SIZE_LIMITS.packageQuality
      :SIGAME_SIZE_LIMITS.packageDefault;
  }

  function findQualityMediaViolations(pack){
    const violations=[];
    for(const resource of pack?.model?.resources||[]){
      const type=qualityMediaType(resource.normalizedPath||resource.archivePath);
      if(!type)continue;
      const size=Number(resource.size)||0;
      const limit=SIGAME_SIZE_LIMITS[type];
      if(size>limit){
        violations.push({
          resource,
          path:resource.normalizedPath||resource.archivePath||"",
          type,
          size,
          limit,
          excess:size-limit
        });
      }
    }
    return violations.sort((a,b)=>b.excess-a.excess||a.path.localeCompare(b.path,"ru",{numeric:true,sensitivity:"base"}));
  }

  function assertQualityMediaSize(pack,path,size){
    if(!isQualityControlEnabled(pack))return;
    const type=qualityMediaType(path);
    if(!type)return;
    const limit=SIGAME_SIZE_LIMITS[type];
    const actual=Number(size)||0;
    if(actual>limit){
      const actualLabel=(actual/1024/1024).toFixed(2)+" МБ";
      const limitLabel=(limit/1024/1024).toFixed(0)+" МБ";
      throw new Error(qualityMediaTypeLabel(type)+" «"+path+"» весит "+actualLabel+". При включённом контроле качества SIGame максимум — "+limitLabel+". Уменьшите файл или отключите контроль качества.");
    }
  }

  function formatSigameBytes(value){
    const bytes=Number(value)||0;
    if(bytes<1024)return bytes+" Б";
    const mb=bytes/1024/1024;
    return mb.toFixed(2)+" МБ";
  }
  return { SIGAME_SIZE_LIMITS, qualityMediaType, qualityMediaLimit, qualityMediaTypeLabel, isQualityControlEnabled, qualityPackageLimit, findQualityMediaViolations, assertQualityMediaSize, formatSigameBytes };
})();
__modules["filename-normalizer.js"] = (() => {
  const SIGAME_MAX_FILENAME_LENGTH=15;

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

  function normalizeArchiveFilename(path,{maxLength=SIGAME_MAX_FILENAME_LENGTH}={}){
   const {directory,fileName}=splitArchivePath(path);
   const {stem,extension}=splitFileName(fileName);
   const safeStem=sanitizeStem(stem);
   const maxStemLength=maxLength-codePointLength(extension);
   if(maxStemLength<1)throw Error("Расширение "+extension+" длиннее допустимого имени файла.");
   return directory+sliceCodePoints(safeStem,maxStemLength)+extension;
  }

  function planArchiveFilenameNormalization(items,{maxLength=SIGAME_MAX_FILENAME_LENGTH}={}){
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
  return { SIGAME_MAX_FILENAME_LENGTH, normalizeArchiveFilename, planArchiveFilenameNormalization };
})();
__modules["resource-manager.js"] = (() => {
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const resolvePackageLogoResource = __modules["pack-model.js"].resolvePackageLogoResource;
  const packageLogoReferenceValue = __modules["pack-model.js"].packageLogoReferenceValue;
  const crc32 = __modules["zip.js"].crc32;
  const assertQualityMediaSize = __modules["quality-limits.js"].assertQualityMediaSize;
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

  async function getArchiveResourceBytes(resource){return new Uint8Array(await resourceBytes(resource))}
  function archiveResourceReferenceValue(resource,type){return resourceReferenceValue(resource,type)}
  async function sha256ResourceBytes(bytes){return sha256Hex(bytes)}
  return { getArchiveResourceBytes, archiveResourceReferenceValue, sha256ResourceBytes, addResourceToPack, addResourceFilesToPack, renameArchiveResource, replaceArchiveResource, restoreLastResourceReplacement, setItemResource, rebuildPackReferences, objectUrlForResource, findResource };
})();
__modules["html-preview.js"] = (() => {
  const getArchiveResourceBytes = __modules["resource-manager.js"].getArchiveResourceBytes;
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const INTERNAL_ORIGIN="https://siq-preview.invalid";
  const MAX_ASSET_BYTES=8*1024*1024;
  const MAX_TOTAL_ASSET_BYTES=24*1024*1024;
  const MAX_ASSETS=100;
  const MAX_CSS_DEPTH=5;

  const MIME_TYPES={
   png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",avif:"image/avif",bmp:"image/bmp",svg:"image/svg+xml",tif:"image/tiff",tiff:"image/tiff",ico:"image/x-icon",
   mp3:"audio/mpeg",wav:"audio/wav",ogg:"audio/ogg",oga:"audio/ogg",opus:"audio/ogg",m4a:"audio/mp4",flac:"audio/flac",aac:"audio/aac",wma:"audio/x-ms-wma",
   mp4:"video/mp4",webm:"video/webm",avi:"video/x-msvideo",mov:"video/quicktime",mkv:"video/x-matroska",m4v:"video/mp4",mpg:"video/mpeg",mpeg:"video/mpeg","3gp":"video/3gpp",
   html:"text/html",htm:"text/html",css:"text/css",js:"text/javascript",mjs:"text/javascript",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",eot:"application/vnd.ms-fontobject",
   txt:"text/plain",xml:"application/xml",json:"application/json",pdf:"application/pdf"
  };

  function extensionOf(path){
   const match=String(path||"").toLowerCase().match(/\.([^.\/.]+)$/);
   return match?match[1]:"";
  }
  function mimeType(path){return MIME_TYPES[extensionOf(path)]||"application/octet-stream"}
  function decodeText(bytes){return new TextDecoder("utf-8",{fatal:false}).decode(bytes).replace(/^\uFEFF/,"")}
  function bytesToBase64(bytes){
   let binary="";
   for(let offset=0;offset<bytes.length;offset+=0x8000)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+0x8000,bytes.length)));
   return btoa(binary);
  }
  function dataUrl(bytes,path){return "data:"+mimeType(path)+";base64,"+bytesToBase64(bytes)}
  function normalizedPath(path){return normalizeResourceReference(String(path||"").replaceAll("\\","/")).replace(/^\/+/, "")}
  function resolvePackagePath(reference,basePath){
   const raw=String(reference||"").trim();
   if(!raw||raw.startsWith("#"))return null;
   if(/^data:/i.test(raw))return /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);/i.test(raw)?raw:null;
   if(/^(?:javascript|vbscript|file|blob):/i.test(raw)||raw.startsWith("//"))return null;
   try{
    const base=new URL(normalizedPath(basePath||"Html/inline.html"),INTERNAL_ORIGIN+"/");
    const resolved=new URL(raw,base);
    if(resolved.origin!==INTERNAL_ORIGIN)return null;
    return normalizedPath(decodeURIComponent(resolved.pathname))||null;
   }catch{return null}
  }
  function resourcesByPath(pack){
   const map=new Map();
   for(const resource of pack?.model?.resources||[]){
    const path=normalizedPath(resource.normalizedPath||resource.archivePath);
    if(path)map.set(path.toLowerCase(),resource);
   }
   return map;
  }
  async function resourceBytes(resource){
   if(resource?.replacement?.data)return new Uint8Array(resource.replacement.data);
   if(resource?.data instanceof Uint8Array)return new Uint8Array(resource.data);
   if(resource?.extra?.data instanceof Uint8Array)return new Uint8Array(resource.extra.data);
   if(resource?.entry?.bytes)return new Uint8Array(await getArchiveResourceBytes(resource));
   if(resource?.bytes&&typeof resource.bytes==="function")return new Uint8Array(await resource.bytes());
   return new Uint8Array(await getArchiveResourceBytes(resource));
  }
  function noticeText(stats,hasActiveCode){
   const parts=[hasActiveCode
    ?"Безопасный статический режим: JavaScript и обработчики событий отключены."
    :"Безопасный режим: HTML отображается без выполнения скриптов."];
   if(hasActiveCode)parts.push("Интерактивный игровой код не запускается в редакторе.");
   if(stats.embedded)parts.push("Подключено локальных файлов: "+stats.embedded+".");
   if(stats.missing)parts.push("Не найдено локальных зависимостей: "+stats.missing+".");
   if(stats.blocked)parts.push("Внешних/опасных ссылок заблокировано: "+stats.blocked+".");
   if(stats.limited)parts.push("Файлов пропущено из-за ограничений: "+stats.limited+".");
   return parts.join(" ");
  }
  function appendStyle(doc,css){
   const style=doc.createElement("style");style.textContent=css;(doc.head||doc.documentElement).appendChild(style);
  }
  function unwrap(node){
   const parent=node.parentNode;if(!parent)return;
   while(node.firstChild)parent.insertBefore(node.firstChild,node);
   parent.removeChild(node);
  }

  async function createSafeHtmlPreview(pack,{
   source="",
   resource=null,
   basePath="Html/inline.html",
   title="Безопасный HTML предпросмотр",
   maxAssetBytes=MAX_ASSET_BYTES,
   maxTotalAssetBytes=MAX_TOTAL_ASSET_BYTES,
   maxAssets=MAX_ASSETS
  }={}){
   const resources=resourcesByPath(pack);
   const stats={embedded:0,missing:0,blocked:0,limited:0};
   const assetCache=new Map();
   let totalBytes=0;
   let assetCount=0;

   const loadLocalAsset=async(reference,fromPath,{allowCss=false,depth=0,stack=new Set()}={})=>{
    const resolved=resolvePackagePath(reference,fromPath);
    if(!resolved){
     if(reference&&!String(reference).trim().startsWith("#")&&!/^data:image\//i.test(String(reference).trim()))stats.blocked++;
     return null;
    }
    if(resolved.startsWith("data:"))return resolved;
    const key=resolved.toLowerCase();
    if(stack.has(key)){stats.limited++;return "/* cyclic stylesheet omitted */"}
    if(assetCache.has(key))return assetCache.get(key);
    const target=resources.get(key);
    if(!target){stats.missing++;return null}
    if(assetCount>=maxAssets){stats.limited++;return null}
    let bytes;
    try{bytes=await resourceBytes(target)}catch{stats.missing++;return null}
    if(bytes.length>maxAssetBytes||totalBytes+bytes.length>maxTotalAssetBytes){
     stats.limited++;return null;
    }
    assetCount++;totalBytes+=bytes.length;stats.embedded++;
    if(allowCss&&extensionOf(resolved)==="css"){
     if(depth>=MAX_CSS_DEPTH){stats.limited++;return "/* stylesheet depth limit reached */"}
     const nextStack=new Set(stack);nextStack.add(key);
     const result=await inlineCss(decodeText(bytes),resolved,depth+1,nextStack);
     assetCache.set(key,result);
     return result;
    }
    const result=dataUrl(bytes,resolved);
    assetCache.set(key,result);
    return result;
   };

   const inlineCss=async(css,fromPath,depth=0,stack=new Set())=>{
    let output=String(css||"");
    const imports=[...output.matchAll(/@import\s+(?:url\(\s*)?(?:["']([^"']+)["']|([^\s)'";]+))\s*\)?\s*([^;]*);/gi)];
    for(const match of imports){
     const ref=match[1]||match[2]||"",media=String(match[3]||"").trim();
     const imported=await loadLocalAsset(ref,fromPath,{allowCss:true,depth,stack});
     output=output.replace(match[0],imported&&!imported.startsWith("/*")?(media?"@media "+media+"{"+imported+"}":imported):"");
    }
    const urls=[];
    let cursor=0;
    const lower=output.toLowerCase();
    while(cursor<output.length){
     const start=lower.indexOf("url(",cursor);
     if(start<0)break;
     const end=output.indexOf(")",start+4);
     if(end<0)break;
     urls.push({raw:output.slice(start,end+1),reference:output.slice(start+4,end)});
     cursor=end+1;
    }
    for(const entry of urls){
     const ref=entry.reference.trim().replace(/^["']|["']$/g,"");
     if(!ref||/^data:/i.test(ref)||ref.startsWith("#"))continue;
     const replacement=await loadLocalAsset(ref,fromPath,{depth,stack});
     output=output.replace(entry.raw,replacement?"url("+JSON.stringify(replacement)+")":"none");
    }
    return output;
   };

   let html=String(source||"");
   let sourcePath=normalizedPath(basePath||resource?.normalizedPath||"Html/inline.html");
   if(resource){
    sourcePath=normalizedPath(resource.normalizedPath||resource.archivePath||sourcePath);
    const bytes=await resourceBytes(resource);
    if(bytes.length>maxAssetBytes)throw new Error("HTML-файл превышает лимит предпросмотра 8 МБ.");
    html=decodeText(bytes);
   }
   const parser=new DOMParser();
   const doc=parser.parseFromString(html,"text/html");
   if(!doc.head){const head=doc.createElement("head");doc.documentElement.insertBefore(head,doc.body||null)}
   if(!doc.body)doc.documentElement.appendChild(doc.createElement("body"));
   const hasActiveCode=!!doc.querySelector("script")||Array.from(doc.querySelectorAll("*")).some(node=>Array.from(node.attributes||[]).some(attribute=>attribute.name.toLowerCase().startsWith("on")));

   doc.querySelectorAll("script,iframe,frame,object,embed,applet,base").forEach(node=>node.remove());
   doc.querySelectorAll("meta[http-equiv]").forEach(node=>{
    const kind=(node.getAttribute("http-equiv")||"").toLowerCase();
    if(["refresh","content-security-policy","x-content-security-policy"].includes(kind))node.remove();
   });
   doc.querySelectorAll("form").forEach(unwrap);
   doc.querySelectorAll("*").forEach(node=>{
    for(const attribute of [...node.attributes]){
     const name=attribute.name.toLowerCase(),value=attribute.value.trim();
     if(name.startsWith("on")||["srcdoc","formaction","action"].includes(name)){
      node.removeAttribute(attribute.name);continue;
     }
     if(["href","src","poster","data","xlink:href","background"].includes(name)&&/^(?:javascript|vbscript|file):/i.test(value))node.removeAttribute(attribute.name);
    }
   });

   for(const link of [...doc.querySelectorAll("link")]){
    const rel=(link.getAttribute("rel")||"").toLowerCase().split(/\s+/),href=link.getAttribute("href")||"";
    if(rel.includes("stylesheet")){
     const css=await loadLocalAsset(href,sourcePath,{allowCss:true});
     if(css&&!css.startsWith("/*"))appendStyle(doc,css);
    }
    link.remove();
   }
   for(const style of [...doc.querySelectorAll("style")]){
    const css=style.textContent||"";
    if(/@import\s|url\s*\(/i.test(css))style.textContent=await inlineCss(css,sourcePath);
   }
   for(const node of [...doc.querySelectorAll("[style]")]){
    const css=node.getAttribute("style")||"";
    if(/url\s*\(/i.test(css))node.setAttribute("style",await inlineCss(css,sourcePath));
   }

   for(const node of [...doc.querySelectorAll("*")]){
    for(const attribute of ["src","poster","data","background","xlink:href"]){
     if(!node.hasAttribute(attribute))continue;
     const raw=node.getAttribute(attribute)||"";
     const resolved=resolvePackagePath(raw,sourcePath);
     if(!resolved){
      if(raw&&!raw.startsWith("#"))stats.blocked++;
      node.removeAttribute(attribute);
      continue;
     }
     const embedded=await loadLocalAsset(raw,sourcePath);
     if(embedded)node.setAttribute(attribute,embedded);else node.removeAttribute(attribute);
    }
    if(node.hasAttribute("srcset")){node.removeAttribute("srcset");stats.blocked++}
    if(node.hasAttribute("href")){
     const href=node.getAttribute("href")||"";
     if(href.startsWith("#"))continue;
     const path=resolvePackagePath(href,sourcePath);
     if(path&&resources.has(path.toLowerCase())){
      const embedded=await loadLocalAsset(href,sourcePath);
      if(embedded)node.setAttribute("href",embedded);else node.removeAttribute("href");
     }else{node.removeAttribute("href");if(href)stats.blocked++}
    }
    if(["AUDIO","VIDEO"].includes(node.tagName)){
     node.setAttribute("controls","");node.setAttribute("preload","none");node.removeAttribute("autoplay");
    }
   }
   const csp=doc.createElement("meta");
   csp.setAttribute("http-equiv","Content-Security-Policy");
   csp.setAttribute("content","default-src 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline' data:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'");
   doc.head.insertBefore(csp,doc.head.firstChild);

   const frame=document.createElement("iframe");
   frame.className="safe-html-frame";
   frame.setAttribute("sandbox","");
   frame.setAttribute("referrerpolicy","no-referrer");
   frame.title=title;frame.setAttribute("loading","lazy");
   frame.srcdoc="<!doctype html>\n"+doc.documentElement.outerHTML;
   const notice=document.createElement("div");
   notice.className="safe-html-notice";
   notice.textContent=noticeText(stats,hasActiveCode);
   const container=document.createElement("div");
   container.className="safe-html-preview";
   container.append(notice,frame);
   return {container,frame,notice,stats,hasActiveCode};
  }

  function safeExternalMediaUrl(value){
   try{const url=new URL(String(value||"").trim());return (url.protocol==="http:"||url.protocol==="https:")&&url.hostname?url.href:null}
   catch{return null}
  }

  function supportedContentType(value){
   const type=String(value||"text").toLowerCase();
   return ["text","image","audio","video","html"].includes(type)?type:"unknown";
  }
  return { createSafeHtmlPreview, safeExternalMediaUrl, supportedContentType };
})();
__modules["cross-pack-copy.js"] = (() => {
  const buildPackModel = __modules["pack-model.js"].buildPackModel;
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const localName = __modules["pack-model.js"].localName;
  const first = __modules["pack-model.js"].first;
  const getArchiveResourceBytes = __modules["resource-manager.js"].getArchiveResourceBytes;
  const archiveResourceReferenceValue = __modules["resource-manager.js"].archiveResourceReferenceValue;
  const findResource = __modules["resource-manager.js"].findResource;
  const rebuildPackReferences = __modules["resource-manager.js"].rebuildPackReferences;
  const sha256ResourceBytes = __modules["resource-manager.js"].sha256ResourceBytes;
  const crc32 = __modules["zip.js"].crc32;
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
  async function copyPackEntityAcross(source,target,{kind,sourceId,targetId=null,selectedThemeIds=null}={}){
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
  async function mergePacksIntoTarget(target,sources,selections=null){
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
  return { copyPackEntityAcross, mergePacksIntoTarget };
})();
__modules["package-explorer.js"] = (() => {
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
  const resolvePackageLogoResource = __modules["pack-model.js"].resolvePackageLogoResource;
  const ZipWriter = __modules["zip.js"].ZipWriter;
  const createSafeHtmlPreview = __modules["html-preview.js"].createSafeHtmlPreview;
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

  function buildArchiveInventory(pack){
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

  async function renderArchivePreview(item,host,pack=null){
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

  async function downloadArchiveEntry(item){
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

  async function buildArchiveSelectionZip(items){
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

  async function downloadArchiveEntries(items,{fileName="si-game-resources.zip"}={}){
   const archive=await buildArchiveSelectionZip(items);
   const url=URL.createObjectURL(new Blob([archive.bytes],{type:"application/zip"}));
   const anchor=document.createElement("a");
   anchor.href=url;
   anchor.download=fileName.endsWith(".zip")?fileName:fileName+".zip";
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
   return {count:archive.count,size:archive.bytes.length,fileName:anchor.download};
  }

  function canAssignArchiveItem(item,targetItem){
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

  function deleteArchiveResource(pack,item){
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

  function deleteUnusedArchiveResources(pack,items){
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

  function restoreLastDeletedArchiveResource(pack){
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
  return { buildArchiveInventory, renderArchivePreview, downloadArchiveEntry, buildArchiveSelectionZip, downloadArchiveEntries, canAssignArchiveItem, deleteArchiveResource, deleteUnusedArchiveResources, restoreLastDeletedArchiveResource };
})();
__modules["question-types.js"] = (() => {
  const QUESTION_TYPES = [
    {
      value: "simple",
      label: "Обычный вопрос с кнопкой",
      description: "Все игроки могут нажать кнопку и ответить. Первый нажавший получает право ответа."
    },
    {
      value: "forAll",
      label: "Вопрос для всех (совместимость с V2)",
      description: "Старое значение типа, которое реально используется в тестовом V2. Сохраняем код forAll без автоматической замены на simple."
    },
    {
      value: "stake",
      label: "Вопрос со ставкой (аукцион)",
      description: "Игроки делают ставки; вопрос разыгрывает участник с наибольшей ставкой."
    },
    {
      value: "stakeAll",
      label: "Вопрос для всех со ставкой",
      description: "Все игроки делают скрытые ставки и отвечают на вопрос."
    },
    {
      value: "secret",
      label: "Кот в мешке",
      description: "Получивший вопрос игрок передаёт его другому игроку или оставляет себе."
    },
    {
      value: "secretPublicPrice",
      label: "Кот в мешке с открытой темой и ценой",
      description: "Тема и стоимость известны до передачи вопроса выбранному игроку."
    },
    {
      value: "secretNoQuestion",
      label: "Кот в мешке без вопроса",
      description: "Вопроса нет: выбранный игрок получает указанное количество баллов."
    },
    {
      value: "noRisk",
      label: "Вопрос без риска (старый тип)",
      description: "Совместимость со старым типом SIQ. В новых версиях игры режим без риска может настраиваться отдельно."
    }
  ];

  const QUESTION_TYPE_BY_VALUE = new Map(QUESTION_TYPES.map(item => [item.value, item]));

  function getQuestionTypeOptions(currentValue) {
    const options = QUESTION_TYPES.map(item => ({...item}));
    const value = String(currentValue ?? "");
    if (!value) {
      options.unshift({
        value: "",
        label: "Тип не задан",
        description: "У вопроса не указан тип. Выберите подходящий вариант."
      });
    }
    if (value && !QUESTION_TYPE_BY_VALUE.has(value)) {
      options.unshift({
        value,
        label: "Неизвестный тип: " + value,
        description: "Неизвестный или пользовательский код. Он будет сохранён без изменений, пока не выбран другой тип."
      });
    }
    return options;
  }

  function getQuestionTypeDescription(value) {
    const item = QUESTION_TYPE_BY_VALUE.get(String(value ?? ""));
    if (item) return item.description;
    if (value) return "Неизвестный или пользовательский код. Он сохраняется без изменений.";
    return "Выберите тип игрового вопроса.";
  }
  return { getQuestionTypeOptions, getQuestionTypeDescription };
})();
__modules["round-types.js"] = (() => {
  const ROUND_TYPES = [
    {
      value: "final",
      label: "Финальный раунд",
      description: "Финальный раунд пакета. Сохраняется в XML как type=\"final\"."
    }
  ];

  const ROUND_TYPE_BY_VALUE = new Map(ROUND_TYPES.map(item => [item.value, item]));

  function getRoundTypeOptions(currentValue) {
    const options = ROUND_TYPES.map(item => ({...item}));
    const value = String(currentValue ?? "");
    if (!value) {
      options.unshift({
        value: "",
        label: "Обычный раунд (тип не задан)",
        description: "У обычного раунда атрибут type может отсутствовать в SIQ."
      });
    }
    if (value && !ROUND_TYPE_BY_VALUE.has(value)) {
      options.unshift({
        value,
        label: "Неизвестный тип: " + value,
        description: "Пользовательское или неизвестное значение. Оно сохраняется без изменений, пока не выбран другой тип."
      });
    }
    return options;
  }

  function getRoundTypeDescription(value) {
    const item = ROUND_TYPE_BY_VALUE.get(String(value ?? ""));
    if (item) return item.description;
    if (value) return "Неизвестное или пользовательское значение. Оно сохраняется без изменений.";
    return "Обычный раунд: атрибут type в XML не требуется.";
  }
  return { getRoundTypeOptions, getRoundTypeDescription };
})();
__modules["question-preview.js"] = (() => {
  const findResource = __modules["resource-manager.js"].findResource;
  const objectUrlForResource = __modules["resource-manager.js"].objectUrlForResource;
  const createSafeHtmlPreview = __modules["html-preview.js"].createSafeHtmlPreview;
  const safeExternalMediaUrl = __modules["html-preview.js"].safeExternalMediaUrl;
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

  async function openQuestionPreview(pack,question){
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
  return { openQuestionPreview };
})();
__modules["session-history.js"] = (() => {
  const buildPackModel = __modules["pack-model.js"].buildPackModel;
  const normalizeResourceReference = __modules["pack-model.js"].normalizeResourceReference;
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
  function capturePackSnapshot(pack){
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
  function restorePackSnapshot(pack,snapshot){
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

  class UndoRedoHistory{
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
  return { capturePackSnapshot, restorePackSnapshot, UndoRedoHistory };
})();
__modules["app.js"] = (() => {
  const readSiq = __modules["siq-reader.js"].readSiq;
  const validatePack = __modules["validator.js"].validatePack;
  const writeSiq = __modules["siq-writer.js"].writeSiq;
  const downloadSiq = __modules["siq-writer.js"].downloadSiq;
  const copyRound = __modules["pack-commands.js"].copyRound;
  const copyTheme = __modules["pack-commands.js"].copyTheme;
  const copyQuestion = __modules["pack-commands.js"].copyQuestion;
  const deleteRound = __modules["pack-commands.js"].deleteRound;
  const deleteTheme = __modules["pack-commands.js"].deleteTheme;
  const deleteQuestion = __modules["pack-commands.js"].deleteQuestion;
  const moveContentItem = __modules["pack-commands.js"].moveContentItem;
  const copyPackEntityAcross = __modules["cross-pack-copy.js"].copyPackEntityAcross;
  const mergePacksIntoTarget = __modules["cross-pack-copy.js"].mergePacksIntoTarget;
  const addResourceToPack = __modules["resource-manager.js"].addResourceToPack;
  const addResourceFilesToPack = __modules["resource-manager.js"].addResourceFilesToPack;
  const renameArchiveResource = __modules["resource-manager.js"].renameArchiveResource;
  const replaceArchiveResource = __modules["resource-manager.js"].replaceArchiveResource;
  const restoreLastResourceReplacement = __modules["resource-manager.js"].restoreLastResourceReplacement;
  const setItemResource = __modules["resource-manager.js"].setItemResource;
  const rebuildPackReferences = __modules["resource-manager.js"].rebuildPackReferences;
  const objectUrlForResource = __modules["resource-manager.js"].objectUrlForResource;
  const findResource = __modules["resource-manager.js"].findResource;
  const buildArchiveInventory = __modules["package-explorer.js"].buildArchiveInventory;
  const renderArchivePreview = __modules["package-explorer.js"].renderArchivePreview;
  const downloadArchiveEntry = __modules["package-explorer.js"].downloadArchiveEntry;
  const downloadArchiveEntries = __modules["package-explorer.js"].downloadArchiveEntries;
  const canAssignArchiveItem = __modules["package-explorer.js"].canAssignArchiveItem;
  const deleteArchiveResource = __modules["package-explorer.js"].deleteArchiveResource;
  const deleteUnusedArchiveResources = __modules["package-explorer.js"].deleteUnusedArchiveResources;
  const restoreLastDeletedArchiveResource = __modules["package-explorer.js"].restoreLastDeletedArchiveResource;
  const packageLogoReferenceValue = __modules["pack-model.js"].packageLogoReferenceValue;
  const openQuestionPreview = __modules["question-preview.js"].openQuestionPreview;
  const createSafeHtmlPreview = __modules["html-preview.js"].createSafeHtmlPreview;
  const safeExternalMediaUrl = __modules["html-preview.js"].safeExternalMediaUrl;
  const getQuestionTypeOptions = __modules["question-types.js"].getQuestionTypeOptions;
  const getQuestionTypeDescription = __modules["question-types.js"].getQuestionTypeDescription;
  const getRoundTypeOptions = __modules["round-types.js"].getRoundTypeOptions;
  const getRoundTypeDescription = __modules["round-types.js"].getRoundTypeDescription;
  const isQualityControlEnabled = __modules["quality-limits.js"].isQualityControlEnabled;
  const qualityPackageLimit = __modules["quality-limits.js"].qualityPackageLimit;
  const findQualityMediaViolations = __modules["quality-limits.js"].findQualityMediaViolations;
  const formatSigameBytes = __modules["quality-limits.js"].formatSigameBytes;
  const qualityMediaTypeLabel = __modules["quality-limits.js"].qualityMediaTypeLabel;
  const SIGAME_MAX_FILENAME_LENGTH = __modules["filename-normalizer.js"].SIGAME_MAX_FILENAME_LENGTH;
  const planArchiveFilenameNormalization = __modules["filename-normalizer.js"].planArchiveFilenameNormalization;
  const UndoRedoHistory = __modules["session-history.js"].UndoRedoHistory;
  const ZipWriter = __modules["zip.js"].ZipWriter;
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
  return {};
})();
__modules["app.js"];
