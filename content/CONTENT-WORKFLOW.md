# Content Workflow

Esta es la guia principal para convertir ideas en piezas publicables dentro de HyperFrames.

## Idea General

El flujo normal empieza en el chat, no en archivos sueltos:

```text
resumen por chat -> hoja CSV/XLSX -> carpeta pending -> generador -> revision -> publicacion
```

El usuario suele pasar por chat:

- Tema.
- Notas o contexto.
- Estructura deseada.
- Oferta.
- CTA, si aporta algo al video.
- Tono.
- Restricciones o cosas a evitar.

Codex convierte ese material en una fila limpia de produccion y desde ahi genera los archivos necesarios.

## Donde Va Cada Cosa

Videos:

```text
content/video-queue/
  video-queue.csv
  video-queue.xlsx
  queue.json
  pending/<slug>/
```

Carruseles:

```text
content/carousel-queue/
  carousel-queue.csv
  carousel-queue.xlsx
  queue.json
  pending/<slug>/
```

Los CSV/XLSX son el tablero de planificacion. Las carpetas `pending/<slug>/` son paquetes de trabajo generados desde ese tablero.

## Flujo Para Videos

1. El usuario envia el resumen por chat. Si contiene temas independientes, Codex propone el despiece y espera la eleccion antes de producir el guion o crear el paquete del video.
2. Con el alcance decidido, Codex crea o actualiza la fila en `content/video-queue/video-queue.csv` y, si procede, `video-queue.xlsx`.
3. Codex lee `SCRIPT-EDITORIAL-GUIDE.md`, aplica despues la persona de tono, escribe primero el guion continuo y lo divide en escenas siguiendo el proceso editorial de abajo. Crea o actualiza:

```text
content/video-queue/pending/<slug>/
  brief.md
  structure.md
  visual-plan.md
  voiceover.scenes.json
```

4. Codex genera o revisa la voz por escenas con ElevenLabs.
5. Codex lanza el pipeline remoto en VPS:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

6. La VPS hace build, check, snapshots, render y subida a R2.
7. El video queda como `needs_review`.
8. Solo pasa a `done` cuando el usuario aprueba el resultado final.

Cuando el usuario apruebe publicar o programar un Reel:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook
```

Usar `--dry-run` para revisar el payload sin encolar nada en n8n.

Plantillas de video:

- `dark-tech`: plantilla tecnica oscura con narrador 3D; opcion por defecto.
- `light-workshop`: plantilla clara/editorial con narrador 3D y paneles tipo documento.
- `data-lab`: plantilla sin personaje 3D para SEO, SEM, marketing y analitica; usa SERPs, dashboards, mapas de keywords, funnels, comparativas, checklists, timelines y CTA.

Personas de guion:

- `dark-tech` y `light-workshop`: usar `assets/character/personas/main-narrator.md` salvo indicacion contraria. Voz directa, sarcastica y canalla.
- `data-lab`: usar `assets/character/personas/social-retention-teacher.md` salvo indicacion contraria. Voz de experto cercano, claro y natural; ironia ligera opcional, sin chistes obligatorios ni palabrotas por defecto. El gancho inicial da un motivo concreto para seguir viendo, sin forzar frases impactantes durante todo el video.
- Al convertir chat o NotebookLM a `voiceover.scenes.json`, aplicar la persona antes de generar ElevenLabs. ElevenLabs solo lee el texto final de cada escena.
- Para nuevos videos, fijar `elevenlabs.voice_id` a `RwzBDEn5f6FIgpAjH9YN`, salvo que el usuario elija otra voz para ese video. El ID de voz elige el timbre de ElevenLabs; el archivo de persona define como escribir el guion. La opcion `--voice` del generador permite una prueba puntual.

Para lanzar `data-lab` en remoto:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template data-lab
```

## Guion Antes De Escenas

Aplicar este proceso al escribir manualmente desde el chat, siguiendo `SCRIPT-EDITORIAL-GUIDE.md` antes de la persona. Summary Intake tiene su propio contrato y permanece inactivo. La voz de `data-lab` vive en `assets/character/personas/social-retention-teacher.md`; las otras plantillas conservan su propia personalidad.

1. Elegir una audiencia, una pregunta central y una respuesta util. Si las notas mezclan temas independientes, proponer al usuario el despiece y esperar su eleccion antes de redactar; conservar lo pendiente.
2. Preparar tres aperturas internamente y elegir la que nombra el tema, plantea una pregunta concreta y da un motivo creible para quedarse. La primera toma debe dar contexto visual sin sustituir el contexto hablado.
3. Redactar una narracion continua: situacion y pregunta, primera respuesta temprana, contexto suficiente para entender el ejemplo, explicacion de como funciona, resultado y cierre. Ajustar la duracion a lo que la explicacion necesita; no ocultar la respuesta hasta el final.
4. Revisar como suena al hablar sin apoyo visual: repetir el sustantivo necesario en cambios de frase o escena para aclarar referencias, quitar relleno, falsas polemicas, salvedades redundantes y frases impactantes sin funcion, comprobar que el ejemplo sostiene la idea y que el cierre responde la pregunta inicial.
5. Dividir despues en escenas conectadas, cada una con un visual dominante. Usar 4-7 como referencia cuando encaje con la explicacion, sin forzar una escena por cada tiempo narrativo. No repetir una miniclase completa en cada escena.
6. Anadir CTA solo si ayuda al objetivo. Dejarlo vacio si basta una conclusion. No inventar recursos descargables, ofertas ni solicitudes de comentarios.

