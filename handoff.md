# Handoff: HyperFrames social videos con narrador 3D, ElevenLabs y render remoto

> Nota de mantenimiento (2026-09-24): este archivo es un handoff historico y
> acumulativo. Sigue siendo util para contexto largo, pero la fuente operativa
> actual es `AGENTS.md`, `content/CONTENT-WORKFLOW.md`,
> `content/video-queue/README.md`, `content/SOCIAL-PUBLISHING.md`,
> `docs/workflows/eXLSEY7Fzg0kGBit.md` y
> `docs/runbooks/summary-intake-vps-runtime.md`. Si hay conflicto, usar esos
> documentos actuales antes que esta cronologia.

## Estado Actual

El workspace tiene un flujo funcional para crear videos verticales de redes sociales con:

- Formato `1080x1920` para Reels, TikTok y Shorts.
- Zona segura de contenido para evitar la UI de Instagram.
- Plantilla visual recurrente con fondo tecnico oscuro, grid, tarjetas animadas y narrador 3D.
- Voz generada por escenas con ElevenLabs.
- Cola de briefs en `content/video-queue/`.
- Pipeline remoto en VPS mediante n8n, HyperFrames dentro de Docker y entrega publica por R2.
- Por defecto, el PC solo valida entradas, crea un source bundle ligero y lo sube; la VPS hace build, check, snapshots, render y upload.

La ultima prueba completa fue:

```text
slug: mito-domain-rating-seo
modo: draft
estado: completed
render:
https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/hyperframes/drafts/mito-domain-rating-seo-20260827-121845.mp4
jobId: hfb-mito-domain-rating-seo-1787832976970
flujo: source bundle local -> VPS build/check/snapshots/render -> R2
```

## Plantilla Base

La plantilla visual base para futuros videos es:

```text
videos/arquitectura-informacion/
```

Se usa a traves del generador:

```text
scripts/build-social-narrator-video.mjs
```

Plantillas recurrentes disponibles:

```text
dark-tech: videos/arquitectura-informacion/
light-workshop: videos/light-workshop
```

La plantilla por defecto sigue siendo `dark-tech`. Usar `light-workshop` cuando se quiera variedad visual, un tono mas editorial y menos energia de auditoria tecnica oscura.

Caracteristicas actuales:

- Video vertical `1080x1920`.
- Duracion objetivo de `40-60s` por defecto; usar `50s` como punto medio cuando haga falta un valor numerico.
- Narrador 3D mas pequeno en la zona izquierda/inferior.
- Espacio visual mas amplio en la derecha para diagramas, tarjetas, metricas y flujos.
- Titulares grandes dentro de zona segura.
- Subtitulos en caja inferior, por encima de la zona peligrosa de UI.
- Transiciones de escena y cambios de animacion suavizados con un `transition-beat`.

No deben aparecer en videos nuevos:

- Etiquetas visibles tipo `HOOK`, `SISTEMA`, `RESULTADO` o `CTA`.
- Timestamps visibles tipo `00:00` o `00:21`.
- Barra de progreso inferior.

## Zona Segura

Para todo video vertical social, mantener contenido critico dentro de:

```text
x: 96px a 860px
y: 220px a 1380px
ancho maximo critico: 764px
```

Puede salir del area segura:

- Fondo.
- Grid.
- Palabras fantasma.
- Brillos o textura ambiental.
- Elementos no esenciales.

No debe salir del area segura:

- CTA.
- Titulares importantes.
- Datos clave.
- Logos.
- Caras relevantes.
- Subtitulos.
- Tarjetas con contenido que haya que leer.

## Narrador 3D

Assets canonicos:

```text
assets/character/
  Breathing-Idle.glb
  Talking.glb
  Happy-Hand-Gesture.glb
  Yelling.glb
  personas/main-narrator.md
```

Animaciones activas:

```text
breathing
talking
happy
yelling
```

Uso recomendado:

