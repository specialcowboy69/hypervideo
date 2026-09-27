# ChatGPT Project Context

Lee este archivo primero cuando abras este repositorio desde ChatGPT web.
Resume como esta organizado HyperFrames y que decisiones operativas no debes
romper.

## Que Es Este Proyecto

HyperFrames es un sistema interno para producir contenido social:

- Videos verticales para Instagram Reels, Facebook Reels, TikTok y Shorts.
- Videos explicativos `data-lab` sin personaje 3D.
- Videos con narrador 3D en plantillas `dark-tech` y `light-workshop`.
- Carruseles de Instagram.
- Flujos de generacion, revision y publicacion conectados con VPS, n8n, R2,
  ElevenLabs y Meta.

El objetivo habitual es que el usuario pegue un resumen en chat o n8n, y que el
proyecto lo convierta en una pieza lista para revisar antes de publicar.

## Documentos Que Debes Leer

Orden recomendado:

1. `AGENTS.md`
2. `README.md`
3. `content/CONTENT-WORKFLOW.md`
4. `content/video-queue/README.md`
5. `content/carousel-queue/README.md`
6. `content/SOCIAL-PUBLISHING.md`
7. `docs/index.md`
8. `docs/runbooks/summary-intake-vps-runtime.md`

Si trabajas con el workflow de n8n Summary Intake, lee tambien:

- `docs/workflows/eXLSEY7Fzg0kGBit.md`

## Flujo Principal De Videos

El flujo normal no empieza editando outputs a mano. Empieza con una idea o
resumen:

```text
chat o n8n summary -> CSV/XLSX -> pending/<slug> -> voiceover.scenes.json
-> ElevenLabs -> VPS/n8n build/check/snapshots/render -> R2 -> review
-> publicacion solo tras aprobacion
```

Fuente de verdad para videos:

```text
content/video-queue/
  video-queue.csv
  video-queue.xlsx
  queue.json
  pending/<slug>/
```

Cada video pendiente debe tener, como minimo:

```text
content/video-queue/pending/<slug>/
  brief.md
  structure.md
  visual-plan.md
  voiceover.scenes.json
```

Los renders generados deben quedar en `needs_review` hasta que el usuario los
apruebe explicitamente.

## Flujo Principal De Carruseles

Fuente de verdad para carruseles:

```text
content/carousel-queue/
  carousel-queue.csv
  carousel-queue.xlsx
  queue.json
  pending/<slug>/carousel.json
```

El carrusel se genera desde `carousel.json`, exporta slides HTML/PNG y se
programa por el workflow de n8n de carruseles. No mezcles el flujo de
carruseles con el de Reels salvo que el usuario lo pida claramente.

## Plantillas De Video

`dark-tech`

- Plantilla oscura tecnica.
- Usa personaje 3D.
- Persona por defecto: `assets/character/personas/main-narrator.md`.
- Tono directo, sarcastico y canalla.

`light-workshop`

- Plantilla clara/editorial.
- Usa personaje 3D.
- Persona por defecto: `assets/character/personas/main-narrator.md`.

`data-lab`

- Plantilla sin personaje 3D.
- Pensada para SEO, SEM, marketing, analitica, dashboards y explicaciones
  visuales.
- Persona por defecto:
  `assets/character/personas/social-retention-teacher.md`.
- Voz de experto cercano, directo e incisivo; ironia ligera opcional y sin palabrotas por defecto. Escribir primero el guion continuo, elegir entre tres ganchos y despues dividir en 4-7 escenas. Cierre util con CTA opcional; no inventar ofertas.
- Usa graficos grandes: SERPs, dashboards, keyword maps, funnels, comparativas,
  checklists, timelines y CTA.

## Comandos Frecuentes

Generar voz por escenas:

```powershell
node scripts\elevenlabs-generate-scenes.mjs --input content\video-queue\pending\<slug>\voiceover.scenes.json --out assets\character\audio\generated\<slug> --env ".env local"
```

Lanzar build/render remoto por VPS y n8n:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

Lanzar `data-lab` remoto:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template data-lab
```

Programar Reel solo tras aprobacion:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook
```

Usa `--dry-run` cuando quieras revisar payloads sin publicar ni programar nada.

## Reglas Criticas

- No publiques ni programes contenido sin aprobacion explicita del usuario.
- No muevas un item a `done` si solo esta renderizado; primero debe estar
  aprobado.
- No imprimas secretos, tokens, claves de API ni valores de `.env`.
- No subas al repo videos generados, audios generados, ZIPs, renders,
  snapshots, backups de n8n ni estado local de herramientas.
- Usa el VPS/n8n para build, check, snapshots y render por defecto.
- Manten los videos verticales dentro del safe area social definido en
  `AGENTS.md`.
- Para cambios de workflow n8n, conserva credenciales y haz backup antes de
  aplicar patches.
- Para pruebas de publicacion, usa dry-run o validacion estructural; no ejecutes
  publicaciones reales solo para probar.

## Archivos Y Carpetas Que No Son Fuente

Estos elementos se ignoran a proposito y no deben pedirse como parte normal del
repo:

```text
.env
.env local
.agents/
.codex-debug/
.superpowers/
assets/character/audio/generated/
videos/
carousels/
renders/
snapshots/
n8n/backups/
*.zip
*.mp3
*.mp4
```

Si necesitas un video ya renderizado, buscalo en la cola (`queue.json`) o en la
URL publica de R2 registrada por el flujo. No intentes reconstruir el repo a
partir de outputs pesados.

## Como Ayudar Al Usuario

Cuando el usuario te pase un resumen:

1. Decide si conviene video, carrusel o ambos.
2. Si es video, crea o actualiza la fila en `content/video-queue/`.
3. Genera el paquete `pending/<slug>/`.
4. Asegurate de que `voiceover.scenes.json` aplica la persona correcta.
5. Genera voz por escenas si procede.
6. Lanza render remoto en modo draft.
7. Deja el resultado en `needs_review`.
8. Solo publica o programa si el usuario aprueba.

Cuando el usuario pregunte "que hacemos ahora", revisa primero `queue.json`,
los `pending/` y los documentos de workflow antes de asumir el estado.
