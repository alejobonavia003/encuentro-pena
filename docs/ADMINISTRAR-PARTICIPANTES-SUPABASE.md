# Dar de baja o eliminar participantes desde Supabase

Proyecto existente: `encuentro-pena` (`utvcvzqxitopzxzhftuk`). La organización puede eliminar desde **Participantes → Eliminar participante**, después de aplicar la migración `20261117163041_delete_participants.sql`. La confirmación borra el participante y sus reservas pendientes o canceladas, e invalida los enlaces de su panel y de compra. Conserva la auditoría y los archivos de logos.

La app bloquea la eliminación si tiene entradas confirmadas o personas que ya ingresaron. Las confirmaciones se deben revisar y anular previamente; un ingreso ya registrado impide eliminarlo. Los representantes y el personal de puerta no tienen permiso para eliminar participantes.

Para una baja que conserve el historial, usar el SQL Editor con una cuenta administradora del proyecto según las instrucciones siguientes.

## 1. Identificar al participante y respaldar

En SQL Editor ejecutar esta consulta de lectura. Elegir por **ID**, porque dos participantes pueden tener el mismo nombre:

```sql
select b.id, b.name, b.kind, b.active,
       count(t.id) as entradas,
       count(t.id) filter (where t.status = 'confirmed') as confirmadas,
       count(t.id) filter (where t.entered_at is not null) as ingresos
from public.bands b
left join public.tickets t on t.band_id = b.id
group by b.id
order by b.name, b.id;
```

Antes de tocar datos, descargar un respaldo desde Configuración → Descargar respaldo completo y guardarlo en un lugar privado. Para un respaldo selectivo, reemplazar `ID_DEL_PARTICIPANTE` y exportar el resultado de esta consulta como JSON desde el editor:

```sql
select jsonb_build_object(
 'participant', (select to_jsonb(b) from public.bands b where id = 'ID_DEL_PARTICIPANTE'),
 'tickets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.tickets t where band_id = 'ID_DEL_PARTICIPANTE'),
 'audit', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from pena_private.audit a
           where entity_id = 'ID_DEL_PARTICIPANTE'
              or entity_id in (select id from public.tickets where band_id = 'ID_DEL_PARTICIPANTE'))
) as backup;
```

El JSON contiene invitaciones y datos personales. No guardarlo en `public/`, Git, mensajes públicos ni repositorios. Los logos son archivos de Storage; el JSON sólo conserva sus rutas.

## 2. Baja recomendada cuando ya tiene entradas

Detiene nuevas compras y revoca el acceso actual del representante para ese participante. Conserva entradas, confirmaciones, ingresos e IDs. Las entradas confirmadas siguen apareciendo en puerta y sus enlaces de consulta siguen funcionando. Una baja **no anula las entradas** ni procesa devoluciones; resolver esas situaciones antes con organización.

Primero ejecutar el bloque con `rollback`, revisar el resultado y luego repetir cambiando la última línea por `commit`:

```sql
begin;

-- Bloquear y comprobar que sea la persona/grupo esperado.
select id, name, active from public.bands
where id = 'ID_DEL_PARTICIPANTE' for update;

update public.bands
set active = 0,
    user_id = null,
    invite = gen_random_uuid()::text || replace(gen_random_uuid()::text, '-', '')
where id = 'ID_DEL_PARTICIPANTE'
returning id, name, active;

rollback; -- Cambiar a commit únicamente después de verificar ID y nombre.
```

Si el representante tiene otros participantes o un rol de puerta, esos accesos no cambian. El enlace público del participante dado de baja deja de aceptar compras. El enlace anterior a su panel deja de funcionar. No eliminar la cuenta de `auth.users`: podría tener otras responsabilidades.

Para reactivarlo:

```sql
update public.bands set active = 1
where id = 'ID_DEL_PARTICIPANTE'
returning id, name, active;
```

Después, copiar desde **Participantes → Compartir panel** el enlace privado nuevo y enviarlo al encargado.

## 3. Eliminar definitivamente un participante creado por error

Sólo usar para un participante **sin entradas**. La app tiene una clave foránea que impide borrar un participante con entradas; no desactivar esa restricción. No borrar las entradas para esquivarla.

Hacer el respaldo anterior y ejecutar primero como ensayo:

```sql
begin;

select id, name from public.bands
where id = 'ID_DEL_PARTICIPANTE' for update;

-- Devuelve exactamente el participante esperado o ninguna fila si tiene entradas.
delete from public.bands b
where b.id = 'ID_DEL_PARTICIPANTE'
  and not exists (select 1 from public.tickets t where t.band_id = b.id)
returning id, name;

rollback; -- Para concretar la eliminación, repetir y terminar con commit.
```

Si no devuelve filas, no insistir con borrados en cascada: revisar el ID y las entradas. Para grupos con historial, usar la baja del paso 2. Los registros de auditoría se conservan.

## 4. Logos y comprobación posterior

Al borrar o dar de baja, no borrar imágenes automáticamente. Los PNG descargados anteriormente no se pueden retirar del celular del comprador y los logos históricos pueden seguir referenciados. Si realmente hace falta limpiar archivos huérfanos, hacerlo desde **Storage → pena-logos**, después de comprobar que ninguna fila de `public.bands.logo_path` ni de `public.sponsors.logo_path` usa esa ruta. No borrar filas directamente de `storage.objects`: usar el panel Storage para que también elimine el archivo físico.

Comprobar después: el participante correcto quedó inactivo o eliminado; los demás permanecen iguales; las entradas confirmadas existentes siguen consultables y visibles en puerta; el enlace anterior del panel ya no abre. No crear una venta ficticia para comprobar la baja.
