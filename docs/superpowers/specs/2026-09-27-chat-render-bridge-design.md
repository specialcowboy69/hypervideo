# Puente ChatGPT → GitHub → VPS para HyperFrames

Fecha: 2026-09-27
Estado: diseño para revisión

## Objetivo

Poder pedir un vídeo completo en ChatGPT, preparar sus archivos de producción en el repositorio y lanzar automáticamente un render de borrador con el pipeline remoto existente. La URL de R2 se devuelve para revisión. Publicar o programar sigue siendo una acción distinta que requiere aprobación expresa.

Se mantiene el flujo manual descrito en AGENTS.md y content/CONTENT-WORKFLOW.md. El workflow de Summary Intake no interviene.

## Alcance y decisiones

- La solicitud «crea un vídeo completo» autoriza la generación de voz y un render draft después de preparar y validar el paquete; no exige un segundo «renderízalo».
- La primera prueba de la integración solo valida un paquete de ejemplo. No consume ElevenLabs, no envía un render y no publica.
- Se procesará un render cada vez, como exige la cola actual.
- Los materiales de producción viven en GitHub; audio, ZIP, capturas y MP4 siguen fuera del repositorio.
- El resultado de cada job se refleja en content/video-queue/queue.json y en la hoja CSV de la cola, sin sobrescribir cambios no relacionados.

## Arquitectura

1. ChatGPT prepara en GitHub la fila de vídeo y content/video-queue/pending/<slug>/ con brief.md, structure.md, visual-plan.md y voiceover.scenes.json. Usa una rama de trabajo y solo solicita ejecución para una revisión concreta de código ya integrada en main.
2. ChatGPT crea una incidencia de solicitud con un slug y SHA de commit, y aplica la etiqueta hyperframes:validate o hyperframes:render-draft. Un workflow de GitHub Actions se activa únicamente al aplicar una de esas etiquetas. El disparo por etiqueta permite operarlo con la conexión de GitHub disponible en este chat, sin acceso directo desde esta consola a n8n.
3. El job de validación verifica autor de la solicitud, etiqueta, slug, SHA que pertenece a main, presencia de los cuatro archivos, JSON de escenas, plantilla y assets necesarios. Rechaza comandos, rutas arbitrarias y entradas duplicadas. La validación no dispone de secretos de producción.
4. El job de render solo arranca con hyperframes:render-draft, tras la validación y con exclusión mutua. Una Action conecta por SSH con un usuario restringido en la VPS y ejecuta un comando fijo, pasando el slug y SHA validados como argumentos. El proyecto se prepara en la VPS desde ese commit, sin sobrescribir secretos ni otros trabajos.
5. Dentro del contenedor n8n-hyperframes-renderer de la VPS, un pequeño coordinador genera voz por escenas con scripts/elevenlabs-generate-scenes.mjs y llama a scripts/trigger-n8n-build-render.mjs con --vps-local --mode draft y la plantilla del paquete. Este script crea el ZIP en la carpeta de uploads local, invoca el webhook hyperframes-build-render, sondea el estado y obtiene la URL R2.
6. Al completar el job, el coordinador actualiza únicamente el ítem correspondiente de queue.json y video-queue.csv a needs_review, con jobId y URL del render; publica esos datos en la incidencia y sincroniza el cambio de estado con GitHub. Los fallos quedan como blocked o needs_revision según su causa, con un mensaje útil y sin URL ficticia.

## Credenciales y límites

- ElevenLabs y Cloudflare Access permanecen en los ficheros de entorno de la VPS, nunca en GitHub ni en el chat.
- Se crea una clave SSH exclusiva para la Action, con usuario y comandos limitados; su parte privada se almacena como secreto de GitHub Actions. No reutilizar la clave personal del PC.
- El workflow utiliza permisos mínimos y no interpola directamente texto de la incidencia en comandos shell. La VPS vuelve a validar slug y SHA.
- No se llama a scripts/schedule-instagram-reel.mjs ni a los webhooks de aprobación desde el puente. Un render terminado nunca implica permiso de publicación.
- No se activa el Summary Intake para este trabajo.

## Contratos de estado

- Validación satisfactoria: solicitud marcada como validada, sin audio ni render generado y sin cambio a needs_review.
- Render iniciado: in_progress con identificador de job, una sola ejecución activa.
- Render terminado: needs_review, outputs.render con URL R2 válida, jobId registrado.
- Error: motivo visible en la incidencia y estado blocked; los reintentos requieren un nuevo disparo explícito y conservan el historial.
- Aprobación del MP4: proceso separado y explícito, conforme a content/SOCIAL-PUBLISHING.md.

## Entrega incremental y verificaciones

1. Añadir validador local y workflow de etiqueta hyperframes:validate. Probar slug válido, rutas inválidas, JSON incompleto, duplicados y ausencia de llamadas externas. Este es el primer hito, sin secretos.
2. Preparar el usuario SSH restringido, el secreto en Actions y el coordinador de VPS. Hacer una prueba de conexión que no genere voz ni render.
3. Integrar voz y render draft, comprobar que el archivo ZIP se sube por la ruta local y que n8n devuelve un jobId. Probar un único vídeo controlado y verificar MP4, URL R2 y estado needs_review.
4. Probar error, reintento e idempotencia. Verificar que ninguna fase invoca programación o publicación.
5. Documentar operación y recuperación sin añadir outputs generados al repositorio.

## Dependencias antes del hito de render

Confirmar en la VPS el checkout del proyecto, los mounts del contenedor, disponibilidad de .env local y .env.n8n sin mostrar sus valores, acceso del usuario restringido, y el estado operativo real del workflow HyperFrames Remote Render. La documentación del repositorio describe estos elementos, pero esta sesión todavía no ha verificado la VPS en vivo.
