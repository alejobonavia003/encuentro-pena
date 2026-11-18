'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Brand} from '../brand';
import {ParticipantLogo} from '../sponsors';
import {QR} from '../sale-qr';
import {saleUrl} from '../../lib/links';
import {logoUrl,uploadLogo} from '../../lib/media';
import {whatsappUrl} from '../../lib/phone';

type Entry = {
 id: string;
 name: string;
 phone: string;
 status: 'confirmed' | 'pending';
 method: 'guest' | 'cash' | 'transfer';
 amount: number;
 entered_at: number | null;
};

type Panel = {
 band: {
  id: string;
  name: string;
  capacity: number;
  representative: string;
  alias: string;
  holder: string;
  phone: string;
  logo_path: string | null;
 };
 settings: {title: string; open: number};
 tickets: Entry[];
};

async function panelRequest<T>(action: string, payload: object = {}): Promise<T> {
 // The fragment stays out of server URLs, referrers and purchase links.
 const panelKey = location.hash.slice(1);
 if (!panelKey) throw Error('Pedile a la organización el enlace a tu panel.');
 const response = await fetch('/api/' + action, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...payload, panelKey}),
 });
 const result = await response.json();
 if (!response.ok) throw Error(result.error || 'No pudimos completar la operación.');
 return result;
}

const money = new Intl.NumberFormat('es-AR', {style: 'currency', currency: 'ARS', maximumFractionDigits: 0});

