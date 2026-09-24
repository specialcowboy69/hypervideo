# Content Workspace

This folder stores the structured source material for social videos and Instagram carousels before they become rendered media.

## Normal Intake

The normal workflow is chat first:

1. The user sends the topic, notes, structure, offer, CTA, and constraints in the Codex chat.
2. Codex translates that raw brief into the matching spreadsheet row.
3. Codex creates or updates the pending source files from that row.
4. The appropriate generator builds the video or carousel assets.
5. Remote render, upload, and scheduling happen through the VPS and n8n when needed.

The spreadsheets are the easiest place to keep production organized:

```text
content/video-queue/video-queue.csv
content/video-queue/video-queue.xlsx
content/carousel-queue/carousel-queue.csv
content/carousel-queue/carousel-queue.xlsx
content/carousel-queue/carousel-queue-template.csv
content/carousel-queue/carousel-queue-template.xlsx
```

High-level guides:

```text
content/CONTENT-WORKFLOW.md
content/SOCIAL-PUBLISHING.md
```

## Videos

Use `content/video-queue/` for Reels, TikTok, and Shorts.

Primary tracking files:

```text
content/video-queue/
  video-queue.csv
  video-queue.xlsx
  queue.json
  pending/
  done/
  blocked/
```

For each video that is ready to produce, Codex creates:

```text
content/video-queue/pending/<slug>/
  brief.md
  structure.md
  visual-plan.md
  voiceover.scenes.json
```

The renderable HyperFrames project lives separately under:

```text
videos/<slug>/
```

## Carousels

Use `content/carousel-queue/` for static Instagram carousels.

Primary tracking files:

```text
content/carousel-queue/
  carousel-queue.csv
  carousel-queue.xlsx
  queue.json
  pending/
  done/
  blocked/
```

For each carousel that is ready to produce, Codex creates:

```text
content/carousel-queue/pending/<slug>/
  carousel.json
```

Generated carousel output lives under:

```text
carousels/<slug>/
```

## Shared Assets

Keep reusable character, voice, and animation assets under:

```text
assets/character/
```
