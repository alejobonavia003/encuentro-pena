// Remove only light or legacy backdrops connected to the outside of the image.
export function clearSponsorBackdrop(ctx:CanvasRenderingContext2D):boolean {
  const {width,height}=ctx.canvas;
  const image=ctx.getImageData(0,0,width,height);
  const {data}=image;
  const last=width*height-1;
  const corners=[0,width-1,last-width+1,last];
  const colors=corners.map(pixel=>data.slice(pixel*4,pixel*4+4));
  const distance=(i:number,color:ArrayLike<number>)=>Math.max(
    Math.abs(data[i]-color[0]),Math.abs(data[i+1]-color[1]),Math.abs(data[i+2]-color[2]),
  );
  const backdrop=colors.find(color=>{
    const [r,g,b,a]=color;
    const light=r>=218&&g>=218&&b>=210&&Math.max(r,g,b)-Math.min(r,g,b)<=28;
    const legacyDark=Math.max(Math.abs(r-30),Math.abs(g-36),Math.abs(b-28))<=8;
    return a===255&&(light||legacyDark)&&corners.every(pixel=>data[pixel*4+3]===255&&distance(pixel*4,color)<=14);
  });
  if(!backdrop)return false;

  const queue=new Uint32Array(width*height);
  let count=0;
  function visit(pixel:number){
    const i=pixel*4;
    if(data[i+3]!==255||distance(i,backdrop!)>24)return;
    data[i+3]=0;
    queue[count++]=pixel;
  }
  for(let x=0;x<width;x++){visit(x);visit(last-width+1+x);}
  for(let y=1;y<height-1;y++){visit(y*width);visit((y+1)*width-1);}
  for(let i=0;i<count;i++){
    const pixel=queue[i],x=pixel%width;
    if(x>0)visit(pixel-1);
    if(x<width-1)visit(pixel+1);
    if(pixel>=width)visit(pixel-width);
    if(pixel<=last-width)visit(pixel+width);
  }
  if(count===width*height)return false;
  ctx.putImageData(image,0,0);
  return true;
}

export function transparentSponsorLogo(img:HTMLImageElement):HTMLImageElement|HTMLCanvasElement {
  const canvas=document.createElement('canvas');
  canvas.width=img.naturalWidth;
  canvas.height=img.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)return img;
  ctx.drawImage(img,0,0);
  return clearSponsorBackdrop(ctx)?canvas:img;
}
