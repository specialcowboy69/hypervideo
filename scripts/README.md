# Scripts

## Normal production intake

For recurring content, the user usually sends the raw brief in chat. Codex then turns it into the matching queue row before creating build files.

Video planning files:

```text
content/video-queue/video-queue.csv
content/video-queue/video-queue.xlsx
```

Carousel planning files:

```text
content/carousel-queue/carousel-queue.csv
content/carousel-queue/carousel-queue.xlsx
content/carousel-queue/carousel-queue-template.csv
content/carousel-queue/carousel-queue-template.xlsx
```

Videos become `content/video-queue/pending/<slug>/` source folders. Carousels become `content/carousel-queue/pending/<slug>/carousel.json`.

## ElevenLabs scene generation

Generate scene audio:

```powershell
node scripts\elevenlabs-generate-scenes.mjs --input content\video-queue\pending\<slug>\voiceover.scenes.json --out assets\character\audio\generated\<slug> --env ".env local"
```

Outputs:

```text
assets/character/audio/generated/<slug>/
  scene-01-hook.mp3
  scene-02-problem.mp3
  ...
  voiceover-master.mp3
  voiceover-timing.json
  alignment.json
  generation-state.json
```

## Instagram carousel generation

Import one row from a carousel CSV:

```powershell
node scripts\import-carousel-row.mjs --slug <slug>
```

Create carousel PNG slides from a pending structured item:

```powershell
node scripts\build-social-carousel.mjs --slug <slug>
```

Input:

```text
content/carousel-queue/pending/<slug>/carousel.json
```

Output:

```text
carousels/<slug>/
  slide-01.html
  slide-01.png
  ...
  manifest.json
```

Schedule the generated carousel through the existing n8n carousel workflow:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"
```

The schedule script uploads PNGs to R2 through the VPS if the manifest does not already contain public `image_url` values.

## Summary Intake Data Lab workflow

Patch the n8n Summary Intake workflow only when the workflow itself changes:
prompt text, JSON schema, node code, Docker command shape, webhook behavior, or
review/publication logic.

```powershell
node scripts\patch-summary-intake-vps-runtime.mjs
```

The patch targets workflow `eXLSEY7Fzg0kGBit`, writes a backup under
`n8n/backups/`, and keeps the workflow using the VPS Docker runtime:

```text
/opt/n8n/hyperframes -> /work inside n8n-hyperframes-renderer
```

For template-only or builder-only changes, such as improving `data-lab` CSS,
stage renderers, animation, subtitle placement, or package scripts, do not
patch n8n. Deploy the updated runtime files to `/opt/n8n/hyperframes` and run
the Docker smoke checks from `docs/runbooks/summary-intake-vps-runtime.md`.

Run the Summary Intake pipeline manually from a prepared AI JSON file:

```powershell
node scripts\run-data-lab-video-pipeline.mjs --input path\to\ai-output.json
```

On the VPS, the same script is run inside Docker with `.env.n8n` and
`--vps-local`.

Review a generated item:

```powershell
node scripts\review-video-job.mjs --slug <slug> --action reject --reason "Cambios solicitados"
```

Preview approval scheduling without enqueueing a real Reel:

```powershell
node scripts\review-video-job.mjs --slug <slug> --action approve --caption "Texto" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram --dry-run
```

See also:

- `docs/workflows/eXLSEY7Fzg0kGBit.md`
- `docs/runbooks/summary-intake-vps-runtime.md`
