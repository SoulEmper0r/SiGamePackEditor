import {normalizeResourceReference,resolvePackageLogoResource} from "./pack-model.js";

export function validatePack(pack){
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