export default function ParticipantPage() {
 const [panel, setPanel] = useState<Panel>();
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const [paymentMode, setPaymentMode] = useState<'edit' | 'generate' | null>(null);
 const [showSale, setShowSale] = useState(false);
 const lock = useRef(false);
 const guestRequest = useRef<{name: string; key: string} | null>(null);
 const firstNameInput = useRef<HTMLInputElement>(null);

 useEffect(() => {
  let active = true;
  panelRequest<Panel>('panel').then(
   data => { if (active) setPanel(data); },
   failure => { if (active) setError(failure.message); }
  );
  return () => { active = false; };
 }, []);

 async function act(operation: () => Promise<void>) {
  if (lock.current) return;
  lock.current = true;
  setBusy(true);
  setError('');
  setNotice('');
  try {
   await operation();
  } catch (failure) {
   setError(failure instanceof Error ? failure.message : 'Intentá de nuevo.');
  } finally {
   lock.current = false;
   setBusy(false);
  }
 }

 async function refresh() {
  setPanel(await panelRequest<Panel>('panel'));
 }

 function addGuest(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = event.currentTarget;
  const {firstName, lastName} = Object.fromEntries(new FormData(form));
  void act(async () => {
   const name = JSON.stringify([firstName, lastName]);
   const key = guestRequest.current?.name === name ? guestRequest.current.key : crypto.randomUUID();
   guestRequest.current = {name, key};
   await panelRequest('panel_guest', {firstName, lastName, requestKey: key});
   guestRequest.current = null;
   form.reset();
   setNotice('Invitado agregado a la lista de puerta.');
   await refresh();
   requestAnimationFrame(() => firstNameInput.current?.focus());
  });
 }

 function savePayment(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(event.currentTarget));
  void act(async () => {
   await panelRequest('panel_payment', fields);
   await refresh();
   setPaymentMode(null);
   if (paymentMode === 'generate') setShowSale(true);
   setNotice('Datos de cobro guardados.');
  });
 }

 function updateEntry(entry: Entry, confirm: boolean) {
  const prompt = confirm
   ? '¿Ya recibiste el pago de ' + entry.name + '? Al confirmar, podrá ingresar a la peña.'
   : '¿Querés quitar a ' + entry.name + ' y liberar su lugar?';
  if (!window.confirm(prompt)) return;
  void act(async () => {
   await panelRequest(confirm ? 'panel_confirm' : 'panel_cancel', {id: entry.id, accept: confirm});
   setNotice(confirm ? 'Pago confirmado. La entrada ya figura en puerta.' : 'Se liberó el lugar.');
   await refresh();
  });
 }

 if (!panel) return <main className="loading">
  <Brand/>
  <p role={error ? 'alert' : 'status'}>{error || 'Abriendo tu panel…'}</p>
  {error && <button onClick={() => location.reload()}>Reintentar</button>}
 </main>;

 const {band, settings, tickets} = panel;
 const pending = tickets.filter(entry => entry.status === 'pending');
 const confirmed = tickets.filter(entry => entry.status === 'confirmed');
 const available = Math.max(0, band.capacity - tickets.length);
 const saleReady = !!(band.representative && band.alias && band.holder && whatsappUrl(band.phone));
 const purchaseLink = saleUrl(location.origin, band.id);

 return <div className="public">
  <header><Brand/></header>
  {error && <div className="toast error" role="alert">{error}</div>}
  {notice && <div className="toast" role="status">{notice}</div>}
  <main className="publicmain participant-panel">
   <div>
    <p className="eyebrow">{settings.title}</p>
    <h1>{band.name}</h1>
   </div>
   <section className="panel">
    <h2>Agregar invitado a la peña</h2>
    <p>Al guardarlo, aparecerá en la lista de puerta. {available} lugares disponibles.</p>
    <form onSubmit={addGuest}>
     <div className="twocol">
      <label className="field"><span>Nombre</span><input ref={firstNameInput} name="firstName" autoComplete="off" maxLength={119} required/></label>
      <label className="field"><span>Apellido</span><input name="lastName" autoComplete="off" maxLength={119} required/></label>
     </div>
     <button disabled={busy || available === 0}>Agregar invitado</button>
    </form>
   </section>
   <ParticipantLogo participant={band} busy={busy} onLogo={async file => {
    await uploadLogo(file, 'participants', band.id, location.hash.slice(1));
    await refresh();
    setNotice('Logo guardado.');
   }}/>
   <section className="panel">
    <span className="step-label">PASO 2</span>
    <h2>Cargá tus datos bancarios</h2>
    <p>Completá el representante, alias, titular y WhatsApp para empezar a vender.</p>
    <p className="readiness">{saleReady ? '✓ Datos listos para vender' : 'Faltan datos para habilitar la venta'}</p>
    {!paymentMode && <button className={saleReady ? 'secondary' : ''} onClick={() => setPaymentMode('edit')}>
     {saleReady ? 'Editar mis datos de cobro' : 'Completar mis datos de cobro'}
    </button>}
    {paymentMode && <form onSubmit={savePayment} id="datos-de-cobro">
     <label className="field"><span>Nombre del encargado</span><input name="representative" defaultValue={band.representative} maxLength={120} required/></label>
     <label className="field"><span>Alias de transferencia</span><input name="alias" defaultValue={band.alias} maxLength={120} required/></label>
     <label className="field"><span>Titular de la cuenta</span><input name="holder" defaultValue={band.holder} maxLength={120} required/></label>
     <label className="field"><span>WhatsApp con código de área</span><input name="phone" type="tel" autoComplete="tel-national" placeholder="Ej. 358 4928722" defaultValue={band.phone} maxLength={40} required/></label>
     <button disabled={busy}>{paymentMode === 'generate' ? 'Guardar datos y ver el QR' : 'Guardar datos de cobro'}</button>
     <button type="button" className="secondary" disabled={busy} onClick={() => setPaymentMode(null)}>Cancelar</button>
    </form>}
   </section>
   <section className="panel">
    <span className="step-label">PASO 3</span>
    <h2>Generá tu enlace de venta</h2>
    <p>Compartí siempre el mismo enlace público o su QR. Tus ventas quedan asociadas a tu participante.</p>
    {!showSale && <button onClick={() => {
     if (saleReady) setShowSale(true);
     else {
      setPaymentMode('generate');
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#datos-de-cobro input')?.focus());
     }
    }}>Generar mi enlace y QR</button>}
    {showSale && <>
     {!settings.open && <p>La organización todavía tiene cerrada la venta en línea.</p>}
     <label className="field"><span>Enlace para compartir</span><input value={purchaseLink} readOnly onFocus={event => event.currentTarget.select()}/></label>
     <div className="actions">
      <button className="secondary" onClick={() => void act(async () => {
       try {
        await navigator.clipboard.writeText(purchaseLink);
        setNotice('Enlace público copiado.');
       } catch {
        throw Error('Seleccioná el enlace de compra y copialo manualmente.');
       }
      })} disabled={busy}>Copiar enlace</button>
      <a className="button secondary" href={purchaseLink} target="_blank" rel="noreferrer">Abrir página de compra</a>
     </div>
     <QR value={purchaseLink} logo={logoUrl(band.logo_path)}/>
    </>}
   </section>
   <section className="pending-highlight">
    <span className="step-label">PASO 4</span>
    <div className="sectionhead">
     <h2>{pending.length ? `${pending.length} solicitudes pendientes` : 'Sin solicitudes pendientes'}</h2>
     <button className="secondary" disabled={busy} onClick={() => void act(refresh)}>Actualizar</button>
    </div>
    <p>Cuando alguien te transfiera o te entregue el efectivo, revisá el cobro y elegí “Confirmar pago”. Su entrada aparecerá en la lista de puerta.</p>
    <p className="notice">Confirmar sin cobrar equivale a regalar la entrada y es responsabilidad del representante.</p>
    {pending.length > 0 && <ul className="participant-entries">
     {pending.map(entry => <li key={entry.id}>
      <strong>{entry.name}</strong>
      <span>{entry.method === 'cash' ? 'Efectivo' : 'Transferencia'} · {money.format(entry.amount)}</span>
      <div className="actions">
       <button disabled={busy} onClick={() => updateEntry(entry, true)}>Confirmar pago</button>
       <button className="secondary" disabled={busy} onClick={() => updateEntry(entry, false)}>Anular reserva</button>
      </div>
     </li>)}
    </ul>}
   </section>
   <div className="stats participant-stats">
    <div className="stat"><span>Confirmadas</span><strong>{confirmed.length}</strong><small>Habilitadas para ingresar</small></div>
    <div className="stat"><span>Pendientes</span><strong>{pending.length}</strong><small>Revisá los pagos recibidos</small></div>
    <div className="stat"><span>Valor confirmado</span><strong>{money.format(confirmed.reduce((total, entry) => total + entry.amount, 0))}</strong><small>100% para tu participante</small></div>
    <div className="stat"><span>Cupo</span><strong>{available}/{band.capacity}</strong><small>Entradas disponibles</small></div>
   </div>
   <section className="panel">
    <h2>Todas las entradas</h2>
    {tickets.length ? <ul className="participant-entries">
     {tickets.map(entry => {
      const guest = entry.method === 'guest';
      const ticketLink = new URL('/?ticket=' + encodeURIComponent(entry.id), location.origin).href;
      const sendEntry = entry.status === 'confirmed' && !guest && whatsappUrl(entry.phone, 'Hola ' + entry.name + ', tu entrada está confirmada. Podés verla acá: ' + ticketLink);
      return <li key={entry.id}>
       <strong>{entry.name}</strong>
       <span>{guest ? 'Invitado · En lista de puerta' : (entry.status === 'pending' ? 'Pago pendiente' : 'Pago confirmado') + ' · ' + money.format(entry.amount)}{entry.entered_at ? ' · Ya ingresó' : ''}</span>
       {guest && !entry.entered_at && <button className="secondary" disabled={busy} onClick={() => updateEntry(entry, false)}>Quitar invitado</button>}
       {sendEntry && <a className="button secondary" target="_blank" rel="noreferrer" href={sendEntry}>Enviar entrada por WhatsApp</a>}
      </li>;
     })}
    </ul> : <p>Todavía no hay invitados ni compras.</p>}
   </section>
  </main>
 </div>;
}
