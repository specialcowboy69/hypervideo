# Carousel Queue

Use this folder as the source of truth for Instagram carousel work.

## Normal Workflow

The usual workflow is:

```text
chat brief -> carousel spreadsheet row -> carousel.json -> HTML/PNG slides -> R2 upload -> n8n schedule
```

In practice:

1. The user sends the carousel topic, structure, offer, CTA, and constraints in chat.
2. Codex translates that into the carousel spreadsheet format.
3. Codex imports the row into `pending/<slug>/carousel.json`.
4. `build-social-carousel.mjs` generates HTML and PNG slides.
5. `schedule-instagram-carousel.mjs` uploads the PNGs to R2 through the VPS and schedules the post in n8n.

Spreadsheet files:

```text
content/carousel-queue/carousel-queue.csv
content/carousel-queue/carousel-queue.xlsx
content/carousel-queue/carousel-queue-template.csv
content/carousel-queue/carousel-queue-template.xlsx
```

## Folder Layout

```text
content/carousel-queue/
  queue.json
  carousel-queue.csv
  carousel-queue.xlsx
  pending/
    <slug>/
      carousel.json
  done/
  blocked/
```

Generated output goes to:

```text
carousels/<slug>/
  slide-01.html
  slide-01.png
  ...
  manifest.json
```

## Default Visual Style

The default carousel style is imported from `C:\Users\USUARIO\Downloads\experto-redes`:

- Name: `Editorial Moody Green & Electric Orange`.
- Format: Instagram 4:5, exported as `1080x1350`.
- Design canvas: `540x675` CSS pixels, captured at device scale `2`.
- Background: deep forest green `#1A2B1E`.
- Main text: white `#FFFFFF`.
- Accent: electric orange `#FF3B1D`.
- Display font: `Bebas Neue`.
- Editorial font: `Playfair Display Italic`.
- Technical font: `JetBrains Mono`.
- Footer: handle, save prompt, slide number, swipe cue.

## Commands

Import from the live carousel queue:

```powershell
node scripts\import-carousel-row.mjs --slug <slug>
```

Import one CSV row from the template into the pending queue:

```powershell
node scripts\import-carousel-row.mjs --csv content\carousel-queue\carousel-queue-template.csv --slug ejemplo-carrusel
```

Preview the import without creating files:

```powershell
node scripts\import-carousel-row.mjs --csv content\carousel-queue\carousel-queue-template.csv --slug ejemplo-carrusel --dry-run
```

Build PNGs from a pending item:

```powershell
node scripts\build-social-carousel.mjs --slug <slug>
```

Build only HTML files:

```powershell
node scripts\build-social-carousel.mjs --slug <slug> --html-only
```

Upload generated PNGs to R2 through the VPS and schedule the carousel in n8n:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "2026-09-02T10:00:00+02:00"
```

Preview the payload without uploading or scheduling:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --dry-run --no-upload
```

## Lifecycle

```text
pending -> generated -> scheduled -> done
blocked if input, upload, or n8n publication fails
```

Keep carousel posts separate from videos. Reels use `content/video-queue/`; carousels use `content/carousel-queue/`.
