export const SIGAME_SIZE_LIMITS = Object.freeze({
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

export function qualityMediaType(path){
  const ext=extensionOf(path);
  if(IMAGE_EXTENSIONS.has(ext))return "image";
  if(AUDIO_EXTENSIONS.has(ext))return "audio";
  if(VIDEO_EXTENSIONS.has(ext))return "video";
  return "";
}

export function qualityMediaLimit(path){
  const type=qualityMediaType(path);
  return type?SIGAME_SIZE_LIMITS[type]:null;
}

export function qualityMediaTypeLabel(type){
  return ({image:"Изображение",audio:"Аудио",video:"Видео"})[type]||"Медиа";
}

export function isQualityControlEnabled(pack){
  const marker="quality.marker";
  if([...(pack?.deletedResourcePaths||[])].some(path=>normalizedPath(path)===marker))return false;
  const inOriginal=(pack?.zip?.entries||[]).some(entry=>normalizedPath(entry.name)===marker);
  const inExtras=(pack?.extraResources||[]).some(resource=>normalizedPath(resource.archivePath)===marker);
  return inOriginal||inExtras;
}

export function qualityPackageLimit(pack){
  return isQualityControlEnabled(pack)
    ?SIGAME_SIZE_LIMITS.packageQuality
    :SIGAME_SIZE_LIMITS.packageDefault;
}

export function findQualityMediaViolations(pack){
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

export function assertQualityMediaSize(pack,path,size){
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

export function formatSigameBytes(value){
  const bytes=Number(value)||0;
  if(bytes<1024)return bytes+" Б";
  const mb=bytes/1024/1024;
  return mb.toFixed(2)+" МБ";
}
