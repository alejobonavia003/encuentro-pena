import {browserSupabase} from './supabase';
import {clearSponsorBackdrop} from './sponsor-logo';

export const LOGO_BUCKET = 'pena-logos';
export type Sponsor = {id:string; name:string; logo_path:string; active:boolean; position:number};

/** Only our public bucket is used; no external tracking URLs or SVG uploads. */
export function logoUrl(path?:string|null):string|undefined {
  if(!path || !/^(participants|sponsors)\/[a-zA-Z0-9_-]+\/[a-f0-9-]+\.webp$/.test(path))return;
  const base=process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${LOGO_BUCKET}/${path}` : undefined;
}

export async function uploadLogo(file:File,folder:'participants'|'sponsors',id:string){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Elegí un logo PNG, JPG o WebP.');
  if(file.size>5*1024*1024)throw Error('El archivo original debe pesar menos de 5 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    if(bitmap.width>8000||bitmap.height>8000)throw Error('La imagen debe medir como máximo 8000 × 8000 píxeles.');
    const scale=Math.min(1,800/bitmap.width,800/bitmap.height);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('No pudimos preparar la imagen.');
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    if(folder==='sponsors')clearSponsorBackdrop(ctx);
    else {
      // White transparent artwork needs a dark backing to stay visible on a white QR.
      const sample=document.createElement('canvas');sample.width=32;sample.height=32;
      const sampleCtx=sample.getContext('2d')!;sampleCtx.drawImage(bitmap,0,0,32,32);
      const pixels=sampleCtx.getImageData(0,0,32,32).data;let sum=0,weight=0;
      for(let i=0;i<pixels.length;i+=4){const alpha=pixels[i+3]/255;sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3*alpha;weight+=alpha;}
      ctx.globalCompositeOperation='destination-over';ctx.fillStyle=weight&&sum/weight>190?'#1e241c':'#f0eadf';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';
    }
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No pudimos convertir el logo.')),'image/webp',0.9));
    if(blob.type!=='image/webp'||blob.size>1024*1024)throw Error('No pudimos reducir el logo a WebP de menos de 1 MB.');
    const path=`${folder}/${id}/${crypto.randomUUID()}.webp`;
    const {error}=await browserSupabase().storage.from(LOGO_BUCKET).upload(path,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
    if(error)throw Error('No pudimos subir el logo. Revisá tu sesión y volvé a intentar.');
    return path;
  } finally {bitmap.close();}
}

export async function loadImage(src:string):Promise<HTMLImageElement>{
  const img=new Image();img.crossOrigin='anonymous';img.src=src;await img.decode();return img;
}

export function drawContained(ctx:CanvasRenderingContext2D,img:HTMLImageElement|HTMLCanvasElement,x:number,y:number,w:number,h:number){
  const width='naturalWidth' in img?img.naturalWidth:img.width;
  const height='naturalHeight' in img?img.naturalHeight:img.height;
  const scale=Math.min(w/width,h/height);
  const iw=width*scale,ih=height*scale;
  ctx.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
}
