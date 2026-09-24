# Social Publishing

Esta guia documenta como se publican o programan los contenidos sociales generados por HyperFrames.

## Plataformas Actuales

Soportado actualmente:

- Instagram Reels.
- Facebook Reels.
- Instagram carousels.

No mezclar los flujos salvo que se pida expresamente. Reels y carruseles usan workflows distintos en n8n.

## Cuentas Actuales

Cuenta/pagina usada para la configuracion de publicacion:

```text
Facebook Page: Agencia Marketing Digital Espana
Facebook Page ID: 1008229502375842
Instagram: crecimientosc
Instagram ID: 17841435854263931
```

No guardar tokens en este documento. Las credenciales viven en `.env` o en la configuracion interna de n8n.

## Credenciales

El archivo local usado para llamar a n8n y Meta es:

```text
C:\Users\USUARIO\Downloads\mcp-n8n\.env
```

Variables conocidas:

```text
N8N_BASE_URL
N8N_API_KEY
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
META_ACCESS_TOKEN
```

Reglas:

- No imprimir valores de tokens ni secretos.
- Verificar permisos con llamadas de prueba antes de asumir que un token nuevo sirve.
- Si cambia el token Meta, revisar tambien workflows antiguos que guarden config en `staticData`.

## Cloudflare Access

n8n esta protegido por Cloudflare Access. Las llamadas a webhooks o API de n8n deben incluir los headers del service token si estan disponibles:

```text
CF-Access-Client-Id
CF-Access-Client-Secret
```

Para webhooks publicos protegidos por Cloudflare, usar tambien un `User-Agent` de navegador comun cuando el workflow lo necesite.

## R2

Los renders y assets publicos se entregan mediante Cloudflare R2.

Videos:

```text
hyperframes/drafts/<slug>-<timestamp>.mp4
hyperframes/finals/<slug>-<timestamp>.mp4
```

Carruseles:

```text
carruseles instagram/<slug>/slide-01.png
carruseles instagram/<slug>/slide-02.png
...
```

Reglas:

- Usar un prefijo unico por pieza.
- No subir slides nuevas con nombres genericos en una carpeta compartida.
- No romper URLs antiguas sobreescribiendo assets historicos.

## Instagram And Facebook Reels

Workflow n8n:

```text
name: programacion de reels
id: x8etUYlUWqCCONxW
```

Endpoints:

```text
POST /webhook/instagram-reel-schedule
GET  /webhook/instagram-reel-status
POST /webhook/instagram-reel-config
```

Uso:

- Instagram Reels publica el MP4 como Reel.
- Facebook Reels publica el mismo MP4 como Reel en la pagina configurada.
- El payload puede incluir `platforms: ["instagram", "facebook"]`.
- Si solo se quiere Instagram, usar `platforms: ["instagram"]`.

Comando recomendado:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook
```

Previsualizar el payload sin encolar nada:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook --dry-run
```

El comando lee la URL MP4 desde `content/video-queue/queue.json` o `video-queue.csv`, llama a `instagram-reel-schedule` y marca la pieza como `scheduled` cuando n8n acepta el trabajo.

## Summary Intake Review Webhooks

Approval webhook schedules publication. Rejection webhook marks the item
`needs_revision`. Approval must be idempotent and must not enqueue duplicate
Reels for the same slug.

`needs_revision` means the draft was reviewed and changes were requested. It is
not a final publication failure; revise the source package, render again, and
return the item to `needs_review`.

Current workflow:

```text
name: HyperFrames Content Intake
id: eXLSEY7Fzg0kGBit
```

Current review endpoints:

```text
POST /webhook/hyperframes-video-review-approve
POST /webhook/hyperframes-video-review-reject
```

Approval runs `scripts/review-video-job.mjs --action approve`, which can call
`scripts/schedule-instagram-reel.mjs`. Use `dry_run` for the first review-path
test so the payload is inspected without enqueueing a real post.

The workflow scripts run on the VPS through Docker image
`n8n-hyperframes-renderer`, with the project mounted from
`/opt/n8n/hyperframes`.

Estado esperado:

```text
queued -> publishing -> published
failed si Meta rechaza el video, token, pagina o permiso
```

## Instagram Carousels

Workflow n8n:

```text
name: programacion de carruseles
id: ZKD4lsnfQ4saTB9I
```

Endpoint:

```text
POST https://n8n.urltovideo.es/webhook/instagram-carousel-schedule
```

Payload base:

```json
{
  "batch_id": "carousel-<slug>-<timestamp>",
  "start_at": "YYYY-MM-DDTHH:MM:SS+02:00",
  "default_interval_minutes": 240,
  "carousels": [
    {
      "caption": "Texto del post",
      "slides": [
        { "image_url": "https://pub-.../slide-01.png" },
        { "image_url": "https://pub-.../slide-02.png" }
      ]
    }
  ]
}
```

Comando recomendado:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"
```

Ese comando:

1. Lee `carousels/<slug>/manifest.json`.
2. Sube las slides a R2 a traves de la VPS si faltan URLs publicas.
3. Construye el payload.
4. Llama al workflow de n8n.
5. Actualiza `content/carousel-queue/queue.json`.

## Programacion

Usar siempre fecha absoluta con zona horaria:

```text
2026-09-02T10:00:00+02:00
```

Evitar fechas relativas tipo `manana por la tarde` dentro de archivos o payloads. Si el usuario lo dice en chat, Codex debe convertirlo a fecha absoluta antes de programar.

## Checks Antes De Publicar

Videos:

- Confirmar que el MP4 abre desde la URL de R2.
- Revisar hook, mitad y CTA.
- Confirmar que subtitulos y CTAs no caen en zona peligrosa de UI.
- Confirmar que el estado esta en `needs_review` si aun no hay aprobacion.

Carruseles:

- Confirmar que hay PNGs `1080x1350`.
- Revisar slide 1, una slide media y CTA.
- Confirmar que las URLs publicas de slides abren.
- Confirmar caption y CTA.
- Confirmar `start_at` con zona horaria.

## Fallos Habituales

- Token Meta caducado o cambiado.
- Permisos Meta incompletos.
- Workflow antiguo con token guardado en `staticData`.
- Cloudflare Access bloqueando llamadas sin headers.
- R2 con prefijo incorrecto o URL sin escapar espacios.
- Fecha sin zona horaria.
- Carousel con una slide ausente o URL no publica.

## No Hacer

- No publicar contenido de ejemplo.
- No programar nada real sin fecha y CTA claros.
- No usar `--quality high` para videos salvo peticion explicita.
- No imprimir secretos.
- No mezclar Reels y carruseles en un unico workflow salvo que el usuario lo pida.
