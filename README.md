# Encuentro Peña · Google + Supabase + Vercel

## Estado de la migración

El proceso de migración conserva las bandas, solicitudes y configuración de D1. Las ventas del destino empiezan cerradas. La app anterior sigue activa hasta el corte definitivo. Si recibe cambios, hay que comparar y sincronizar nuevamente antes del corte: no hay replicación automática.

Administradores de la aplicación: configurados privadamente en la tabla pena_private.admins y verificados contra auth.users.email_confirmed_at. La propiedad de las cuentas de infraestructura es independiente de estos roles.

## Publicación preparada

https://TU_DOMINIO

Despliegue de producción creado en Vercel, con protección de acceso todavía activa. Proveedor Google habilitado en Supabase; pendiente la prueba real de inicio de sesión y roles. No repartir este enlace como reemplazo de la app original hasta completar el corte.

## Paneles propios

- Supabase: https://supabase.com/dashboard
- Vercel: https://vercel.com/dashboard
- Repositorio: https://github.com/alejobonavia003/encuentro-pena . La vinculación con Vercel debe verificarse en Settings > Git.

## Configuración de Google

En un proyecto propio de Google Cloud:

1. Configurar Google Auth Platform: Branding (nombre y correo de soporte), Audience (External), Data Access: openid, email, profile.
2. Crear un OAuth Client ID de tipo Web application.
3. Authorized redirect URIs: https://TU_PROYECTO.supabase.co/auth/v1/callback
4. Authorized JavaScript origins: https://TU_DOMINIO (sin ruta).
5. Copiar Client ID y Client Secret directamente al proveedor Google en Supabase Authentication > Sign In / Providers. No subirlos a Git ni pegarlos en un chat. Para web, mantener la comprobación de nonce.
6. En Supabase Authentication > URL Configuration, Site URL: https://TU_DOMINIO; Redirect URLs: https://TU_DOMINIO/auth/callback.
7. Si Google sigue en Testing, agregar las dos cuentas administradoras y las cuentas reales de prueba como Test users. Para el uso de todas las bandas, pasar a Production según lo que permita Google para la configuración elegida.

La autenticación implementada usa PKCE. El código temporal vuelve a /auth/callback; Supabase lo canjea por sesión y restaura la invitación o pantalla original. Login y callback nunca autorizan por sí solos un rol: las operaciones se vuelven a verificar en PostgreSQL. Los representantes activan una invitación de un solo usuario con su Google; las identidades de ChatGPT no se reutilizan como identidades Google.

## Instalar y modificar

Node >=22. Dependencias fijadas en package.json y package-lock.json.

```bash
npm ci
cp .env.example .env.local
```

Completar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY desde Supabase. Es una clave publicable, no service_role. La app no requiere claves secretas de base en el navegador ni service_role en Vercel.

```bash
npm test
npm run typecheck
npm run build
npm run dev
```

Las variables de producción y desarrollo están configuradas en el proyecto Vercel. Preview no tiene acceso a la base real por defecto; asignar otro proyecto de prueba antes de usar previews con datos.

## Base, permisos y concurrencia

- supabase/schema.sql reproduce el esquema en un proyecto vacío; no volver a ejecutarlo sobre el esquema instalado.
- supabase/admins.sql registra la lista privada de administradores.
- RLS habilitado en las cuatro tablas de la app. Sin permisos directos para anon/authenticated: el acceso es mediante public.pena_api, una envoltura invoker de pena_private.handle.
- La función interna SECURITY DEFINER tiene search_path vacío y una lista explícita de operaciones anónimas (init, public, ticket con token impredecible, tickets para solicitar). Las demás requieren identidad verificada, sesión vigente y rol pertinente. No ejecutar SQL que envíe el cliente ni tomar decisiones de user_metadata.
- Las invitaciones y datos privados no salen por los endpoints públicos de bandas. Un enlace largo de una entrada permite al portador consultar esa entrada: tratarlo como privado.
- La RPC reserva cupo/precio con bloqueo por clave de idempotencia y bloqueo de la banda. Índice único parcial en (band_id,slot) para los cupos activos. Valores 1–10 = ARS 7000; 11–20 = ARS 10000.
- Confirmación e ingreso usan bloqueos/actualizaciones condicionales. Un ingreso repetido se rechaza.
- Vencimiento configurable desde Configuración, entre 5 y 10080 minutos. Las solicitudes vencidas liberan cupo; los pagos tardíos se coordinan con la banda.
- Confirmar manualmente sin cobrar sigue siendo una invitación de la banda. La app no verifica bancos ni mueve dinero.
- Auditoría privada de operaciones de administración, confirmación e ingreso.

## Respaldo y recuperación

En Configuración hay una descarga de respaldo JSON completo, además del CSV/lista de puerta. Guardarlo de forma privada: contiene asistentes, WhatsApp e invitaciones de administración. No subir datos de producción a GitHub.

El respaldo JSON es una exportación de datos, no una copia de las cuentas de Google o sesiones de Supabase. Para restaurar en un proyecto nuevo: instalar esquema, registrar administradores, importar settings/bands/staff/tickets respetando IDs, volver a vincular usuarios por invitación y verificar conteos y estados. No restaurar sobre ventas nuevas sin reconciliar cambios. El historial de auditoría y de las identidades previas debe conservarse como legado, no transformarse en permisos de nuevos usuarios.

No se configuró ni verificó un respaldo automático de pago. Verificar las opciones del plan en Supabase. Para puerta, descargar CSV e imprimir antes del evento. La app necesita internet y las pantallas se actualizan con Actualizar.

## Corte definitivo pendiente

1. Habilitar Google en Supabase y sus URLs de retorno.
2. Ingresar con ambos administradores y probar con una cuenta de banda y una de puerta reales.
3. Resolver la protección de Vercel para que los compradores no necesiten cuenta de Vercel; su desactivación está pendiente de autorización explícita.
4. Comparar de nuevo la fuente D1; coordinar cierre de ventas en el origen y sincronizar el delta para que no queden dos aplicaciones vendiendo.
5. Conservar los enlaces viejos mediante redirección del origen al dominio nuevo, incluyendo path y query, después de confirmar que IDs y estados coinciden.
6. Sólo entonces abrir ventas del destino y repartir enlaces nuevos.

No borrar D1 ni el sitio anterior antes de validar el corte y el respaldo.


### Sponsors e identidad de El Anidal

Esta revisión requiere aplicar en orden las migraciones de `supabase/migrations/` después del esquema base; en una base existente aplicar solamente las migraciones pendientes, nunca recrear `schema.sql`. Sponsors aparece en navegación de administración. Permite cargar/reemplazar un logo, ordenar y ocultar publicidad. Los representantes cargan su logo desde Mi participante. Las imágenes se guardan en el bucket público `pena-logos`, con escritura controlada por sesión y propietario. No hay variables nuevas.

El logo del participante aparece en compra, entrada y QR público. La descarga de la entrada consulta estado, logo y sponsors actuales; las imágenes ya descargadas no se actualizan retroactivamente. Los sponsors ocultos se excluyen de nuevas descargas. Si falla una imagen opcional, la entrada conserva nombre, datos y QR.

Ver [manual de baja y eliminación](docs/ADMINISTRAR-PARTICIPANTES-SUPABASE.md) y [reemplazo de logos principales](public/brand/LEEME-LOGOS.md). Amatic SC se aloja localmente; licencia en `public/fonts/AmaticSC-OFL.txt`.
