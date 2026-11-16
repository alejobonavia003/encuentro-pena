import QRCode from 'qrcode';

type Ticket = {id:string; name:string; band:string; slot:number; status:string; entered_at?:number|null};
type Event = {title:string; date?:string; time?:string; location?:string};

/** Generates a phone-friendly image. The server remains the authority for entry. */
export async function createTicketImage(ticket:Ticket,event:Event,url:string){
  if(ticket.status!=='confirmed')throw Error('La entrada todavía no está confirmada.');
  const canvas=document.createElement('canvas');
  canvas.width=1000;canvas.height=1700;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Este navegador no pudo generar la entrada.');
  const text=(value:string,x:number,y:number,size:number,color='#171614',weight='400')=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillText(value,x,y)};
  const wrap=(value:string,y:number,size:number,width:number,max=3,color='#171614',weight='400')=>{
    let lines:string[]=[];
    // Reduce the font, never stretch letters or truncate attendee/participant names.
    do {
      ctx.font=`${weight} ${size}px Arial, sans-serif`;lines=[];let line='';
      for(const word of value.trim().split(/\s+/)){
        const next=line?line+' '+word:word;
        if(ctx.measureText(next).width<=width){line=next;continue}
        if(line){lines.push(line);line=''}
        // Only split individual words that exceed the whole available width.
        for(const char of word){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line=''}line+=char}
      }
      if(line)lines.push(line);
      if(lines.length<=max||size<=16)break;
      size--;
    } while(true);
    for(let i=0;i<Math.min(lines.length,max);i++){
      let visible=lines[i];if(i===max-1&&lines.length>max){while(ctx.measureText(visible+'…').width>width)visible=visible.slice(0,-1);visible+='…'}
      text(visible,76,y+i*(size+12),size,color,weight);
    }
    return y+Math.min(lines.length,max)*(size+12);
  };
  ctx.fillStyle='#f6f5f0';ctx.fillRect(0,0,1000,1700);
  ctx.fillStyle='#171614';ctx.fillRect(0,0,1000,238);
  const logo=new Image();logo.src='/brand/encuentro-horizontal.webp';await logo.decode();
  const logoWidth=848,logoHeight=logoWidth*logo.naturalHeight/logo.naturalWidth;
  ctx.drawImage(logo,76,24,logoWidth,logoHeight);
  text('MULTIESPACIO · ENTRADA PERSONAL',80,214,21,'#f6f5f0');
  text(ticket.entered_at?'INGRESO YA REGISTRADO':'ENTRADA CONFIRMADA',76,296,23,ticket.entered_at?'#a05d39':'#637f3e','700');
  const y=wrap(event.title||'Peña de Encuentro',355,42,848,2,'#171614','700');
  let date='Fecha a confirmar';
  if(event.date){const d=new Date(event.date+'T12:00:00');if(!Number.isNaN(d.getTime()))date=d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',timeZone:'America/Argentina/Cordoba'});}
  text(date+(event.time?' · '+event.time+' hs':''),76,y+14,22);
  wrap(event.location||'Lugar a confirmar',y+54,22,848,2);
  ctx.strokeStyle='#d7ddcc';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(76,630);ctx.lineTo(924,630);ctx.stroke();
  text('ASISTENTE',76,680,18,'#625e55','700');
  wrap(ticket.name,730,37,848,3,'#171614','700');
  text('ESTÁS APOYANDO A',76,930,18,'#625e55','700');
  wrap(ticket.band,980,30,848,3);
  text(new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(ticket.slot<=10?7000:10000),76,1140,42,'#171614','700');
  const qr=document.createElement('canvas');
  await QRCode.toCanvas(qr,url,{width:246,margin:2,errorCorrectionLevel:'M'});
  ctx.drawImage(qr,678,1180,246,246);
  text('CÓDIGO DE ENTRADA',76,1240,18,'#625e55','700');
  text(ticket.id.slice(0,8).toUpperCase(),76,1293,42,'#171614','700');
  text('1 persona · 1 ingreso',76,1343,22);
  text('Presentá tu nombre, participante y código en puerta.',76,1530,21);
  text('El QR permite consultar el estado actualizado.',76,1570,21);
  text('La validez y el ingreso se verifican en la lista del evento.',76,1610,20,'#625e55');
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('No se pudo generar la imagen.')),'image/png'));
  return {blob,filename:'Encuentro-entrada-'+ticket.id.slice(0,8).toUpperCase()+'.png'};
}

export async function downloadTicketImage(ticket:Ticket,event:Event,url:string){
  const {blob,filename}=await createTicketImage(ticket,event,url);
  const objectUrl=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=objectUrl;link.download=filename;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),5000);
}
