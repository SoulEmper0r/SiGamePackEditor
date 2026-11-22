import {getArchiveResourceBytes} from "./resource-manager.js";
import {normalizeResourceReference} from "./pack-model.js";

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

export async function createSafeHtmlPreview(pack,{
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

export function safeExternalMediaUrl(value){
 try{const url=new URL(String(value||"").trim());return (url.protocol==="http:"||url.protocol==="https:")&&url.hostname?url.href:null}
 catch{return null}
}

export function supportedContentType(value){
 const type=String(value||"text").toLowerCase();
 return ["text","image","audio","video","html"].includes(type)?type:"unknown";
}
