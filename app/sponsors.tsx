'use client';
import {useState,useRef} from 'react';
import {logoUrl,uploadLogo,type Sponsor} from '../lib/media';

export function SponsorStrip({sponsors=[]}:{sponsors?:Sponsor[]}){
  const visible=sponsors.filter(s=>s.active);
  if(!visible.length)return null;
  return <aside className="sponsors-strip" aria-label="Sponsors de la peña"><span className="eyebrow">NOS ACOMPAÑAN</span><h2>Quienes hacen nido.</h2><div className="sponsor-logos">{visible.map(s=><figure key={s.id}><img src={logoUrl(s.logo_path)} alt={s.name} width="160" height="80" loading="lazy"/><figcaption>{s.name}</figcaption></figure>)}</div></aside>;
}

type Api=(path:string,body?:unknown)=>Promise<any>;
export function SponsorManager({sponsors,onSave,busy}:{sponsors:Sponsor[];onSave:Api;busy:boolean}){
  const lock=useRef(false);
  const [editing,setEditing]=useState<Sponsor|null>(null),[file,setFile]=useState<File|null>(null),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(lock.current)return;lock.current=true;setSaving(true);setError('');
    const form=e.currentTarget,data=new FormData(form),id=editing?.id||crypto.randomUUID();
    try {
      const logo_path=file?await uploadLogo(file,'sponsors',id):editing?.logo_path;
      if(!logo_path)throw Error('Cargá el logo del sponsor.');
      await onSave('sponsor',{id,name:data.get('name'),position:Number(data.get('position')),active:data.has('active'),logo_path});
      setEditing(null);setFile(null);form.reset();
    }catch(e){setError((e as Error).message)}finally{lock.current=false;setSaving(false)}
  }
  return <div className="sponsor-manager"><section className="panel"><span className="eyebrow">PUBLICIDAD · ORGANIZACIÓN</span><h2>{editing?'Editar sponsor':'Sumar un sponsor'}</h2><p>Su logo aparece en los paneles de representantes, la compra y al pie de cada entrada.</p><form key={editing?.id||'new'} onSubmit={submit}><label className="field"><span>Nombre del sponsor</span><input name="name" required maxLength={100} defaultValue={editing?.name}/></label><label className="field"><span>Logo</span><input key={editing?.id||'file'} type="file" accept="image/png,image/jpeg,image/webp" required={!editing} onChange={e=>setFile(e.target.files?.[0]||null)}/><small>PNG, JPG o WebP. Hasta 5 MB; se optimiza al subir. Un logo por sponsor.</small></label>{editing&&<img className="logo-preview" src={logoUrl(editing.logo_path)} alt={editing.name}/>}<label className="field"><span>Orden de aparición</span><input type="number" name="position" min={0} max={999} defaultValue={editing?.position??0} required/></label><label className="check"><input name="active" type="checkbox" defaultChecked={editing?.active??true}/> Mostrar sponsor</label>{error&&<p role="alert">{error}</p>}<div className="actions"><button disabled={busy||saving}>{saving?'Guardando…':'Guardar sponsor'}</button>{editing&&<button type="button" className="secondary" disabled={saving} onClick={()=>{setEditing(null);setFile(null);setError('')}}>Cancelar edición</button>}</div></form></section><section className="panel"><h2>Sponsors cargados</h2>{sponsors.length?sponsors.map(s=><article className="sponsor-row" key={s.id}><img src={logoUrl(s.logo_path)} alt="" width="100" height="64"/><div><h3>{s.name}</h3><small>{s.active?'Visible':'Oculto'} · Orden {s.position}</small></div><button className="secondary" disabled={saving||busy} onClick={()=>{setEditing(s);setFile(null);setError('')}}>Editar</button></article>):<p>Todavía no hay sponsors. Cargá el primero para que aparezca en la peña.</p>}</section></div>;
}

export function ParticipantLogo({participant,onSave,busy}:{participant:{id:string;name:string;logo_path?:string};onSave:Api;busy:boolean}){
  const lock=useRef(false);
  const [saving,S]=useState(false),[error,E]=useState('');
  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();if(lock.current)return;lock.current=true;S(true);E('');const form=e.currentTarget,file=new FormData(form).get('logo');
    try{if(!(file instanceof File)||!file.size)throw Error('Elegí una imagen.');const logo_path=await uploadLogo(file,'participants',participant.id);await onSave('band_logo',{id:participant.id,logo_path});form.reset()}catch(e){E((e as Error).message)}finally{lock.current=false;S(false)}
  }
  return <section className="panel participant-logo-panel"><span className="step-label">PASO 1</span><h3>Cargá tu logo</h3><p>Tu identidad en la compra, en el centro de tu QR de venta y en cada entrada.</p>{participant.logo_path&&<img className="logo-preview" src={logoUrl(participant.logo_path)} alt={participant.name}/>}<form onSubmit={save}><label className="field"><span>Subir logo</span><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required/><small>PNG, JPG o WebP de hasta 5 MB.</small></label>{error&&<p role="alert">{error}</p>}<button disabled={busy||saving}>{saving?'Subiendo…':participant.logo_path?'Reemplazar logo':'Guardar logo'}</button></form></section>;
}