- `yelling`: gancho, idea fuerte o remate.
- `talking`: explicacion principal.
- `happy`: payoff, ejemplo positivo o CTA amable.
- `breathing`: espera, pausa o escena mas calmada.

Problemas visuales resueltos:

- Cara translucida: se normalizaron materiales del GLB.
- Piernas/abrigo solapados: se usa encuadre y mascara inferior.
- Personaje demasiado grande: se redujo escala para dejar respirar la escena derecha.
- Cambios bruscos entre GLB: se cubren con un `transition-beat`.

Pendiente posible:

- Crossfade real entre animaciones si en el futuro se unifican en un unico GLB compatible.
- Crear personaje original para publicacion comercial si se quiere evitar depender de una IP conocida.

## Personalidad Del Narrador

Persona por defecto:

```text
assets/character/personas/main-narrator.md
```

Tono actual:

- Sarcastico.
- Directo.
- Util.
- Algo politicamente incorrecto, sin pasarse.
- Puede usar 1-3 tacos suaves por video de 40-60s.

Ejemplos permitidos:

```text
mierda
maldita sea
capullo
imbecil
```

Regla importante:

- El insulto debe apuntar a malas decisiones, mala UX, marketing vago o procesos rotos.
- No atacar colectivos protegidos, clientes concretos, usuarios como personas ni identidades reales.

## Cola De Videos

La entrada normal ya no es que el usuario deje a mano `brief.md` y `structure.md`. La entrada normal es:

```text
resumen por chat -> fila en video-queue.csv/xlsx -> pending/<slug>/ -> voz por escenas -> VPS -> R2
```

El usuario suele pasar por chat el tema, notas, estructura, oferta, CTA y restricciones. Codex lo convierte en una fila limpia de produccion en:

```text
content/video-queue/video-queue.csv
content/video-queue/video-queue.xlsx
```

Desde esa fila se crea o actualiza la carpeta `pending/<slug>/`.

Estructura principal:

```text
content/video-queue/
  video-queue.csv
  video-queue.xlsx
  queue.json
  pending/
    <slug>/
      brief.md
      structure.md
      visual-plan.md
      voiceover.scenes.json
  done/
  blocked/
```

Cada video nuevo entra en:

```text
content/video-queue/pending/<slug>/
```

Archivos por video:

- `brief.md`: tema, objetivo, audiencia, CTA y restricciones, normalmente derivado de la fila.
- `structure.md`: bloques o puntos que el usuario quiere cubrir, normalmente derivado de la fila.
- `visual-plan.md`: plan visual generado por Codex.
- `voiceover.scenes.json`: escenas para generar voz con ElevenLabs.

`queue.json` mantiene:

- `slug`
- `title`
- `status`
- `folder`
- `template`
- `duration_target_s`
- `persona`
- `outputs.content_folder`
- `outputs.project_folder`
- `outputs.audio_folder`
- `outputs.zip`
- `outputs.render`
- `outputs.preview`
- `notes`

Estados practicos:

```text
pending -> needs_review -> done
blocked si falta informacion o falla algo externo
```

No marcar como `done` hasta que el usuario apruebe el video final.

## Cola De Carruseles

El workspace tambien tiene un flujo para crear y programar carruseles de Instagram sin mezclarlo con la cola de videos.

Entrada normal:

```text
resumen por chat -> fila de carrusel -> carousel.json -> HTML/PNG -> R2 -> n8n
```

El usuario suele pasar por chat el tema, estructura, oferta, CTA y restricciones. Codex lo convierte en una fila compatible con:

```text
content/carousel-queue/carousel-queue.csv
content/carousel-queue/carousel-queue.xlsx
content/carousel-queue/carousel-queue-template.csv
content/carousel-queue/carousel-queue-template.xlsx
```

Estructura principal:

```text
content/carousel-queue/
  carousel-queue.csv
  carousel-queue.xlsx
  queue.json
  pending/
    <slug>/
      carousel.json
  done/
  blocked/
```

Salida generada:

```text
carousels/<slug>/
  slide-01.html
  slide-01.png
  ...
  manifest.json
```

