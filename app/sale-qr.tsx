'use client';

import {useEffect, useState} from 'react';
import {Download} from 'lucide-react';
import {saleQrImage} from '../lib/qr-image';

export function QR({value, logo}: {value: string; logo?: string | null}) {
 const [result, setResult] = useState<{value: string; logo?: string | null; src?: string}>();
 useEffect(() => {
  let live = true;
  saleQrImage(value, logo ?? undefined).then(
   src => { if (live) setResult({value, logo, src}); },
   () => { if (live) setResult({value, logo}); }
  );
  return () => { live = false; };
 }, [value, logo]);

 if (result?.value !== value || result.logo !== logo) return <p role="status">Generando QR…</p>;
 if (!result.src) return <p role="status">No pudimos generar el QR. Cerrá y volvé a abrir esta sección.</p>;
 return <div className="qr-download">
  <img width="220" height="220" alt="QR del enlace público de compra" src={result.src}/>
  <a className="button secondary" href={result.src} download="Encuentro-QR-venta.png"><Download size={18}/> Descargar QR</a>
 </div>;
}
