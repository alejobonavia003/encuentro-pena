import QRCode from 'qrcode';
import {drawContained,loadImage} from './media';

/** Four quiet modules, high correction, central mark limited to 17% of the QR. */
export async function saleQrImage(url:string,logo?:string){
  const canvas=document.createElement('canvas');
  await QRCode.toCanvas(canvas,url,{width:1000,margin:4,errorCorrectionLevel:'H',color:{dark:'#111111',light:'#ffffff'}});
  if(logo){
    try {
      const image=await loadImage(logo),ctx=canvas.getContext('2d')!;
      const size=canvas.width*.17,x=(canvas.width-size)/2;
      ctx.fillStyle='#ffffff';ctx.fillRect(x-8,x-8,size+16,size+16);
      drawContained(ctx,image,x+4,x+4,size-8,size-8);
    } catch { /* A failed optional logo must not prevent downloading a usable QR. */ }
  }
  return canvas.toDataURL('image/png');
}