Estilo visual por defecto:

```text
Editorial Moody Green & Electric Orange
```

Viene del proyecto:

```text
C:\Users\USUARIO\Downloads\experto-redes
```

Rasgos visuales:

- Formato `1080x1350` para Instagram carousel.
- Canvas HTML de `540x675` exportado con device scale `2`.
- Fondo verde bosque oscuro `#1A2B1E`.
- Texto principal blanco.
- Acento naranja electrico `#FF3B1D`.
- Titulares grandes con `Bebas Neue`.
- Frases editoriales con `Playfair Display Italic`.
- Etiquetas, datos y paginacion con `JetBrains Mono`.
- Footer fijo con `@crecimientosc`, `save for later`, numero de slide y flecha.

Comando para generar un carrusel desde un item pending:

```powershell
node scripts\build-social-carousel.mjs --slug <slug>
```

Comando para importar una fila CSV a `carousel.json`:

```powershell
node scripts\import-carousel-row.mjs --slug <slug>
```

Comando para subir las slides a R2 a traves de la VPS y programar el carrusel en n8n:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"
```

El script de programacion:

1. Lee `carousels/<slug>/manifest.json`.
2. Si no hay URLs publicas, sube las PNGs a la VPS por `scp`.
3. Dentro del contenedor `hyperframes-renderer`, usa `aws s3 cp` con la configuracion R2 ya existente.
4. Publica bajo el prefijo `carruseles instagram/<slug>/`.
5. Llama al webhook existente:

```text
POST https://n8n.urltovideo.es/webhook/instagram-carousel-schedule
```

Workflow n8n existente:

```text
name: programacion de carruseles
id: ZKD4lsnfQ4saTB9I
```

Estados practicos:

```text
pending -> generated -> scheduled -> done
blocked si falta informacion, falla R2 o falla n8n
```

## ElevenLabs

Se usa generacion por escenas, no un solo bloque largo.

Entrada:

```text
content/video-queue/pending/<slug>/voiceover.scenes.json
```

Salida:

```text
assets/character/audio/generated/<slug>/
  scene-01-*.mp3
  scene-02-*.mp3
  ...
  voiceover-master.mp3
  voiceover-timing.json
```

Comando base:

```powershell
node scripts\elevenlabs-generate-scenes.mjs --input content\video-queue\pending\<slug>\voiceover.scenes.json --out assets\character\audio\generated\<slug> --env ".env local"
```

Con regeneracion forzada:

```powershell
node scripts\elevenlabs-generate-scenes.mjs --input content\video-queue\pending\<slug>\voiceover.scenes.json --out assets\character\audio\generated\<slug> --env ".env local" --force
```

Notas:

- Revisar acentos y puntuacion antes de generar.
- Mantener el total entre `40s` y `60s`, idealmente cerca de `50s` si no hay una duracion mas concreta.
- Si sale demasiado largo, recortar texto por escena antes de rehacer la voz.
- No imprimir claves ni contenido sensible de `.env local`.

## Flujo Recomendado: Pipeline Remoto Completo

Para crear un draft desde un item pending, usar por defecto:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

Con plantilla Light Workshop:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template light-workshop
```

Este comando hace localmente solo lo minimo:

1. Valida que existen `voiceover.scenes.json`, `voiceover-master.mp3`, `voiceover-timing.json`, los GLB del narrador y el generador.
2. Crea un source bundle ZIP ligero en `%TEMP%`.
3. Sube el ZIP a `/opt/n8n/hyperframes_uploads/` por `scp`.
4. Llama a `https://n8n.urltovideo.es/webhook/hyperframes-build-render`.
5. Consulta `hyperframes-render-status` hasta que la VPS devuelve `downloadUrl`.

La carga pesada ocurre en la VPS:

```text
extract source bundle
node scripts/build-social-narrator-video.mjs --slug <slug>
npm run check -- --snapshots --timeout 60000
package renderable ZIP
render-hyperframes-job
R2 upload
```

Source bundle esperado:

