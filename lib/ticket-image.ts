import QRCode from 'qrcode';
import {drawContained,loadImage,logoUrl,type Sponsor} from './media';

type Ticket = {id:string; name:string; band:string; band_logo_path?:string|null; slot:number; amount?:number; is_general?:boolean; status:string; entered_at?:number|null};
type Event = {title:string; date?:string; time?:string; location?:string};

/** QR only consults state. Downloading never confirms payment or registers entry. */
export async function createTicketImage(ticket:Ticket,event:Event,url:string,sponsors:Sponsor[]=[]){
  if(ticket.status!=='confirmed')throw Error('La entrada todavía no está confirmada.');
  const visible=sponsors.filter(s=>s.active),rows=Math.ceil(visible.length/3);
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1950+(rows?100+rows*185:0);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Este navegador no pudo generar la entrada.');
  await document.fonts.load('700 96px "Amatic SC"').catch(()=>{});
  const text=(v:string,x:number,y:number,size:number,color='#f2e8d7',weight='400',font='Arial')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px "${font}", sans-serif`;ctx.fillText(v,x,y)};
  const wrap=(value:string,x:number,y:number,size:number,width:number,max=3,color='#f2e8d7',weight='400')=>{
    let lines:string[]=[];
    do{
      ctx.font=`${weight} ${size}px Arial`;lines=[];let line='';
      for(const word of value.trim().split(/\s+/)){
        const next=line?line+' '+word:word;
        if(ctx.measureText(next).width<=width){line=next;continue}
        if(line){lines.push(line);line=''}
        for(const char of word){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=''}line+=char}
      }
      if(line)lines.push(line);
      if(lines.length<=max||size<=12)break;size--;
    }while(true);
    lines.slice(0,max).forEach((l,i)=>text(l,x,y+i*(size+12),size,color,weight));
    return y+Math.min(lines.length,max)*(size+12);
  };
  async function logo(src:string|undefined,x:number,y:number,w:number,h:number){if(!src)return false;try{drawContained(ctx!,await loadImage(src),x,y,w,h);return true}catch{return false}}
  ctx.fillStyle='#131611';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#1e241c';ctx.fillRect(32,32,936,canvas.height-64);
  ctx.strokeStyle='#9a7857';ctx.lineWidth=2;ctx.strokeRect(52,52,896,canvas.height-104);
  await logo('/brand/la-pena.webp',76,75,350,120);
  text('BY',480,120,18,'#bf9773','700');
  await logo('/brand/encuentro-blanco.webp',535,80,350,70);
  text('JUNTO A EL ALBORADA',480,195,18,'#d7c9b7');await logo('/brand/el-alborada.webp',790,160,95,95);
  // Organic crossed lines echo the edition's nest motif without reducing QR contrast.
  wrap(event.title,76,290,48,848,2,'#f2e8d7','700');
  await logo('/brand/el-anidal.svg',76,337,848,63);
  text('LA PEÑA BY ENCUENTRO × EL ALBORADA',76,420,23,'#bf9773','700');
  let date='Fecha a confirmar';if(event.date){const d=new Date(event.date+'T12:00:00');if(!Number.isNaN(d.getTime()))date=d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Argentina/Cordoba'})}
  text(date+(event.time?' · '+event.time+' hs':''),76,470,24);
  wrap(event.location||'Lugar a confirmar',76,515,24,848,2);
  text(ticket.entered_at?'INGRESO YA REGISTRADO':'ENTRADA CONFIRMADA',76,640,25,ticket.entered_at?'#e5ae91':'#c5dcac','700');
  text('ASISTENTE',76,714,19,'#bf9773','700');wrap(ticket.name,76,769,38,848,3,'#f2e8d7','700');
  text(ticket.is_general?'ESTÁS APOYANDO AL EVENTO':'ESTÁS APOYANDO A',76,1000,19,'#bf9773','700');
  const hasLogo=await logo(logoUrl(ticket.band_logo_path),76,1030,185,160);
  wrap(ticket.band,hasLogo?300:76,1085,34,hasLogo?624:848,3);
  text(new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(ticket.amount??(ticket.slot<=10?7000:10000)),76,1300,48,'#f2e8d7','700');
  const qr=document.createElement('canvas');await QRCode.toCanvas(qr,url,{width:320,margin:4,errorCorrectionLevel:'H'});ctx.drawImage(qr,604,1350,320,320);
  text('CÓDIGO DE ENTRADA',76,1400,19,'#bf9773','700');text(ticket.id.slice(0,8).toUpperCase(),76,1460,43,'#f2e8d7','700');text('1 persona · 1 ingreso',76,1520,25);
  text('Presentá tu nombre, participante y código en puerta.',76,1750,24);
  text('El QR consulta el estado actualizado de tu entrada.',76,1795,24);
  text('La validez y el ingreso se verifican en la lista del evento.',76,1840,22,'#bcb4a6');
  if(rows){text('NOS ACOMPAÑAN',76,1960,21,'#bf9773','700');
    for(let i=0;i<visible.length;i++){
      const s=visible[i],x=76+(i%3)*286,y=1990+Math.floor(i/3)*185;
      ctx.fillStyle='#f3eee5';ctx.fillRect(x,y,264,120);
      await logo(logoUrl(s.logo_path),x+14,y+14,236,92);
      wrap(s.name,x,y+147,19,264,2,'#d7c9b7');
    }
  }
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));
  return {blob,filename:'El-Anidal-entrada-'+ticket.id.slice(0,8).toUpperCase()+'.png'};
}

export async function downloadTicketImage(ticket:Ticket,event:Event,url:string,sponsors:Sponsor[]=[]){
  const {blob,filename}=await createTicketImage(ticket,event,url,sponsors),objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),5000);
}