Las notas de produccion van en `visual-plan.md`. En `data-lab`, `visual_note` se muestra en pantalla: debe contener texto breve para el espectador, no instrucciones de montaje.

Para evaluar el cambio, comparar videos de duracion y tema similares usando retencion inicial, tiempo medio de visualizacion y porcentaje completado cuando la plataforma los ofrezca. Registrar tambien el gancho utilizado. No atribuir una mejora al guion sin datos; esta revision no incluye una integracion nueva de analitica.

## n8n Summary Intake V1

The user pastes only `summary` in n8n. AI derives the data-lab structure,
scripts validate JSON, the VPS renders a draft, and the item stays
`needs_review` until an approval webhook is called.

Current workflow:

```text
name: HyperFrames Content Intake
id: eXLSEY7Fzg0kGBit
status: inactive until explicit activation
```

Production path:

```text
summary -> Gemini JSON -> ai-video-intake-schema validation -> pending package
-> ElevenLabs scenes -> data-lab render -> queue item needs_review
```

VPS runtime:

```text
/opt/n8n/hyperframes mounted as /work inside n8n-hyperframes-renderer
```

The workflow must use Docker for Node scripts. Do not depend on Node/npm being
installed on the VPS host.

Operational docs:

- `docs/workflows/eXLSEY7Fzg0kGBit.md`
- `docs/runbooks/summary-intake-vps-runtime.md`

## Flujo Para Carruseles

1. El usuario envia el resumen por chat.
2. Codex crea o actualiza la fila en `content/carousel-queue/carousel-queue.csv` y, si procede, `carousel-queue.xlsx`.
3. Codex importa la fila a:

```text
content/carousel-queue/pending/<slug>/carousel.json
```

4. Codex genera HTML y PNGs:

```powershell
node scripts\build-social-carousel.mjs --slug <slug>
```

5. Codex sube las slides a R2 por VPS y programa el carrusel en n8n:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"
```

6. El carrusel queda como `scheduled` cuando n8n acepta la programacion.

## Estados

Usar estos estados en hojas y colas:

- `pending`: listo para producir.
- `in_progress`: se esta trabajando.
- `generated`: assets generados, pero aun no publicados o programados.
- `needs_review`: draft listo para revision.
- `needs_revision`: draft rechazado o con cambios pedidos; requiere ajuste antes de volver a revision.
- `scheduled`: contenido programado en n8n.
- `done`: contenido aprobado o publicado.
- `blocked`: falta informacion, credencial, asset, aprobacion o ha fallado un servicio externo.

## Como Elegir Formato

Usar video cuando:

- La idea necesita voz, ritmo, movimiento o narrador.
- Hay una explicacion secuencial cuya duracion se ajusta al contexto necesario.
- Queremos Reels, TikTok o Shorts.

Usar carrusel cuando:

- La idea funciona como checklist, lista, mini-framework o antes/despues.
- Queremos que el usuario guarde el contenido.
- El valor esta en leer y consultar, no en escuchar.

Si una idea tiene buen gancho y buenos pasos, puede convertirse en ambos: video corto para alcance y carrusel para guardados.

## Reglas Editoriales

- Mantener tono directo, relajado y util.
- Usar tono canalla/sarcastico solo cuando la persona del video lo pida.
- En `data-lab`, usar cercania, ejemplos concretos y una postura razonada; la ironia ligera es opcional.
- Evitar lenguaje corporativo vacio.
- No prometer resultados garantizados.
- No atacar personas, clientes concretos ni grupos protegidos.
- Usar ejemplos concretos siempre que sea posible.
- Mantener una sola idea fuerte por pieza.

## Reglas De Organizacion

- No editar a mano outputs generados salvo para una correccion puntual.
- No mover a `done` sin aprobacion.
- No mezclar cola de videos y cola de carruseles.
- No imprimir secretos de `.env`, tokens ni claves.
- Actualizar `queue.json` y la hoja correspondiente cuando cambie el estado real.

## Archivos De Referencia

- `content/video-queue/README.md`: detalles del flujo de videos.
- `content/carousel-queue/README.md`: detalles del flujo de carruseles.
- `content/SOCIAL-PUBLISHING.md`: publicacion, R2, n8n y plataformas.
- `AGENTS.md`: reglas operativas para futuras sesiones de Codex.
- `handoff.md`: estado historico y operativo del proyecto.