```text
scripts/build-social-narrator-video.mjs
content/video-queue/pending/<slug>/
assets/character/Breathing-Idle.glb
assets/character/Talking.glb
assets/character/Happy-Hand-Gesture.glb
assets/character/Yelling.glb
assets/character/audio/generated/<slug>/
```

El job remoto escribe:

```text
/work/jobs/<jobId>/status.json
/work/jobs/<jobId>/render.log
/work/jobs/<jobId>/workspace/videos/<slug>/snapshots/
```

## Flujo Local Solo Para Preview O Debug

Usar build local solo cuando se quiera abrir Studio, inspeccionar HTML/CSS/JS, depurar una composicion o crear manualmente un ZIP renderizable.

Para crear el proyecto local desde un item pending:

```powershell
node scripts\build-social-narrator-video.mjs --slug <slug>
```

Proyecto generado:

```text
videos/<slug>/
  index.html
  package.json
  hyperframes.json
  voiceover-timing.json
  assets/
  compositions/
```

La plantilla actual es modular para evitar `composition_file_too_large`: `index.html` queda como orquestador ligero, `compositions/scene-*.html` contiene cada escena, y `assets/social-narrator.css`, `assets/main.js` y `assets/narrator.js` contienen estilo y logica compartida.

Validar:

```powershell
cd videos\<slug>
npm.cmd run check -- --snapshots --timeout 60000
```

Preview:

```powershell
npm.cmd run dev -- --port <puerto>
```

Antes de renderizar:

- Revisar hook.
- Revisar mitad del video.
- Revisar CTA.
- Confirmar que lo importante cae dentro de la zona segura.

## ZIP Renderizable Para Fallback Render-Only

El ZIP renderizable sigue existiendo como fallback cuando ya hay un proyecto local construido. No es el camino por defecto para nuevos drafts, porque obliga al PC a hacer build/check/snapshots.

El ZIP debe contener solo el proyecto renderizable, no todo el workspace.

Contenido esperado:

```text
index.html
package.json
hyperframes.json
voiceover-timing.json
assets/
compositions/
```

Ejemplo de salida local:

```text
<slug>.zip
```

No incluir:

- `node_modules`
- `.git`
- carpetas pesadas externas
- renders antiguos
- snapshots innecesarios

## Render Remoto Con n8n

VPS:

```text
72.61.161.99
```

Acceso operativo actual para subida desde este workspace:

```text
codex_tmp@72.61.161.99
C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa
```

Nota: `codex_tmp` se creo como usuario temporal para automatizar la subida por `scp`. Si este flujo pasa a produccion estable, conviene convertirlo en usuario de servicio con permisos mas limitados.

n8n:

```text
workflow name: HyperFrames Remote Render
workflow id: joMtzKbe3RQ5CAKH
workflow file: n8n/hyperframes-render-workflow.json
installer: scripts/install-n8n-hyperframes-workflow.mjs
patch full pipeline: scripts/patch-n8n-build-render-workflow.mjs
```

Endpoints:

```text
POST https://n8n.urltovideo.es/webhook/hyperframes-build-render
POST https://n8n.urltovideo.es/webhook/hyperframes-render
POST https://n8n.urltovideo.es/webhook/hyperframes-render-status
```

Cloudflare Access:

- n8n esta protegido por Cloudflare Access.
- Usar los service-token headers desde:

```text
C:\Users\USUARIO\Downloads\mcp-n8n\.env
```

No imprimir:

- `N8N_API_KEY`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Ruta de subida en host:

```text
/opt/n8n/hyperframes_uploads/
```

Ruta dentro del contenedor:

```text
/work/uploads/
```

Ruta de salida dentro del contenedor:

```text
/work/outputs/
```

Scripts remotos:

```text
/work/scripts/build-check-render-with-status.sh
/work/scripts/render-with-status.sh
/usr/local/bin/render-hyperframes-job
```

Flujo estable actual recomendado:

