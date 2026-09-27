# Video Queue

Use this folder as the source of truth for recurring social video work.

## Normal Workflow

The usual workflow is:

```text
chat brief -> video-queue CSV/XLSX row -> pending source files -> scene voiceover -> VPS build/check/snapshots/render -> review URL
```

In practice:

1. The user sends the video topic, notes, structure, offer, CTA, and constraints in chat.
2. Codex rewrites that into a clean production row in `video-queue.csv` / `video-queue.xlsx`.
3. Codex chooses one of three internal hooks, writes and tightens one continuous script, then splits it into 4-7 connected scenes and creates or updates `pending/<slug>/` from the row.
4. Codex generates `visual-plan.md` and `voiceover.scenes.json` when missing.
5. ElevenLabs creates scene audio.
6. The VPS pipeline builds, checks, snapshots, renders, and uploads the draft.
7. The item stays as `needs_review` until the user approves it.

## AI Summary Intake

For n8n V1 summary intake, the user only fills a `summary` field. The AI node
must receive both `assets/character/personas/social-retention-teacher.md` and
`content/video-queue/ai-intake-prompt.md`, then return strict JSON. Regenerate the
local export with `node scripts/sync-summary-intake-prompt.mjs` when either
source changes; updating the live workflow is a separate deployment step. The
JSON is validated by `scripts/ai-video-intake-schema.mjs` before voiceover,
render, or publication.

Current workflow:

```text
name: HyperFrames Content Intake
id: eXLSEY7Fzg0kGBit
webhook: POST /webhook/hyperframes-summary-intake
```

The workflow writes the same source package shape as manual production:

```text
content/video-queue/pending/<slug>/
  brief.md
  structure.md
  visual-plan.md
  voiceover.scenes.json
```

Expected queue result after render:

```text
status: needs_review
outputs.render: R2 MP4 URL
review.status: needs_review
review.approve_url: approval webhook
review.reject_url: rejection webhook
```

The VPS runtime lives at `/opt/n8n/hyperframes` and runs inside Docker image
`n8n-hyperframes-renderer`. See `docs/runbooks/summary-intake-vps-runtime.md`
before changing the workflow or redeploying files.

## Spreadsheet Files

Use these when organizing or batching ideas:

```text
video-queue.csv
video-queue.xlsx
video-queue-template.csv
video-queue-template.xlsx
```

Important columns:

- `slug`: stable folder and render id.
- `status`: `pending`, `in_progress`, `needs_review`, `needs_revision`, `done`, or `blocked`.
- `priority`: production priority.
- `title`: internal title.
- `topic`: what the video is about.
- `audience`: who should care.
- `goal`: what the video should achieve.
- `brief`: compact narrative brief.
- `structure`: one continuous narrative, then hook, context, example/mechanism, payoff and closing beats. CTA optional.
- `offer`: thing being offered.
- `cta`: optional viewer action; leave empty for a natural closing. Do not invent offers.
- `template`: `dark-tech`, `light-workshop`, or `data-lab`.
- `tone`: voice and attitude.
- `script_persona`: persona file used when writing `voiceover.scenes.json`.
- `duration_target_s`: default `50` for the `40-60s` range.
- `must_include`: required ideas, entities, or claims.
- `avoid`: claims or visuals to avoid.
- `source_urls`: optional sources.
- `voiceover_status`: `not_started`, `generated`, or `needs_revision`.
- `render_mode`: usually `draft` for review.
- `render_url`: R2 URL returned by n8n.
- `job_id`: remote VPS/n8n job id.
- `notes`: production notes.

## Folder Layout

```text
content/video-queue/
  queue.json
  video-queue.csv
  video-queue.xlsx
  pending/
    <slug>/
      brief.md
      structure.md
      visual-plan.md
      voiceover.scenes.json
  done/
  blocked/
```

The spreadsheet row is the planning surface. The pending folder is the generated working package for the video build.

## Statuses

- `pending`: ready to produce.
- `in_progress`: currently being produced.
- `needs_review`: draft render is ready for user review.
- `needs_revision`: draft was rejected or changes were requested; revise and render again before approval.
- `done`: final video approved/exported.
- `blocked`: cannot continue because input, audio, asset, token, upload, or approval is missing.

## Templates

For default videos, Codex owns visual decisions. Use a 3D narrator template unless the topic benefits from a no-character analytical layout.

Available recurring templates:

- `dark-tech`: rich dark technical narrator, grid, ghost word, right-side stage. Maps to `videos/arquitectura-informacion`.
- `light-workshop`: bright editorial workshop, document-like panels, softer grid, blue/green/pink accents. Maps to `videos/light-workshop`.
- `data-lab`: no 3D narrator. Full-width analytical canvas for SEO, SEM, marketing, and analytics using SERP mockups, dashboards, keyword maps, funnels, comparisons, checklists, timelines, and CTA panels.

Default script personas:

- `dark-tech` and `light-workshop`: `assets/character/personas/main-narrator.md`.
- `data-lab`: `assets/character/personas/social-retention-teacher.md`; a close, direct, slightly incisive expert with optional light irony.
- A video may override this through the spreadsheet `script_persona`, the brief, or `project.persona` in `voiceover.scenes.json`.
- Apply the persona when writing the scene text. ElevenLabs receives only the final `scene.text` values.

Template selection:

- Put `dark-tech`, `light-workshop`, or `data-lab` in the spreadsheet `template` column.
- Or set `project.visual_template` in `voiceover.scenes.json`.
- Or run `node scripts\build-social-narrator-video.mjs --slug <slug> --template data-lab`.

## Remote Pipeline

Default draft render:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

Light Workshop draft:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template light-workshop
```

Data Lab draft:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template data-lab
```

This offloads build, check, snapshots, render, and R2 upload to the VPS. Use local build only for preview/debugging.

## Reel Scheduling

After a rendered MP4 is approved for publication, schedule it through n8n:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook
```

Preview the payload without scheduling:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook --dry-run
```

The script reads `outputs.render` from `queue.json` or `render_url` from `video-queue.csv`, calls the `programacion de reels` n8n workflow, and records the accepted Reel job under `outputs.reel_publish`.

## Review Rule

A generated draft is not final approval. Keep the row and `queue.json` item as `needs_review` until the user explicitly approves it as final.

For n8n Summary Intake V1, the generated review MP4 must be approved through
the review webhook before `schedule-instagram-reel.mjs` is called.
