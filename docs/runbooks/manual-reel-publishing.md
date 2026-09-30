# Publicar Reels aprobados desde GitHub Actions

Este flujo usa la cola manual de Hypervideo y el publicador existente de n8n. No activa Summary Intake. Configurarlo o fusionar el código no publica ningún vídeo.

## Configuración inicial

1. Comprobar en n8n que el workflow `programacion de reels` (ID `x8etUYlUWqCCONxW`) está activo y que tiene permisos vigentes para Instagram y Facebook. La acción no crea ni reconfigura ese workflow.
2. En GitHub > Settings > Secrets and variables > Actions, crear los **secrets** `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` correspondientes a un service token admitido por la aplicación Cloudflare Access de n8n. La URL de n8n ya figura en la acción. No guardar aquí el token Meta: sigue en n8n. No pegar secretos en issues, comentarios ni el chat.
3. Comprobar que GitHub Actions puede escribir en el repositorio (`contents: write`), como ya hace el puente de render. Si una protección de `main` impide los commits de Actions, adaptar la actualización de cola antes de usar el publicador.

## Uso tras aprobar un borrador

Abrir Actions > **HyperFrames publish Reel (manual)** > **Run workflow**, seleccionando `main`. Completar:

- `slug`: slug exacto del vídeo que está en `needs_review` y tiene MP4 público.
- `caption`: texto público del post.
- `publish_at`: `now` para solicitar publicación inmediata o fecha futura ISO con zona horaria, por ejemplo `2026-10-20T15:00:00+02:00`.
- `platforms`: `instagram`, `facebook` o `instagram,facebook`.
- `include_cover`: mantener activado para enviar `outputs.cover`; desactivarlo para conservar la portada en la cola pero omitir `cover_url` en este intento.
- `confirmation`: escribir literalmente `PUBLICAR <slug>`; esto es la aprobación explícita del borrador elegido.

Si la entrada de la cola contiene `outputs.cover`, la acción añade esa URL al
payload como `cover_url`. El publicador de n8n decide cómo aplicarla en
Instagram y Facebook; la ausencia de portada mantiene el comportamiento
anterior. La opción `include_cover` permite omitirla en una publicación concreta
sin borrar el archivo ni sus hashes de la cola.

## Pizarras independientes renderizadas localmente

Las pizarras autónomas no necesitan volver a renderizarse en la VPS para poder
publicarse. Seguir el mismo procedimiento usado por `seo-aeo-pizarra-v3`:

1. Verificar el MP4 final y la portada localmente, incluyendo sus SHA-256.
2. Crear una Release pública de GitHub con una etiqueta única
   `video-<slug>` y adjuntar `<slug>.mp4` y `<slug>-cover.png`.
3. Comprobar en la página de la Release que GitHub muestra los mismos hashes.
4. Registrar en la cola las URL públicas bajo `outputs.render` y
   `outputs.cover`, junto con `render_sha256` y `cover_sha256`.
5. Mantener el elemento en `needs_review` hasta que el usuario apruebe
   explícitamente esa versión exacta.
6. Lanzar esta acción manual. La acción enviará `video_url` y `cover_url` al
   webhook sin pasar por Summary Intake ni por el render remoto.

No intentar entrar en el panel de Cloudflare para esta ruta ni presentar R2
como requisito: la Release de GitHub es el alojamiento público establecido para
una pizarra local ya aprobada.

Solo el dueño del repositorio puede ejecutar esta acción con éxito en `main`. El workflow valida todos los campos y la cola. **Antes** de contactar con n8n, registra en `main` un intento con su ID y cambia el estado a `publishing`. La acción llama una sola vez a `/webhook/instagram-reel-schedule` y, si recibe la aceptación esperada, registra `scheduled`, `review.status=approved` y el ID de n8n. `scheduled` indica aceptación/programación, no confirma todavía que Meta haya publicado. Para leer el estado posterior sin volver a publicar, usar **HyperFrames check Reel status (manual)** con el `jobId` que quedó en `outputs.reel_publish`.

## Si falla

- Antes de la reserva: no se llama a n8n y la cola no cambia. Corregir el error y volver a lanzar.
- Durante o después de la llamada a n8n: **no volver a pulsar Run workflow**. El estado `publishing` bloquea duplicados. Revisar en n8n el `jobId` que figura en `publish_attempt` y reconciliar el resultado antes de otro intento. Un error de red puede suceder después de que n8n haya aceptado el trabajo.
- Si n8n acepta pero falla el push final: el `jobId`, el número de jobs aceptados y sus estados quedan registrados en el log de Actions. Consultar n8n para reconciliar la cola sin repetir el webhook. La respuesta completa temporal del runner no se conserva.

El puente de render sigue terminando en `needs_review` y nunca invoca esta acción por sí mismo.
