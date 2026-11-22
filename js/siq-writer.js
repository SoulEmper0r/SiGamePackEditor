import {ZipWriter} from "./zip.js";
import {normalizeResourceReference} from "./pack-model.js";

const encoder=new TextEncoder();

export function serializePackDocument(document){
  return new XMLSerializer().serializeToString(document);
}

export async function writeSiq(pack,{xmlText=null,compressionMethod=8}={}){
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

export function createSiqBlob(bytes){return new Blob([bytes],{type:"application/octet-stream"})}

export function downloadSiq(bytes,fileName){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(createSiqBlob(bytes));
  a.download=fileName.endsWith(".siq")?fileName:fileName+".siq";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
