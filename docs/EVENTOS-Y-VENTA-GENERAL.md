# Eventos y venta general

La página principal muestra los eventos con el nombre, fecha y lugar definidos en Configuración. El enlace `/?event=ID` abre la compra general. Los enlaces existentes `/?b=ID` y `/?ticket=ID` siguen funcionando y resuelven el evento correspondiente.

## Administración

1. Entrar al panel con Google desde la página principal.
2. Elegir un evento o pulsar **Crear evento**. Cada nuevo evento comienza con ventas cerradas y un participante de organización propio.
3. En **Configuración**, completar nombre, fecha, horario y lugar. En **Venta general · Organización**, completar encargado, alias, titular, WhatsApp, precio y cupo.
4. Crear los participantes del evento seleccionado y compartir sus invitaciones y enlaces habituales.
5. Habilitar la venta desde Configuración. Cada banda conserva sus 20 entradas y sus dos tramos de precio. La organización vende con su propio precio y cupo.
6. Abrir **Gestionar pagos generales** para revisar los cobros y confirmar entradas. Después de aprobar, **Enviar entrada por WhatsApp** prepara el mensaje al asistente; hay que enviarlo desde WhatsApp. Puede reenviarse desde la fila de una entrada confirmada.

Al confirmar, el asistente aparece en la lista de puerta del evento. El personal de puerta debe seleccionar el evento correcto antes de registrar ingresos. Los accesos existentes de puerta son de organización y pueden cambiar de evento.

Las reservas guardan el importe asignado por el servidor. Cambiar el precio general no altera reservas previas. No se permite reducir el cupo si excluye reservas vigentes o entradas confirmadas. El participante de organización no se elimina ni se asigna por invitación a un representante.

## Migración y validación

Aplicar las migraciones pendientes en orden, incluyendo `20261117170427_events_general_sales.sql`, antes de desplegar esta versión. La migración conserva el evento existente con ID 1, sus participantes, invitaciones, enlaces y entradas. Agrega un organizador sin datos de cobro: completar su configuración para vender entradas generales.

El respaldo JSON incluye todas las configuraciones de eventos, participantes, entradas y auditoría. Sponsors y personal de puerta siguen siendo compartidos por la organización.

Verificación: pruebas PostgreSQL locales con PGlite para migración, permisos, cupos, precios e independencia entre eventos. Pruebas de interfaz en navegador con respuestas de API de prueba para catálogo, compra general, configuración y botón de envío por WhatsApp. No se enviaron mensajes ni se crearon compras de prueba en producción.