1. `scripts/trigger-n8n-build-render.mjs` crea y sube un source bundle.
2. Llama a `hyperframes-build-render` con `slug`, `sourceZipName`, `mode`, `template` opcional y `jobId`.
3. n8n lanza en background:

```text
/work/scripts/build-check-render-with-status.sh /work/uploads/<sourceZipName> <mode> <slug> <jobId> [template]
```

4. El wrapper remoto construye `videos/<slug>/`, ejecuta check/snapshots, crea el ZIP renderizable y delega el render final a `render-hyperframes-job`.
5. Consultar `hyperframes-render-status`, que lee `/work/jobs/<jobId>/status.json` en la VPS.
6. Guardar el `downloadUrl` en `queue.json`.

Flujo fallback render-only:

1. Crear ZIP local del proyecto.
2. Subirlo por `scp` a `/opt/n8n/hyperframes_uploads/`.
3. Llamar al webhook con `slug`, `zipName`, `mode` y opcionalmente `jobId`.
4. Guardar el `jobId`.
5. Consultar `hyperframes-render-status`, que ahora lee `/work/jobs/<jobId>/status.json` en la VPS.
6. Guardar el `downloadUrl` en `queue.json`.

El render webhook lanza en background:

```text
/work/scripts/render-with-status.sh /work/uploads/<slug>.zip <mode> <slug> <jobId>
```

Los wrappers escriben:

```text
/work/jobs/<jobId>/status.json
/work/jobs/<jobId>/render.log
```

El status webhook devuelve progreso real aproximado cuando HyperFrames lo publica en el log:

```json
{
  "status": "rendering",
  "step": "capture",
  "progress": 37,
  "lastLog": "37% Streaming frame 194/917"
}
```

Prueba verificada del pipeline completo:

```text
jobId: hfb-mito-domain-rating-seo-1787832976970
status: completed
downloadUrl: https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/hyperframes/drafts/mito-domain-rating-seo-20260827-121845.mp4
snapshotsDir: /work/jobs/hfb-mito-domain-rating-seo-1787832976970/workspace/videos/mito-domain-rating-seo/snapshots
```

Modo draft:

```text
mode=draft
HyperFrames: --quality draft --crf 26
```

Modo final/normal:

```text
mode=standard
HyperFrames: --quality standard --crf 23
```

No usar `high` por defecto.

## Problemas Encontrados Y Soluciones

### Studio y HTML estatico

El `index.html` del proyecto es la composicion renderizable. Studio puede mostrar una interfaz distinta, pero la descarga valida debe salir del render de HyperFrames, no de abrir el HTML como pagina estatica sin contexto.

### Save conflict

Error:

```text
Save conflict: index.html changed outside this Studio session
```

Causa:

- Studio abierto mientras Codex o terminal modifica `index.html`.

Solucion:

- Refrescar Studio.
- Evitar editar a la vez desde Studio y terminal.

### Composition file too large

Error:

```text
composition_file_too_large
```

Causa:

- El `index.html` monolitico acumulaba escenas, CSS, Three.js setup, timeline y datos en un solo archivo.

Solucion actual:

- Usar plantilla modular desde `scripts/build-social-narrator-video.mjs`.
- Mantener `index.html` como orquestador ligero.
- Mover escenas a `compositions/scene-*.html`.
- Mover CSS y JS compartidos a `assets/social-narrator.css`, `assets/main.js` y `assets/narrator.js`.
- Incluir siempre `compositions/` en el ZIP remoto.

### Composition insertion cycle

Error:

```text
Composition insertion would create a cycle
```

Causa:

- Insertar una composicion dentro de si misma.

Solucion:

- No arrastrar la composicion principal a su propia timeline.

### Export 503

Error:

```text
Export failed
Server error (503)
```

Solucion:

- Renderizar desde CLI o desde el flujo remoto.
- Revisar procesos Chrome/HyperFrames si quedan colgados.

### PowerShell y npx

Si PowerShell bloquea scripts `.ps1`, usar:

```powershell
npm.cmd
npx.cmd
```

### Upload directo a n8n

