# Pizarra SEO y AEO, versión 3

Nueva versión del prototipo autónomo `seo-aeo-pizarra-v2`, basada en la guía editorial vigente y en el guion corregido con el usuario. Abre con el problema general de un negocio visible en Google que no aparece recomendado por una IA. Presenta SEO y AEO antes del ejemplo; establece la consulta del dueño del restaurante antes de evaluar la página del programa. Los PDF y los datos de entrenamiento permanecen como tema independiente.

Ocho escenas con el estilo de pizarra existente. Subtítulos por frases sincronizados con la locución; los cortes siguen el audio real. Duración: 92,8 segundos, vertical 1080 × 1920. Voz de ElevenLabs `RwzBDEn5f6FIgpAjH9YN`, modelo `eleven_multilingual_v2`.

## Archivos

- `guion.md`: narración utilizada, continua y completa.
- `index.html`: composición, gráficos y subtítulos temporizados.
- `captions.json`: frases y tiempos de los subtítulos.
- `voice.words.json`: alineación de palabras de la toma, con correcciones de transcripción.
- `voiceover-timing.json`: cortes de escena y duración.
- `assets/voice.mp3`: toma de producción, ignorada por Git.

Este experimento conserva la ruta autónoma de la pizarra anterior; no está integrado en el constructor `data-lab` ni en la cola manual de la VPS. Su revisión se hace con el MP4 entregado. No dispara publicación ni Summary Intake.

## Reproducir

Instalar GSAP con `npm install` y colocar la locución correspondiente en `assets/voice.mp3`. La toma original se generó en el flujo de ElevenLabs `DFsw9Gm51cqO4AJ76Bt6` (generación `nnJYWepXfnDc5WTYcc5q`). SHA-256 del audio: `0d26850eeb462232810066bc14149863149d5032563302953f98c5e2e088c791`.

Si se genera otra toma desde `guion.md`, volver a alinear los subtítulos y los cortes antes de renderizar: los tiempos de esta versión corresponden al audio original.

```sh
npm run check -- --snapshots --timeout 60000
npx --yes hyperframes@0.8.91 preview
npm run render:draft -- --output seo-aeo-pizarra-v3.mp4
```

`npm run render` usa calidad estándar y CRF 23; el borrador utiliza CRF 26. Se puede indicar un Chrome instalado mediante `HYPERFRAMES_BROWSER_PATH`.

## Revisión

Comprobar la apertura, comparación, pregunta del restaurante, evaluación de la página, demostración y cierre: 4, 18, 39, 50, 64, 71 y 90 segundos. El texto esencial queda dentro de x=96–860 e y=220–1380. HyperFrames no detecta errores de ejecución, disposición ni movimiento; 36/36 comprobaciones de contraste pasan. Quedan avisos de estructura por conservar la composición autónoma con sus escenas y subtítulos en un solo HTML.
