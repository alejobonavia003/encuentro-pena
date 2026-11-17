import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'El Anidal · La Peña by Encuentro',description:'El Anidal. La Peña by Encuentro junto a El Alborada. Música, danza y entradas para apoyar a cada participante.',referrer:'no-referrer'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es-AR"><body>{children}</body></html>}
