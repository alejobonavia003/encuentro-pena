# Verificación de la versión Supabase

32 comprobaciones de integración con PostgreSQL embebido (PGlite), usando el mismo SQL de producción y roles/auth emulados. Incluyen los dos administradores, aislamiento de bandas (también bandas sin usuario), invitaciones, cupos/tramos, idempotencia, vencimientos, aceptación de responsabilidad, estados de puerta, ingreso único, revocación y exportación protegida. No es una prueba de carga de producción ni una prueba real de Google.

Compilación Next.js y TypeScript aprobadas. Esquema desplegado en Supabase, RLS habilitado y registros copiados con IDs conservados. Asesor de seguridad: sólo avisos informativos RLS Enabled No Policy, coherentes con el acceso directo revocado y el uso exclusivo de RPC con autorización explícita. Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

Pendientes: ensayo real de Google OAuth y roles en distintos teléfonos, acceso público del deployment Vercel, vinculación automática de GitHub con Vercel y sincronización final de la app original antes de cambiar los enlaces.
