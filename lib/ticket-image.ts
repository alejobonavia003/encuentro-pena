import QRCode from 'qrcode';

type Ticket = {id:string; name:string; band:string; slot:number; status:string; entered_at?:number|null};
type Event = {title:string; date?:string; time?:string; location?:string};

/** Generates a phone-friendly image. The server remains the authority for entry. */
export async function createTicketImage(ticket:Ticket,event:Event,url:string){
  if(ticket.status!=='confirmed')throw Error('La entrada todavía no está confirmada.');
  const canvas=document.createElement('canvas');
  canvas.width=1000;canvas.height=1500;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Este navegador no pudo generar la entrada.');
  const text=(value:string,x:number,y:number,size:number,color='#293b2a',weight='400')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillText(value,x,y)};
  const wrap=(value:string,y:number,size:number,width:number,max=3,color='#293b2a',weight='400')=>{
    ctx.font=`${weight} ${size}px Arial, sans-serif`;
    const lines:string[]=[];let line='';
    // Split long words as well as normal names to keep user-provided text inside the card.
    for(const char of value){if(ctx.measureText(line+char).width>width&&line){lines.push(line.trim());line=''}line+=char;}
    if(line)lines.push(line.trim());
    for(let i=0;i<Math.min(lines.length,max);i++){
      let visible=lines[i];if(i===max-1&&lines.length>max){while(ctx.measureText(visible+'…').width>width)visible=visible.slice(0,-1);visible+='…'}
      text(visible,76,y+i*(size+12),size,color,weight);
    }
    return y+Math.min(lines.length,max)*(size+12);
  };
  ctx.fillStyle='#f6f5f0';ctx.fillRect(0,0,1000,1500);
  ctx.fillStyle='#293b2a';ctx.fillRect(0,0,1000,238);
  text('encuentro',76,110,64,'#d4e69d','700');
  text('MULTIESPACIO · ENTRADA PERSONAL',80,166,21,'#f6f5f0');
  text(ticket.entered_at?'INGRESO YA REGISTRADO':'ENTRADA CONFIRMADA',76,296,23,ticket.entered_at?'#a05d39':'#637f3e','700');
  const y=wrap(event.title||'Peña de Encuentro',355,42,848,2,'#293b2a','700');
  let date='Fecha a confirmar';
  if(event.date){const d=new Date(event.date+'T12:00:00');if(!Number.isNaN(d.getTime()))date=d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Argentina/Cordoba'});}
  text(date+(event.time?' · '+event.time+' hs':''),76,y+14,22);
  wrap(event.location||'Lugar a confirmar',y+54,22,848,2);
  ctx.strokeStyle='#d7ddcc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(76,570);ctx.lineTo(924,570);ctx.stroke();
  text('ASISTENTE',76,623,18,'#7b7f74','700');
  wrap(ticket.name,671,37,848,3,'#293b2a','700');
  text('BANDA',76,846,18,'#7b7f74','700');
  wrap(ticket.band,886,30,848,2);
  text(new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(ticket.slot<=10?7000:10000),76,1003,42,'#293b2a','700');
  const qr=document.createElement('canvas');
  await QRCode.toCanvas(qr,url,{width:246,margin:2,errorCorrectionLevel:'M'});
  ctx.drawImage(qr,678,1040,246,246);
  text('CÓDIGO DE ENTRADA',76,1100,18,'#7b7f74','700');
  text(ticket.id.slice(0,8).toUpperCase(),76,1153,42,'#293b2a','700');
  text('1 persona · 1 ingreso',76,1203,22);
  text('Presentá tu nombre, banda y código en puerta.',76,1328,21);
  text('El QR permite consultar el estado actualizado.',76,1366,21);
  text('La validez y el ingreso se verifican en la lista del evento.',76,1404,20,'#7b7f74');
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));
  return {blob,filename:'Encuentro-entrada-'+ticket.id.slice(0,8).toUpperCase()+'.png'};
}

export async function downloadTicketImage(ticket:Ticket,event:Event,url:string){
  const {blob,filename}=await createTicketImage(ticket,event,url);
  const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),5000);
}