Intentos de subir ZIP directo al webhook dieron problemas:

- Escritura bloqueada por permisos del contenedor.
- Code node sin acceso a `require('fs')`.
- Upload por chunks via SSH no fue estable.

Solucion actual:

- Subir source bundle o ZIP renderizable por `scp`.
- Ejecutar n8n con `sourceZipName` para pipeline completo o `zipName` para render-only.

### SSH passphrase

Hubo una clave SSH con passphrase y `ssh-agent`, pero el flujo actual usa la clave temporal RSA:

```text
C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa
```

Estado:

- SSH funciona.
- `scp` funciona.
- Ya se puede operar con la VPS desde `codex_tmp@72.61.161.99`.

## Comandos Utiles

Lanzar pipeline remoto completo:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

Lanzar pipeline remoto completo con Light Workshop:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template light-workshop
```

Subir ZIP renderizable para fallback render-only:

```powershell
scp -i C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa .\<slug>.zip codex_tmp@72.61.161.99:/tmp/<slug>.zip
ssh -i C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa codex_tmp@72.61.161.99 "sudo install -m 644 /tmp/<slug>.zip /opt/n8n/hyperframes_uploads/<slug>.zip && rm -f /tmp/<slug>.zip"
```

Comprobar ZIP en VPS:

```powershell
ssh -i C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa codex_tmp@72.61.161.99 "cd /opt/n8n && sudo docker compose exec -T hyperframes-renderer sh -lc 'ls -lh /work/uploads/<slug>.zip && unzip -t /work/uploads/<slug>.zip'"
```

Ver outputs:

```powershell
ssh -i C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa codex_tmp@72.61.161.99 "cd /opt/n8n && sudo docker compose exec -T hyperframes-renderer sh -lc 'ls -lh /work/outputs'"
```

Render directo dentro del contenedor, solo para pruebas:

```powershell
ssh -i C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa codex_tmp@72.61.161.99 "cd /opt/n8n && sudo docker compose exec -T hyperframes-renderer render-hyperframes-job /work/uploads/<slug>.zip draft <slug>"
```

Instalar o actualizar workflow n8n desde el repo:

```powershell
node scripts\install-n8n-hyperframes-workflow.mjs
```

## Ultima Prueba Remota Completa

Video:

```text
mito-domain-rating-seo
```

Source bundle:

```text
hfb-mito-domain-rating-seo-1787832976970-source.zip
```

Subido a:

```text
/opt/n8n/hyperframes_uploads/hfb-mito-domain-rating-seo-1787832976970-source.zip
```

n8n respondio:

```json
{
  "jobId": "hfb-mito-domain-rating-seo-1787832976970",
  "status": "processing",
  "stage": "accepted",
  "slug": "mito-domain-rating-seo",
  "mode": "draft"
}
```

Estado final:

```json
{
  "status": "completed",
  "stage": "done",
  "step": "done",
  "message": "Build, check, snapshots y render completados",
  "mode": "draft",
  "downloadUrl": "https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev/hyperframes/drafts/mito-domain-rating-seo-20260827-121845.mp4"
}
```

El job remoto dejo snapshots en:

```text
/work/jobs/hfb-mito-domain-rating-seo-1787832976970/workspace/videos/mito-domain-rating-seo/snapshots
```

## Siguiente Paso Natural

El flujo normal para el siguiente contenido es:

1. Recibir el resumen por chat.
2. Convertirlo en fila de `video-queue.csv/xlsx` o en fila de carrusel.
3. Crear o actualizar la carpeta `pending/<slug>/`.
4. Para video: generar/ajustar `visual-plan.md`, `voiceover.scenes.json`, voz ElevenLabs y lanzar `node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft`.
5. Para carrusel: generar `carousel.json`, construir PNGs con `node scripts\build-social-carousel.mjs --slug <slug>` y programar con `node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"`.
6. Revisar la URL devuelta por R2/n8n.
7. Dejar videos como `needs_review` hasta aprobacion; dejar carruseles como `scheduled` cuando queden programados.
