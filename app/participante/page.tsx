'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {Brand} from '../brand';
import {QR} from '../sale-qr';
import {saleUrl} from '../../lib/links';
import {logoUrl} from '../../lib/media';
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
 const [showPayment, setShowPayment] = useState(false);
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
   setShowPayment(false);
   setShowSale(true);
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
   <section className="panel">
    <h2>Enlace público de compra</h2>
    <p>Compartí el enlace o el QR para que puedan reservar y pagar su entrada.</p>
    {!showPayment && !showSale && <button onClick={() => saleReady ? setShowSale(true) : setShowPayment(true)}>
     {saleReady ? 'Ver enlace y QR' : 'Generar enlace y QR'}
    </button>}
    {showPayment && <form onSubmit={savePayment}>
     <h3>Datos de cobro</h3>
     <label className="field"><span>Nombre del encargado</span><input name="representative" defaultValue={band.representative} maxLength={120} required/></label>
     <label className="field"><span>Alias de transferencia</span><input name="alias" defaultValue={band.alias} maxLength={120} required/></label>
     <label className="field"><span>Titular de la cuenta</span><input name="holder" defaultValue={band.holder} maxLength={120} required/></label>
     <label className="field"><span>WhatsApp con código de área</span><input name="phone" type="tel" autoComplete="tel-national" placeholder="Ej. 358 4928722" defaultValue={band.phone} maxLength={40} required/></label>
     <button disabled={busy}>Guardar datos y ver el QR</button>
    </form>}
    {showSale && !showPayment && <>
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
      <button className="secondary" onClick={() => setShowPayment(true)}>Editar datos de cobro</button>
     </div>
     <QR value={purchaseLink} logo={logoUrl(band.logo_path)}/>
    </>}
   </section>
   <section className="panel">
    <div className="sectionhead">
     <h2>Invitados y compras</h2>
     <button className="secondary" disabled={busy} onClick={() => void act(refresh)}>Actualizar</button>
    </div>
    {tickets.length ? <ul className="participant-entries">
     {tickets.map(entry => {
      const pending = entry.status === 'pending';
      const guest = entry.method === 'guest';
      const ticketLink = new URL('/?ticket=' + encodeURIComponent(entry.id), location.origin).href;
      const sendEntry = !pending && !guest && whatsappUrl(entry.phone, 'Hola ' + entry.name + ', tu entrada está confirmada. Podés verla acá: ' + ticketLink);
      return <li key={entry.id}>
       <strong>{entry.name}</strong>
       <span>{guest ? 'Invitado · En lista de puerta' : (pending ? 'Pago pendiente' : 'Pago confirmado') + ' · ' + money.format(entry.amount)}{entry.entered_at ? ' · Ya ingresó' : ''}</span>
       <div className="actions">
        {pending && <button disabled={busy} onClick={() => updateEntry(entry, true)}>Confirmar pago</button>}
        {(pending || (guest && !entry.entered_at)) && <button className="secondary" disabled={busy} onClick={() => updateEntry(entry, false)}>{guest ? 'Quitar invitado' : 'Anular reserva'}</button>}
        {sendEntry && <a className="button secondary" target="_blank" rel="noreferrer" href={sendEntry}>Enviar entrada por WhatsApp</a>}
       </div>
      </li>;
     })}
    </ul> : <p>Todavía no hay invitados ni compras.</p>}
   </section>
  </main>
 </div>;
}
