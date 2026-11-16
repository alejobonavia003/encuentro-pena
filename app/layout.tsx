import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Encuentro · Peña',description:'La música nos encuentra. Entradas para apoyar a bandas y bailarines.',referrer:'no-referrer'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es-AR"><body>{children}</body></html>}
