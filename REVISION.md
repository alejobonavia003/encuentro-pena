# Revisión local de Encuentro Peña

## Punto de partida y alcance

- Repositorio con historial Git, rama `main`, commit inicial `a9d58af`. Después de `git fetch origin`, `HEAD...origin/main` dio `0 0`. No había modificaciones locales iniciales. No se hizo pull, reset, push ni despliegue.
- Se conservaron los identificadores y las URLs `/?b=<id>`, `/?invite=<token>` y `/?ticket=<id>`.
- Se conserva `Cerrar sesión` para toda identidad que tenga sesión, incluidos visitantes autenticados sin rol, representante, administración y puerta.
- La descarga consulta nuevamente `/api/ticket` antes de generar la imagen. La imagen y su QR sólo consultan el estado: no llaman a `checkin`. El servidor sigue autorizando y registrando un único ingreso.

## Cambios

- Datos de cobro y QR/enlace visibles al principio del panel del representante, selector cuando representa más de un participante y solicitudes pendientes destacadas con el aviso de responsabilidad.
- Administración: alta de Banda o Bailarines / grupo de danza sobre la misma tabla y RPC. Accesos explícitos a entradas, venta pública e invitación privada en secciones distintas.
- Un mismo enlace estable en QR, copia y Web Share. La alternativa de compartir es copiar. Los enlaces usan el origen desde el que se abrió la app.
- WhatsApp argentino normalizado en formulario, API y RPC. `lib/phone.ts` se comparte entre cliente/API/enlaces anteriores. El equivalente SQL se contrasta con los mismos casos. Acepta número nacional de 10 dígitos con un código de área del listado oficial de [ENACOM](https://www.enacom.gob.ar/indicativos-interurbanos_p143), guardado localmente en `lib/argentine-area-codes.mjs`, 54, 549 y los formatos reconocibles con 0 y 15. Rechaza números locales sin área, longitudes incompatibles, otros países e internos. No comprueba la asignación efectiva de una línea. Los tests contrastan cada código oficial y los formatos nacionales y con 0/15 en JavaScript y SQL.
- Estados de vencimiento explícitos para vencimientos nuevos; las cancelaciones históricas que ya no conservan la causa siguen como canceladas. No se reinterpretaron ni reescribieron masivamente los registros anteriores.
- Negro y dorado, contraste y tipografía mayores, controles de 48 px, navegación de diálogo con teclado, foco visible y bloqueo inmediato de operaciones duplicadas. Puerta usa tarjetas en móvil y tabla en escritorio/impresión. Guardia sin participante asignado no ve una pestaña vacía de representante.
- OAuth conserva PKCE, callback en el origen actual y retorno interno; se bloquean retornos con barras invertidas o caracteres de control.

## Imágenes

Los archivos aparecieron directamente en `public/` durante la tarea, sin subcarpeta nueva:

- `IMG-20261015-WA0024.jpg`: logo horizontal. Copia optimizada `public/brand/encuentro-horizontal.webp` en encabezados, ingreso y PNG descargable.
- `IMG-20261015-WA0025.jpg`: símbolo E. Copia optimizada `public/brand/encuentro-simbolo.webp` en compra, resumen y encabezado muy estrecho.

Se generaron WebP con Sharp ya instalado transitivamente por Next, sin agregar dependencias. Se conservaron ambos JPG intactos. No hay fotos en los archivos recibidos y no se usaron recursos externos. Los logos se dibujan completos, sin recorte; el texto de la entrada se compone con fuentes y saltos de línea, sin estirarlo.

## Migración pendiente: aplicar antes de publicar

`supabase/migrations/20261116220155_participants_whatsapp.sql` se generó con la CLI. Agrega `bands.kind` con valor predeterminado `band` y restricción `band/dance`, `tickets.expired`, el normalizador privado y una nueva versión del dispatcher con los mismos permisos. Conserva RLS, bloqueo por participante, índice único de cupo activo, claves de reintento y autorizaciones existentes. No cambia IDs, invitaciones, perfiles anteriores ni entradas confirmadas.

Se encontró acceso de lectura al proyecto remoto `encuentro-pena` y se cotejaron las columnas del esquema. No se modificó la base real. No se identificó un entorno remoto de prueba separado. La migración se aplicó primero y probó sobre PostgreSQL embebido PGlite con el esquema anterior y registros previos.

Orden para una base existente:

1. Revisar y respaldar la base. Probar el SQL en una rama/base de prueba que reproduzca el esquema real y verificar las funciones y permisos.
2. Ejecutar **solamente el archivo de migración** en el SQL Editor de Supabase, en su transacción. No volver a ejecutar `schema.sql` sobre una base existente.
3. Verificar valores `kind='band'` de los participantes anteriores, venta de ambos tipos, permisos y ausencia de cambios en IDs/enlaces. Ejecutar los advisors de Supabase.
4. Recién después publicar esta versión. No desplegar el código con la migración pendiente: el backend anterior no conoce los bailarines ni la validación nueva.

Para una base vacía: ejecutar primero `supabase/schema.sql`, luego esta migración; completar la configuración y los administradores según README. No usar este procedimiento para reemplazar una base existente.

## Comprobaciones y límites

- `npm test`: casos de teléfonos e idempotencia, construcción wa.me, enlaces públicos estables en localhost/preview/dominio futuro y retorno OAuth seguro. PostgreSQL prueba migración sobre registros previos, permisos de administración/representantes/puerta, bandas y danza, reserva/confirmación manual, veinte cupos, diez entradas por tramo, total $170.000, vencimiento y liberación de cupo, reintentos y prevención de doble ingreso. No es una prueba de carga concurrente contra el servidor remoto.
- `npm run typecheck` y `npm run build`.
- Navegador real: ingreso a 360, 390 y 1280 px sin desbordamiento horizontal, logo cargado y botón principal de 48 px. Manejo de falta de configuración: aviso en ingreso, reintento en portada y respuesta 503 de API.
- Generador de entrada probado en una página temporal con datos ficticios, sin autenticación: rechazó estado pendiente, generó PNG de 1000×1700 y se inspeccionaron visualmente logo, QR y nombres largos. La página temporal se retiró del proyecto.
- No hay `.env.local` en esta copia. No se verificaron OAuth de Google, Web Share nativo de un teléfono ni recorridos visuales autenticados de administración, representante y guardia contra Supabase. No se inventaron sesiones ni se crearon reservas reales. Las identidades sintéticas de los tests SQL pertenecen únicamente a la base efímera PGlite.

## Iniciar y revisar

```sh
npm ci
cp .env.example .env.local
# Completar las dos variables públicas del proyecto de prueba.
npm test
npm run dev
```

Abrir `http://localhost:3000`. Sin configurar Supabase se puede revisar `/login`, los logos y los errores de configuración, pero no operar ventas. Para revisar el circuito completo, usar una base de prueba con la migración aplicada y Google configurado para permitir el callback local. Nunca copiar la clave `service_role` a variables públicas.

Recorridos con cuentas reales autorizadas en esa base:

1. Administrador: `/login` → Bandas y bailarines → Agregar participante (probar ambos tipos y nombres largos). Ver entradas, QR y enlace de venta; aparte, Invitar representante. Configuración contiene personal de puerta y exportación de respaldo.
2. Representante: abrir su invitación privada, ingresar con Google y activarla. Completar cobro usando `358 4928722`; comprobar datos listos, QR descargable, copia y compartir. Si tiene varios participantes, cambiar con el selector. Probar listas vacías y solicitudes pendientes.
3. Comprador: abrir el enlace público/QR sin cuenta, reservar, copiar alias/contactar por WhatsApp y consultar estado. Confirmar desde la cuenta del representante. Volver a actualizar y descargar la entrada. Probar cancelación/vencimiento y errores de conexión, sin duplicar reservas al reintentar.
4. Guardia: activar invitación propia, buscar nombre largo/participante/código, registrar ingreso una vez y comprobar “Ya ingresó” con botón bloqueado. Exportar CSV e imprimir en móvil y escritorio.
5. En cada cuenta verificar `Cerrar sesión` y que las rutas privadas dejan de permitir operaciones. Probar que un representante no ve ventas ajenas y que puerta no puede confirmar pagos.

## Publicación y dominio: sólo preparación

No se cambiaron DNS, nameservers, dominios Vercel ni ajustes de Google/Supabase. Se conserva el dominio actual y no se agregó una URL de producción fija al código. No hace falta una variable `NEXT_PUBLIC_APP_URL`: enlaces públicos, QR y callback toman `location.origin`.

Las variables existentes son `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; apuntan al proyecto Supabase elegido y **no cambian por cambiar el dominio de la app**, salvo que también se cambie de proyecto. Después de editarlas hay que reiniciar desarrollo o reconstruir el despliegue.

Con el dueño, antes de usar `https://ticket.encuentromultiespacio.com`: aplicar y verificar la migración; configurar allí el despliegue, HTTPS y el DNS acordado; permitir `https://ticket.encuentromultiespacio.com/auth/callback` en Supabase Redirect URLs; revisar Site URL y el callback del proveedor Google según la configuración de Supabase, manteniendo el acceso actual durante la transición. No reemplazar a ciegas el callback Google de Supabase por el callback de la app. Finalmente probar OAuth, cada rol, compra, confirmación, descarga e ingreso desde el dominio final y un celular real.

## Publicación del 16 de noviembre de 2026

La migración indicada arriba se aplicó correctamente en producción antes del frontend. Proyecto Supabase: `utvcvzqxitopzxzhftuk` (`encuentro-pena`). Proyecto Vercel existente: `prj_mTpwZSAYDyjtq0W7etarhRjZ8mK4` (`encuentro-pena`), equipo `team_9tfFGwDuLr5SwQ11YtXosd4o`. Vercel no tiene repositorio conectado ni rama de despliegue automático; el código se conserva en `origin/main` y se publica en ese proyecto existente.

Se guardó un respaldo privado fuera del repositorio, en `/home/mrphilips/Encuentro/private-backups/encuentro-pena-20261116/`: `before.json` contiene los datos afectados y los permisos, restricciones e índices anteriores; `previous-functions.sql` conserva las definiciones reemplazadas y el wrapper público. No contiene credenciales de acceso. Los archivos tienen permisos 600 y el directorio 700.

Después de migrar se compararon íntegramente los 2 participantes, las 4 entradas, las 2 identidades de puerta, las 2 autorizaciones administrativas, la configuración y los 13 registros de auditoría. Todo quedó igual al excluir las columnas agregadas `kind` y `expired`. Se conservaron IDs, invitaciones, confirmaciones, ingresos, permisos, RLS e índices. Los participantes anteriores quedaron como `band`, sin reescribir teléfonos. Ambos teléfonos existentes son compatibles.

La API del frontend todavía publicado devolvió los mismos datos de compra para ambos participantes (excepto el nuevo campo `kind`) y permitió consultar las cuatro entradas existentes. No se crearon ventas de prueba en producción.

Validación local: `npm test` (48 comprobaciones SQL, 32 casos de teléfono y 300 códigos de área), `npm run typecheck` y `npm run build -- --webpack` correctos. El build Turbopack local falla porque el entorno bloquea la apertura de puertos; no se cambió el comando de producción por ese motivo.

Advisors: sin hallazgos nuevos de seguridad respecto de la revisión previa. RLS sin políticas directas es deliberado: las tablas se acceden por RPC con controles explícitos. Sigue el aviso previo de protección de contraseñas filtradas desactivada; no se cambiaron ajustes de autenticación. El advisor de rendimiento informa `tickets_expiry` sin uso; se conserva el índice.

Las dos variables públicas existentes están configuradas en producción; no se requieren variables nuevas. No se modificaron sus valores, DNS, dominios, OAuth ni protecciones. Sin sesiones reales disponibles, los recorridos autenticados de administración, representantes y puerta quedan para revisión manual.

### Recuperación

1. Si falla el build remoto, mantener el deployment anterior `dpl_HRbftr25NdYVcfGZnD71NAAFpUbP`; no publicar un frontend incompleto.
2. Si aparece un problema de frontend después de publicar, realizar rollback de Vercel a ese deployment anterior y comprobar `/api/init`, los enlaces de compra existentes y la consulta de entradas. La compatibilidad de esa versión con la base migrada fue comprobada para lectura pública; los flujos autenticados requieren sesión real.
3. Mantener las nuevas columnas y los datos. No ejecutar `schema.sql`, eliminar tablas, borrar participantes o restaurar globalmente el JSON sobre ventas nuevas.
4. Si el problema está en el dispatcher, preparar una migración correctiva transaccional a partir de `previous-functions.sql`, evaluar antes participantes `dance` creados desde la publicación y conservar `kind`, `expired` y todas las ventas posteriores. Restaurar el dispatcher antiguo oculta la distinción de tipos; preferir corregir la función nueva.
5. El respaldo es selectivo de los datos y definiciones afectados, no un backup completo de Auth ni una restauración PITR. Usarlo para comparación y recuperación selectiva revisada.

## Segunda revisión: El Anidal, sponsors y logos (trabajo local)

La publicación anterior terminó correctamente en el deployment `dpl_841ocgGBG5WPaGWeGmmSUnN7Eq7M`, commit `8e628e3`, y Vercel quedó conectado a `alejobonavia003/encuentro-pena`, rama `main`. La nota anterior sobre falta de conexión describe el estado inicial, no el actual.

Esta nueva revisión agrega identidad oscura de La Peña by Encuentro junto a El Alborada, edición El Anidal; tipografía local Amatic SC con licencia OFL; sponsors gestionables por administración; carga de logos propios por representantes; QR de venta con corrección H y marca central pequeña; logos y sponsors en la imagen de entrada. El Anidal conserva un espacio reemplazable en `public/brand/`. El icono real de El Alborada ya está integrado como `public/brand/el-alborada.webp`. Los originales suministrados se conservan.

Migración nueva preparada: `supabase/migrations/20261116235328_sponsors_participant_logos.sql`. Agrega `bands.logo_path`, `public.sponsors`, bucket público exclusivo `pena-logos` (WebP, 1 MB) y política de carga con cuenta verificada, sesión activa y propiedad del participante o rol administrador. La app convierte PNG/JPG/WebP de hasta 5 MB a WebP antes de subir; se agrega un fondo que preserve la visibilidad de logos blancos. No se requieren variables nuevas ni service_role. No se agregan políticas de borrado ni sobrescritura; cada reemplazo usa una ruta nueva y las imágenes anteriores se conservan.

La migración no fue aplicada a producción y estos cambios no se publicaron todavía. Para publicar: respaldar los datos y definiciones actuales, aplicar solamente esta migración después de la anterior, verificar permisos e integridad, recién entonces publicar el frontend. No recrear el esquema ni el proyecto. Para una instalación vacía, ejecutar schema.sql y ambas migraciones en orden.

Las pruebas SQL incluyen una réplica local de los metadatos de Storage para verificar la política real: anónimo, identidad ajena y representante de otra banda no pueden cargar; representante propio y administrador sí; sobrescritura y SVG bloqueados; sponsors ocultos fuera de publicidad pública; rutas de objetos ajenos o inexistentes rechazadas; sesiones revocadas sin permiso de carga. Son pruebas locales, no una comprobación del servicio Storage remoto.

Se revisó en navegador una página temporal con datos ficticios: identidad, compra, sponsors, formulario de carga y generación de entrada. Se retiraron página, endpoint y objetos de prueba al terminar. Un decodificador independiente (zbar) leyó el QR de venta con logo y el QR de la entrada con los destinos esperados. Las muestras quedaron fuera de Git, en `/tmp/anidal-review/`. Los recorridos autenticados y la carga real contra Storage quedan pendientes de un entorno de prueba con cuentas autorizadas.

Manual solicitado: `docs/ADMINISTRAR-PARTICIPANTES-SUPABASE.md`. Incluye baja reversible que conserva entradas y revoca invitación/asignación, reactivación y borrado definitivo condicionado a no tener entradas; las consultas se ensayan con rollback.

Ajuste previo a publicación: nido de El Anidal con más ramas, compartido por web y PNG de entrada; nombre corregido a El Alborada e icono suministrado integrado sin recortes. Los originales se conservan.

## Publicación de El Anidal, sponsors y logos — 16/11/2026

La migración `sponsors_participant_logos` se aplicó correctamente en Supabase antes del push. Respaldo privado actualizado fuera del repositorio: `/home/mrphilips/Encuentro/private-backups/encuentro-pena-sponsors-20261116/`, con datos y metadatos anteriores en `before.json` y funciones en `previous-functions.sql`. No se cambiaron variables, DNS, dominios, OAuth ni protecciones.

Se compararon los 3 participantes, 5 entradas, 2 accesos de puerta, 2 administradores, configuración y 16 registros de auditoría contra el respaldo: todos intactos (sólo se agregó `logo_path=null` a participantes). Los IDs, invitaciones, confirmaciones, ingresos, permisos existentes, políticas e índices se conservaron. Se verificó el bucket público `pena-logos`, límite de 1 MB, sólo WebP y carga condicionada a sesión y permisos. No se crearon sponsors, archivos de prueba ni ventas ficticias en producción.

La API de la versión todavía publicada se contrastó antes/después: init, compra de los tres participantes y consulta de las cinco entradas devuelven lo mismo, salvo los campos nuevos compatibles. Pasaron los 69 controles SQL/Storage locales, los casos de teléfonos/enlaces, TypeScript y build Webpack. No hay rama remota de prueba. Los recorridos autenticados de carga de logos y sponsors requieren revisión con cuentas reales.

El advisor de seguridad agrega únicamente la información esperada de RLS sin políticas directas en `sponsors`: la tabla se opera por RPC autorizada. Sigue el aviso previo de protección de contraseñas filtradas desactivada; no se alteró configuración Auth.

El encabezado muestra primero El Anidal, Encuentro y El Alborada, con el icono real de El Alborada. El Anidal aún usa su marca temporal y nido de ramas hasta recibir el logo definitivo.

Recuperación de esta publicación: si falla el build remoto, conservar el deployment anterior `dpl_841ocgGBG5WPaGWeGmmSUnN7Eq7M`. Si aparece un problema de frontend, hacer rollback a ese mismo deployment y comprobar `/api/init`, compra y entradas existentes; la compatibilidad de la API antigua con esta migración ya fue verificada. Mantener `logo_path`, sponsors, bucket y objetos; el frontend anterior no los gestiona pero no necesita borrarlos. Para un error SQL, preparar una migración correctiva transaccional usando las definiciones respaldadas; no restaurar todo el JSON sobre ventas posteriores ni ejecutar schema.sql de nuevo.

## Publicación rápida: solistas

Se agrega `solo` como tercer tipo, junto con `band` y `dance`; selector de alta, tarjetas y página pública muestran Solista. Migración `20261117011551_solo_participants.sql` aplicada antes de publicar. Amplía la restricción y validación de creación; mantiene el dispatcher y permisos, sin reescribir filas. Respaldo privado previo en `/home/mrphilips/Encuentro/private-backups/encuentro-pena-solistas-20261116/`. Se conservaron los 4 participantes, 8 entradas, sponsor y demás datos existentes.

75 pruebas locales correctas: incluye alta autorizada, invitación, venta, 20 cupos, tramos de precio, confirmación y puerta para solistas. Build Webpack y TypeScript correctos. No se crearon datos ficticios en producción. Para recuperar el frontend anterior, volver a `dpl_7X68TzFzfLWvNWLMSiXCAYh4n1iX` conservando la base ampliada; esa versión mostrará los nuevos solistas como Banda, pero sus IDs y operaciones se mantienen. Preferir corregir el frontend en lugar de revertir datos.
