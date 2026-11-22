import {ZipReader} from "./zip.js";
import {buildPackModel} from "./pack-model.js";

export async function readSiq(file){
  const zip=await ZipReader.fromFile(file),entry=zip.get("content.xml");
  if(!entry)throw Error("SIQ: внутри ZIP отсутствует content.xml");
  const xml=new TextDecoder("utf-8").decode(await entry.bytes());
  const document=new DOMParser().parseFromString(xml,"application/xml");
  if(document.querySelector("parsererror"))throw Error("content.xml содержит некорректный XML");
  return {fileName:file.name,size:file.size,zip,xmlText:xml,document,model:buildPackModel(document,zip.entries)}
}
