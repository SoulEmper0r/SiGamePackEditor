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

export function normalizeArchivePath(name){
  let p=String(name).replaceAll("\\","/").replace(/^\/+/, "");
  try{return decodeURIComponent(p)}catch{return p}
}

export function crc32(bytes){
  if(!crc32.table){const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[i]=c>>>0}crc32.table=t}
  let c=0xffffffff;for(const x of bytes)c=crc32.table[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0
}

export class ZipEntry{
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

export class ZipReader{
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

export class ZipWriter{
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
