# Workspace Video Rules

## Manual Video Production: Required Procedures

- Before producing a manual video, follow [approved-script and audio verification](content/CONTENT-WORKFLOW.md#guion-aprobado-y-verificacion-del-audio). Preserve the approved narration literally; send only spoken text to speech synthesis, with voice settings separate. Verify the actual generated audio against that script before rendering, then align subtitles and scene cuts to the verified take.
- For an independent whiteboard video, follow [the standalone Pizarra procedure](experiments/seo-aeo-pizarra-v3/README.md). Use its local composition and package scripts as a reference for the new experiment. This route takes precedence over the Data Lab, spreadsheet/VPS pipeline and scene-by-scene audio defaults below: it supports one continuous narration track and local rendering. Keep it independent unless the user requests integration.
- These checks are production requirements, not additional approval requests. Continue under the user's existing authorization to create/render the video; publication still requires explicit approval.

## Vertical Social Safe Area

For every vertical social video made for Instagram Reels, TikTok, or YouTube Shorts, treat the platform UI as part of the design constraints. The full composition may remain `1080x1920`, but critical content must stay inside the safe content lane so it is not covered by profile controls, like/comment/share buttons, captions, or the post description.

Use this default safe lane for `1080x1920` compositions:

- Critical content box: `x: 96px` to `860px`, `y: 220px` to `1380px`
- Max critical content width: `764px`
- Avoid important text, CTAs, numbers, logos, faces, product details, or form fields outside this box.
- Keep bottom captions/subtitles above `y: 1380px` whenever possible.
- Keep final CTAs centered in this lane, not at the lower edge.
- Full-bleed backgrounds, maps, patterns, ambient visuals, and nonessential decorative elements may extend to the full canvas.
- If a video intentionally needs content near an edge, make it nonessential or duplicate the key message inside the safe lane.

Recommended CSS variables:

```css
:root {
  --social-safe-left: 96px;
  --social-safe-right: 220px;
  --social-safe-top: 220px;
  --social-safe-bottom: 540px;
  --social-safe-width: calc(1080px - var(--social-safe-left) - var(--social-safe-right));
}

.social-safe {
  position: absolute;
  left: var(--social-safe-left);
  right: var(--social-safe-right);
  top: var(--social-safe-top);
  bottom: var(--social-safe-bottom);
}
```

Before final render, check at least the hook, middle instructional beat, and final closing frames (including any CTA) with this lane in mind. If text or CTA depends on the right edge or bottom band, revise before rendering.

## Default Social Narrator Template

For recurring social explainers, use the established narrator-led vertical template unless the user asks for a different visual direction.

Default assumptions:

- Duration target: estimate from the complete script; use `40-60s` as a planning reference when it fits, and allow more or less time when clarity requires it. Follow `content/SCRIPT-EDITORIAL-GUIDE.md`.
- Format: vertical `1080x1920`.
- Visual ownership: Codex chooses the visual layout, scene composition, text hierarchy, motion, and safe-area placement.
- User input: the user provides the topic, structure, points to cover, offer, and CTA.
- Template: use the latest rich 3D narrator explainer style from `videos/arquitectura-informacion/` as the visual baseline.
- Change per video: rewrite voiceover, on-screen text, scene labels, timing, icons/cards, and topic-specific visual metaphors.
- Keep per-video visuals consistent unless the user explicitly asks to change the style.

Rules:

- The narrator is a guide, not decoration: it should point at the active concept, react to the hook, or support the CTA.
- Keep the narrator inside the social safe area unless it is intentionally nonessential.
- Default placement: lower-left inside `x: 100px` to `330px`, `y: 520px` to `1260px`.
- Keep the 3D narrator slightly smaller than earlier prototypes so the right-side visual stage has room to breathe.
- Do not let the narrator cover critical text, chart labels, CTAs, or captions.
- Current default character system: 3D GLB files under `assets/character/`.
- Current default animations: `breathing`, `talking`, `happy`, `yelling`.
- Before scripting, flag independent topics in the source material and agree which belong in this video. Write one continuous script first, naming the topic and useful question in the opening, giving a first answer soon and keeping explicit referents across scenes. Then split into connected scenes: context, example or mechanism, payoff and natural closing. CTA is optional. Choose among three internal hook candidates; cut filler and resolve the opening promise before generating voice.
- Keep motion subtle enough that it supports the lesson: animated narrator, scene transitions, grid/background motion, and concise text.
- On-screen text should be short, scan-friendly, and rewritten per topic.
- Use the lower mask trick from the current template if the 3D model clips or overlaps around the legs/coat.
- If voiceover exists, select narrator animation per scene; full lipsync is optional.
- Default narrator persona: `assets/character/personas/main-narrator.md`.
- Default tone: direct and useful, with sarcasm when it helps the explanation. Profanity is optional, not a quota.
- The narrator may use a mild Spanish profanity when natural for a specific script, such as `mierda`, `maldita sea`, `capullo`, or `imbecil`.
- Profanity should target bad UX, lazy marketing, broken workflows, or confusing decisions. Do not target protected groups, private people, clients, or users as people.

## Base Visual Style For Future Videos

For new recurring videos, preserve the `arquitectura-informacion` visual language:

- Dark technical background with subtle grid, soft radial light, and large ghost topic word as ambient texture.
- Large uppercase headline in the safe lane, with one highlighted accent word.
- Short supporting copy below the headline.
- Wider right-side glass visual stage with animated cards, nodes, metrics, flows, or CTA panels adapted to the topic.
- Smaller 3D narrator on the left/lower-left, scaled so it supports the text without crowding the animated explanations.
- Lower subtitle box above the platform UI danger zone.
- Scene transitions, card entrances, subtle floating motion, and narrator animation should provide the feeling of movement.

Do not include these UI/debug elements in future videos:

- No scene label pill such as `HOOK`, `SISTEMA`, `RESULTADO`, or `CTA`.
- No visible scene timestamp such as `00:00`, `00:21`, or similar timing labels.
- No bottom progress bar that fills during playback.

Scene names and timings may still exist internally in scripts or data structures; they should not be visible in the rendered video.

## Data Lab No-Character Template

Use `data-lab` when the user asks for a video without the 3D character, or when the topic is mainly SEO, SEM, marketing strategy, data analysis, dashboards, audits, or campaign diagnosis and would benefit from large analytical graphics.

Data Lab rules:

- No 3D narrator, no GLB character assets, no Three.js narrator layer.
- Default script persona: `assets/character/personas/social-retention-teacher.md`.
- Default tone: a close, clear and natural expert. Light irony is optional; jokes and profanity are not required. Follow the canonical persona for an opening with a reason to keep watching, self-contained context, continuous narration and a natural closing.
- Voiceover, scene timing, subtitles, lower mask, and transition beats still apply.
- For `data-lab`, the bottom subtitle follows short phrases from the spoken narration. Keep the headline, supporting copy and chart labels distinct. Add a stage takeaway only when it says something useful beyond the headline and supporting copy.
- For a `comparison` that connects two complementary concepts, set `stage.relation` to `connection` so the stage uses a linking symbol and neutral cards; leave it unset for an actual before/after or opposing comparison.
- The visual guide is the graphic system: cursor-like emphasis, zoom-like composition, highlights, cards, metrics, and panel motion.
- Keep all critical text and chart values inside the vertical social safe lane.
- Prefer large, legible graphics over decorative complexity.
- Best stage types: `serp`, `dashboard`, `keyword-map`, `funnel`, `comparison`, `checklist`, `timeline`, and `cta`.
- Use `data-lab` from the spreadsheet `template` column, from `project.visual_template`, or with `--template data-lab`.

Recommended uses:

- `serp`: Google results, local pack, snippets, rankings, CTR, search intent.
- `dashboard`: KPI cards, traffic, leads, CPC, ROAS, conversions, trend bars.
- `keyword-map`: keyword clusters, long-tail groups, cannibalization, topical authority.
- `funnel`: ad/content to landing to lead to sale, with visible leaks.
- `comparison`: before/after, SEO vs SEM, bad setup vs clean setup.
- `checklist`: audits, technical checks, campaign QA, priority triage.
- `timeline`: ranking changes, campaign evolution, experiments, growth sequence.

## n8n Summary Intake Publication Rule

Do not auto-publish summary-intake videos. The generated review MP4 must be
approved through the review webhook before `schedule-instagram-reel.mjs` is
called.

Current Summary Intake workflow:

- n8n workflow name: `HyperFrames Content Intake`.
- n8n workflow id: `eXLSEY7Fzg0kGBit`.
- Sanitized workflow export: `n8n/hyperframes-summary-intake-workflow.json`.
- Workflow runbook: `docs/runbooks/summary-intake-vps-runtime.md`.
- Workflow contract: `docs/workflows/eXLSEY7Fzg0kGBit.md`.
- VPS project path: `/opt/n8n/hyperframes`.
- Runtime: run project scripts inside Docker image `n8n-hyperframes-renderer`.
- Do not assume Node.js or npm are available on the VPS host.
- Deployed env files are `.env local` for ElevenLabs and `.env.n8n` for n8n
  webhook access. Never print their values.
- Keep the workflow inactive until activation and a controlled test are
  explicitly requested.
- First live test should stop at `needs_review`; do not call approval without
  explicit permission.
- Template-only or builder-only updates for `data-lab` should normally deploy
  runtime files to `/opt/n8n/hyperframes` and validate inside
  `n8n-hyperframes-renderer`. Do not patch the n8n workflow unless the workflow
  prompt, JSON schema, node command, webhook behavior, or review/publication
  logic changes.

## Render And Download Defaults

For future social videos, optimize review downloads for speed and keep the final render reasonably light.

Default render modes:

- Draft/review download: use `--quality draft --crf 26` when the user wants a quick MP4 to inspect.
- Normal review/final delivery: use `--quality standard --crf 23` unless the user requests a different quality/size tradeoff.
- Do not use `--quality high` by default. Use it only if the user explicitly asks for maximum quality.

Project `package.json` files should expose:

```json
{
  "render:draft": "npx --yes hyperframes@<version> render --quality draft --crf 26",
  "render": "npx --yes hyperframes@<version> render --quality standard --crf 23"
}
```

Continue to preview in Studio before rendering. A passing check is not approval to render.

## Video Queue Workflow

Use `content/video-queue/` as the source of truth for recurring video work.

For the full internal content process, use `content/CONTENT-WORKFLOW.md`. For publication details, use `content/SOCIAL-PUBLISHING.md`.

Default intake is chat to spreadsheet to generated source files. The user normally sends the topic, notes, structure, offer, CTA, and constraints in chat. Codex translates that input into `content/video-queue/video-queue.csv` / `content/video-queue/video-queue.xlsx`, then creates or updates the pending source folder from that row.

Queue structure:

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

Rules:

- New video ideas usually start as a spreadsheet row, not as hand-written files.
- For `data-lab`, set the spreadsheet `script_persona` or JSON `project.persona` to `assets/character/personas/social-retention-teacher.md` unless the user asks for another writing persona.
- For `dark-tech` and `light-workshop`, keep `assets/character/personas/main-narrator.md` unless overridden.
- `brief.md`, `structure.md`, `visual-plan.md`, and `voiceover.scenes.json` are the generated working package used by the build.
- If the user directly provides files instead of chat content, keep supporting `content/video-queue/pending/<slug>/` as a fallback.
- Codex generates or updates `visual-plan.md` and `voiceover.scenes.json`.
- Default ElevenLabs voice for new video manifests: `RwzBDEn5f6FIgpAjH9YN` (`elevenlabs.voice_id`). Use this for manual video packages as well as AI intake unless the user selects another voice for that video. The per-video ID overrides `ELEVENLABS_VOICE_ID` in `.env local`; never change historical manifests just to adopt a new default.
- `queue.json` tracks the canonical status, folders, generated project path, audio path, ZIP, preview URL, and render URL.
- Process pending videos one by one so ElevenLabs generation, optional local preview, and remote build/render do not overload the machine.
- Default to the VPS full pipeline for generated drafts: build, check, snapshots, packaging, render, and R2 upload should run remotely unless the user explicitly asks for local preview/debugging.
- After a draft is generated, leave the item as `needs_review` unless the user explicitly approves it as final.
- Move or mark items as `done` only after approval and final render.

Default item lifecycle:

```text
chat brief -> video-queue row -> pending source files -> visual-plan -> scene voiceover -> source bundle -> VPS build/check/snapshots/render -> review -> final render -> done
```

## Carousel Queue Workflow

Use `content/carousel-queue/` as the source of truth for recurring Instagram carousel work. Keep this separate from the video queue so static carousels and rendered Reels can move independently.

Default intake mirrors videos: the user sends the topic, structure, offer, CTA, and constraints in chat; Codex translates that into the carousel spreadsheet shape and then creates `pending/<slug>/carousel.json`.

Queue structure:

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

Generated carousel assets go to:

```text
carousels/<slug>/
  slide-01.html
  slide-01.png
  ...
  manifest.json
```

Default carousel style:

- Use the `Editorial Moody Green & Electric Orange` style imported from `C:\Users\USUARIO\Downloads\experto-redes`.
- Format: Instagram 4:5, exported as `1080x1350`.
- Design canvas: `540x675` CSS pixels, captured at device scale `2`.
- Palette: deep forest green `#1A2B1E`, white `#FFFFFF`, electric orange `#FF3B1D`.
- Fonts: `Bebas Neue` for display headlines, `Playfair Display Italic` for editorial phrases, `JetBrains Mono` for tags and page numbers.
- Keep a fixed footer with handle, save prompt, slide count, and swipe cue.
- Use 5-7 slides by default: hook, problem/pain, steps, payoff/result, CTA.

Default build command:

```powershell
node scripts\build-social-carousel.mjs --slug <slug>
```

Default schedule command:

```powershell
node scripts\schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"
```

Publication path:

1. Codex turns the user's chat brief into a carousel row, then creates `content/carousel-queue/pending/<slug>/carousel.json`.
2. `build-social-carousel.mjs` generates the HTML slides, PNG exports, and `manifest.json`.
3. `schedule-instagram-carousel.mjs` zips the PNGs, uploads them to the VPS, uses the renderer container's R2 configuration to upload them under `carruseles instagram/<slug>/`, then calls the existing n8n `instagram-carousel-schedule` webhook.
4. `content/carousel-queue/queue.json` moves from `generated` to `scheduled`.

The existing carousel n8n workflow remains the publication owner:

```text
workflow name: programacion de carruseles
workflow id: ZKD4lsnfQ4saTB9I
webhook: POST https://n8n.urltovideo.es/webhook/instagram-carousel-schedule
```

Do not merge carousel publication into the Reels workflow unless the user explicitly asks for a combined social publisher.

## ElevenLabs Scene Voiceover

Use scene-based voiceover generation by default. Avoid one long generated audio file for new recurring videos unless the user explicitly asks for it.

Expected generated audio structure:

```text
assets/character/audio/generated/<slug>/
  scene-01-*.mp3
  scene-02-*.mp3
  ...
  voiceover-master.mp3
  voiceover-timing.json
```

Generation input:

```text
content/video-queue/pending/<slug>/voiceover.scenes.json
```

Default script:

```powershell
node scripts\elevenlabs-generate-scenes.mjs --input content\video-queue\pending\<slug>\voiceover.scenes.json --out assets\character\audio\generated\<slug> --env ".env local"
```

Rules:

- Keep Spanish accents and punctuation clean before generating voiceover.
- Scene audio should match the length needed by the complete explanation; `40-60s` is a planning reference, not a reason to remove essential context.
- Prefer clear, connected scenes over dense paragraphs or a forced punchline per scene.
- Use `assets/character/personas/main-narrator.md` for narrator-led `dark-tech` and `light-workshop` videos.
- Use `assets/character/personas/social-retention-teacher.md` for `data-lab` videos unless explicitly overridden. Explain the example clearly before drawing a conclusion; do not force an impactful line into every scene.
- The narrator templates may be sarcastic and use mild Spanish profanity, but the useful point must remain clear.
- The `data-lab` persona allows light irony when useful, with no compulsory jokes or profanity by default. Write and tighten the whole narration before scene segmentation; generate audio separately per scene afterwards. Never invent an offer or add a comment CTA automatically.

## Remote Build And Render Workflow

Use the VPS + n8n flow by default for social video drafts and delivery renders. This keeps the heavy HyperFrames steps off the local PC.

Current remote shape:

- VPS host: `72.61.161.99`.
- Current SSH upload user: `codex_tmp@72.61.161.99`.
- Current SSH key path: `C:\Users\USUARIO\.ssh\codex_hyperframes_tmp_rsa`.
- n8n workflow name: `HyperFrames Remote Render`.
- n8n workflow id: `joMtzKbe3RQ5CAKH`.
- Workflow file in repo: `n8n/hyperframes-render-workflow.json`.
- Installer script: `scripts/install-n8n-hyperframes-workflow.mjs`.
- Full pipeline trigger script: `scripts/trigger-n8n-build-render.mjs`.
- n8n workflow patch script: `scripts/patch-n8n-build-render-workflow.mjs`.
- Upload folder on VPS: `/opt/n8n/hyperframes_uploads/`.
- Container upload path: `/work/uploads/`.
- Container jobs path: `/work/jobs/`.
- Container output path: `/work/outputs/`.
- Container scripts path: `/work/scripts/`.
- Public draft delivery: R2 public URL returned by n8n status.

Current webhooks:

```text
POST https://n8n.urltovideo.es/webhook/hyperframes-build-render
POST https://n8n.urltovideo.es/webhook/hyperframes-render
POST https://n8n.urltovideo.es/webhook/hyperframes-render-status
```

Cloudflare Access protects n8n. Use service-token headers from `C:\Users\USUARIO\Downloads\mcp-n8n\.env` when calling the webhooks or n8n API. Do not print secrets.

Default full remote process:

1. Validate the pending item and generated scene audio locally.
2. Create a source ZIP containing only the required source inputs: `scripts/build-social-narrator-video.mjs`, `content/video-queue/pending/<slug>/`, `assets/character/audio/generated/<slug>/`, and character GLBs only for narrator templates.
3. Upload the source ZIP to `/opt/n8n/hyperframes_uploads/` via `scp`.
4. Trigger `hyperframes-build-render` with `slug`, `sourceZipName`, `mode`, optional `template`, and optional `jobId`.
5. The VPS wrapper extracts the source bundle, runs `node scripts/build-social-narrator-video.mjs --slug <slug>`, runs `npm run check -- --snapshots --timeout 60000`, packages the renderable project, renders it, and uploads the MP4 to R2.
6. Poll `hyperframes-render-status` using the returned `jobId`.
7. Store the returned `downloadUrl` in `content/video-queue/queue.json`.

Default local command:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft
```

Use Light Workshop remotely with:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template light-workshop
```

Use Data Lab remotely with:

```powershell
node scripts\trigger-n8n-build-render.mjs --slug <slug> --mode draft --template data-lab
```

Default Reel scheduling command, only after user approval to publish or schedule:

For the manual GitHub queue, prefer the separately triggered `HyperFrames publish Reel (manual)` Action after explicit user approval; see `docs/runbooks/manual-reel-publishing.md`. Do not launch it when merely preparing, validating or rendering a draft.

For an approved standalone whiteboard rendered locally, do not rerender it on
the VPS and do not require R2. Publish the verified MP4 and cover as uniquely
named assets in a public GitHub Release, record their URLs and SHA-256 values in
the queue, and use the same manual Reel action. The detailed procedure is in
`docs/runbooks/manual-reel-publishing.md`. When `outputs.cover` exists, the
action must forward it to n8n as `cover_url`.

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "Texto del post" --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" --platforms instagram,facebook
```

Use `--dry-run` to inspect the n8n payload without enqueuing a real post. The script reads the rendered MP4 URL from the video queue and stores the accepted n8n job under `outputs.reel_publish`.

Render-only fallback process, for an already-built local project ZIP:

1. Build and validate the local project.
2. Create a ZIP containing only the renderable project files: `index.html`, `package.json`, `hyperframes.json`, `voiceover-timing.json`, local `assets/`, and local `compositions/`.
3. Upload the ZIP to `/opt/n8n/hyperframes_uploads/` via `scp`.
4. Trigger n8n with `zipName`, `slug`, and `mode`.
5. Poll `hyperframes-render-status` using the returned `jobId`.
6. Store the returned `downloadUrl` in `content/video-queue/queue.json`.

Remote status now reads the VPS job state directly:

- Render-only launch uses `/work/scripts/render-with-status.sh` inside `hyperframes-renderer`.
- Full source-bundle pipeline launch uses `/work/scripts/build-check-render-with-status.sh` inside `hyperframes-renderer`.
- Summary Intake and `data-lab` runtime/template deployments use the full
  source-bundle path. Do not require local `scripts/vps/render-with-status.sh`
  for that path; it belongs to the render-only fallback workflow.
- The wrapper writes `/work/jobs/<jobId>/status.json` and `/work/jobs/<jobId>/render.log`.
- The n8n status webhook SSHes into the VPS and returns the JSON from that status file, including `step`, `progress`, `message`, `lastLog`, and the parsed MP4 URL when available.

Direct multipart ZIP upload through n8n is currently not the default path. Earlier tests hit n8n filesystem/module restrictions, so the stable path is `scp` first, then call n8n with `zipName`.

Remote modes:

- Draft test: `mode=draft`, mapped to `--quality draft --crf 26`.
- Final/normal: `mode=standard`, mapped to `--quality standard --crf 23`.

Do not switch the default final render to `high` unless the user explicitly asks.
