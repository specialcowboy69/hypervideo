# Update Data Lab VPS Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the updated local `data-lab` HyperFrames template/runtime to the VPS used by n8n without overwriting queue state, leaking secrets, or publishing anything.

**Architecture:** n8n does not own the visual template; it calls scripts mounted from `/opt/n8n/hyperframes` inside Docker image `n8n-hyperframes-renderer`. Update only the runtime files that produce `data-lab`, preserve remote env/queue state, validate inside the container, and run a controlled live intake only after explicit approval.

**Tech Stack:** Windows PowerShell, OpenSSH/scp, Docker on VPS, n8n webhooks, Node.js scripts inside `n8n-hyperframes-renderer`, HyperFrames `0.8.63`.

**Spec:** `AGENTS.md`, `docs/runbooks/summary-intake-vps-runtime.md`, `docs/workflows/eXLSEY7Fzg0kGBit.md`, and user request on 2026-09-23: update the n8n/VPS template after local `data-lab` improvements.

## Global Constraints

- VPS project path must stay `/opt/n8n/hyperframes`.
- Runtime must execute inside Docker image `n8n-hyperframes-renderer`; do not assume host-level Node.js/npm.
- Preserve `/opt/n8n/hyperframes/.env local` and `/opt/n8n/hyperframes/.env.n8n`; never print their values.
- Do not overwrite `/opt/n8n/hyperframes/content/video-queue/queue.json` during a template-only deploy.
- Do not call approval/publishing webhooks during deploy validation.
- Keep Summary Intake review-gated: generated MP4s must end at `needs_review`.
- Keep workflow `eXLSEY7Fzg0kGBit` inactive unless the user explicitly asks to activate it.
- If the n8n workflow prompt/schema changes, back up and patch the workflow; if only layout/template code changes, do not patch n8n.

## Review Focus

- Remote still running old builder: verify remote checksum and `test-data-lab-template.mjs` after deployment.
- Remote queue clobbered: bundle must exclude `content/video-queue/queue.json` and generated `videos/`.
- Secrets exposed or permissions loosened: commands must print key names/status only, not env values; env files remain `600`.
- Accidental publication: no approve webhook and no `schedule-instagram-reel.mjs` live call during deploy.
- Docker runtime mismatch: run every validation inside `n8n-hyperframes-renderer`, not on the host.

---

### Task 1: Preflight And Remote Snapshot

**Files:**
- Read: `scripts/build-social-narrator-video.mjs`
- Read: `scripts/run-data-lab-video-pipeline.mjs`
- Read: `scripts/trigger-n8n-build-render.mjs`
- Read remote: `/opt/n8n/hyperframes`
- Do not modify files in this task.

**Interfaces:**
- Consumes: local workspace `C:\Users\USUARIO\Downloads\hyperframes`, SSH access as `codex_tmp@72.61.161.99`.
- Produces: local and remote hashes, plus a remote backup archive path for rollback.

- [ ] **Step 1: Define deployment variables in PowerShell**

```powershell
$Root = "C:\Users\USUARIO\Downloads\hyperframes"
$RemoteUser = "codex_tmp"
$RemoteHost = "72.61.161.99"
$Key = "$env:USERPROFILE\.ssh\codex_hyperframes_tmp_rsa"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupName = "hyperframes-runtime-before-data-lab-$Stamp.tar.gz"
Set-Location $Root
```

- [ ] **Step 2: Capture local hashes for the core files**

```powershell
Get-FileHash `
  .\scripts\build-social-narrator-video.mjs, `
  .\scripts\run-data-lab-video-pipeline.mjs, `
  .\scripts\trigger-n8n-build-render.mjs, `
  .\scripts\test-data-lab-template.mjs `
  -Algorithm SHA256 |
  Select-Object Path,Hash
```

Expected: four SHA256 hashes are printed. No secret values appear.

- [ ] **Step 3: Capture remote hashes before changing anything**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "sha256sum /opt/n8n/hyperframes/scripts/build-social-narrator-video.mjs /opt/n8n/hyperframes/scripts/run-data-lab-video-pipeline.mjs /opt/n8n/hyperframes/scripts/trigger-n8n-build-render.mjs /opt/n8n/hyperframes/scripts/test-data-lab-template.mjs 2>/dev/null || true"
```

Expected: existing hashes print when files exist. Missing files are acceptable only if this is the first deploy of that test file.

- [ ] **Step 4: Back up the remote runtime files that will be overwritten**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "sudo mkdir -p /opt/n8n/hyperframes_backups && cd /opt/n8n/hyperframes && sudo tar -czf /opt/n8n/hyperframes_backups/$BackupName scripts assets/character/personas content/video-queue/ai-intake-prompt.md && sudo ls -lh /opt/n8n/hyperframes_backups/$BackupName"
```

Expected: a `.tar.gz` backup path and size are printed. Env files and `queue.json` are not included in this backup command.

### Task 2: Build A Minimal Local Deployment Bundle

**Files:**
- Include: `scripts/build-social-narrator-video.mjs`
- Include: `scripts/ai-video-intake-schema.mjs`
- Include: `scripts/create-video-from-summary.mjs`
- Include: `scripts/run-data-lab-video-pipeline.mjs`
- Include: `scripts/review-video-job.mjs`
- Include: `scripts/trigger-n8n-build-render.mjs`
- Include: `scripts/schedule-instagram-reel.mjs`
- Include: `scripts/test-ai-video-intake.mjs`
- Include: `scripts/test-data-lab-template.mjs`
- Include: `scripts/test-review-video-job.mjs`
- Include: `scripts/test-trigger-n8n-build-render.mjs`
- Include: `scripts/test-schedule-instagram-reel.mjs`
- Include: `scripts/vps/build-check-render-with-status.sh`
- Include: `assets/character/personas/main-narrator.md`
- Include: `assets/character/personas/social-retention-teacher.md`
- Include: `content/video-queue/ai-intake-prompt.md`
- Exclude: `.env local`, `.env.n8n`, `content/video-queue/queue.json`, `videos/`, `assets/character/audio/generated/`, and ZIP/MP4 outputs.

**Interfaces:**
- Consumes: checked local files.
- Produces: one tarball safe to extract into `/opt/n8n/hyperframes`.

- [ ] **Step 1: Create a clean staging folder**

```powershell
$BundleStage = Join-Path $env:TEMP "hyperframes-vps-template-$Stamp"
$BundlePath = Join-Path $env:TEMP "hyperframes-vps-template-$Stamp.tar.gz"
Remove-Item -LiteralPath $BundleStage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $BundleStage -Force | Out-Null
```

- [ ] **Step 2: Copy only runtime files into staging**

```powershell
$Paths = @(
  "scripts\build-social-narrator-video.mjs",
  "scripts\ai-video-intake-schema.mjs",
  "scripts\create-video-from-summary.mjs",
  "scripts\run-data-lab-video-pipeline.mjs",
  "scripts\review-video-job.mjs",
  "scripts\trigger-n8n-build-render.mjs",
  "scripts\schedule-instagram-reel.mjs",
  "scripts\test-ai-video-intake.mjs",
  "scripts\test-data-lab-template.mjs",
  "scripts\test-review-video-job.mjs",
  "scripts\test-trigger-n8n-build-render.mjs",
  "scripts\test-schedule-instagram-reel.mjs",
  "scripts\vps\build-check-render-with-status.sh",
  "assets\character\personas\main-narrator.md",
  "assets\character\personas\social-retention-teacher.md",
  "content\video-queue\ai-intake-prompt.md"
)

foreach ($RelativePath in $Paths) {
  $Source = Join-Path $Root $RelativePath
  if (!(Test-Path -LiteralPath $Source)) { throw "Missing local deploy file: $RelativePath" }
  $Destination = Join-Path $BundleStage $RelativePath
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}
```

Expected: no generated videos, queue state, audio, MP4s, or env files are copied.
`scripts/vps/render-with-status.sh` is intentionally not bundled here because
this plan updates the Summary Intake / full build-check-render path, which uses
`scripts/vps/build-check-render-with-status.sh`. The render-only wrapper belongs
to `/webhook/hyperframes-render` and should be handled in a separate maintenance
task if needed.

- [ ] **Step 3: Create the tarball**

```powershell
Remove-Item -LiteralPath $BundlePath -Force -ErrorAction SilentlyContinue
tar.exe -czf $BundlePath -C $BundleStage .
Get-Item $BundlePath | Select-Object FullName,Length
```

Expected: tarball exists and is small enough for quick upload. If it is unexpectedly huge, inspect `$BundleStage` before continuing.

### Task 3: Upload And Extract Runtime On VPS

**Files:**
- Modify remote: `/opt/n8n/hyperframes/scripts/*`
- Modify remote: `/opt/n8n/hyperframes/scripts/vps/*.sh`
- Modify remote: `/opt/n8n/hyperframes/assets/character/personas/*.md`
- Modify remote: `/opt/n8n/hyperframes/content/video-queue/ai-intake-prompt.md`
- Preserve remote: `/opt/n8n/hyperframes/content/video-queue/queue.json`
- Preserve remote: `/opt/n8n/hyperframes/.env local`
- Preserve remote: `/opt/n8n/hyperframes/.env.n8n`

**Interfaces:**
- Consumes: `$BundlePath`.
- Produces: updated remote runtime mounted by n8n.

- [ ] **Step 1: Upload tarball to `/tmp`**

```powershell
scp -i $Key $BundlePath "$RemoteUser@$RemoteHost:/tmp/hyperframes-vps-template-$Stamp.tar.gz"
```

Expected: upload completes without printing secrets.

- [ ] **Step 2: Extract into `/opt/n8n/hyperframes` and preserve permissions**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "sudo tar -xzf /tmp/hyperframes-vps-template-$Stamp.tar.gz -C /opt/n8n/hyperframes && sudo rm -f /tmp/hyperframes-vps-template-$Stamp.tar.gz && sudo chown -R codex_tmp:codex_tmp /opt/n8n/hyperframes/scripts /opt/n8n/hyperframes/assets/character/personas /opt/n8n/hyperframes/content/video-queue/ai-intake-prompt.md && sudo chmod +x /opt/n8n/hyperframes/scripts/vps/*.sh && sudo chmod 600 '/opt/n8n/hyperframes/.env local' /opt/n8n/hyperframes/.env.n8n"
```

Expected: command exits `0`. It does not touch `queue.json`.

- [ ] **Step 3: Confirm protected files still exist and have safe permissions**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "stat -c '%U:%G %a %n' /opt/n8n/hyperframes '/opt/n8n/hyperframes/.env local' /opt/n8n/hyperframes/.env.n8n /opt/n8n/hyperframes/content/video-queue/queue.json"
```

Expected: env files report mode `600`; `queue.json` still exists. Values are not printed.

### Task 4: Run Remote Docker Validation

**Files:**
- Read/execute remote scripts through Docker.
- Generated temporary test folders may be created and cleaned by `test-data-lab-template.mjs`.

**Interfaces:**
- Consumes: updated remote runtime.
- Produces: validation output proving n8n will see the updated `data-lab` builder.

- [ ] **Step 1: Run syntax checks inside the renderer container**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "cd /opt/n8n && sudo -n docker run --rm --network host -v /opt/n8n/hyperframes:/work -v /opt/n8n/hyperframes_uploads:/opt/n8n/hyperframes_uploads -w /work n8n-hyperframes-renderer bash -lc 'node --check scripts/build-social-narrator-video.mjs && node --check scripts/run-data-lab-video-pipeline.mjs && node --check scripts/review-video-job.mjs && node --check scripts/trigger-n8n-build-render.mjs && node --check scripts/schedule-instagram-reel.mjs'"
```

Expected: every `node --check` exits `0`.

- [ ] **Step 2: Run unit/smoke tests inside the renderer container**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "cd /opt/n8n && sudo -n docker run --rm --network host -v /opt/n8n/hyperframes:/work -v /opt/n8n/hyperframes_uploads:/opt/n8n/hyperframes_uploads -w /work n8n-hyperframes-renderer bash -lc 'node scripts/test-data-lab-template.mjs && node scripts/test-ai-video-intake.mjs && node scripts/test-review-video-job.mjs && node scripts/test-trigger-n8n-build-render.mjs && node scripts/test-schedule-instagram-reel.mjs'"
```

Expected: all tests pass. `test-data-lab-template.mjs` proves the remote builder includes the no-character `data-lab` classes, animation layer, bottom band, subtitle position, and HyperFrames `0.8.63` pin.

- [ ] **Step 3: Confirm remote hashes now match local hashes for updated files**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "sha256sum /opt/n8n/hyperframes/scripts/build-social-narrator-video.mjs /opt/n8n/hyperframes/scripts/run-data-lab-video-pipeline.mjs /opt/n8n/hyperframes/scripts/trigger-n8n-build-render.mjs /opt/n8n/hyperframes/scripts/test-data-lab-template.mjs"
```

Expected: compare the remote hashes with Task 1 local hashes. `build-social-narrator-video.mjs` must match local before any live n8n test.

### Task 5: Confirm n8n Workflow Shape Without Patching

**Files:**
- Read live n8n workflow `eXLSEY7Fzg0kGBit`.
- Do not update the workflow in this task.

**Interfaces:**
- Consumes: `C:\Users\USUARIO\Downloads\mcp-n8n\.env` for n8n API access.
- Produces: a safe JSON summary showing whether the workflow still calls the mounted VPS runtime.

- [ ] **Step 1: Read live workflow metadata without printing credentials**

```powershell
node -e "import fs from 'node:fs'; for (const line of fs.readFileSync('C:/Users/USUARIO/Downloads/mcp-n8n/.env','utf8').split(/\r?\n/)) { const i=line.indexOf('='); if (i>0 && !line.trim().startsWith('#')) process.env[line.slice(0,i)] ||= line.slice(i+1).replace(/^['\"]|['\"]$/g,''); } const { getWorkflow } = await import('file:///C:/Users/USUARIO/Downloads/mcp-n8n/build/n8n-api.js'); const wf = await getWorkflow('eXLSEY7Fzg0kGBit'); const raw = JSON.stringify(wf); console.log(JSON.stringify({ id: wf.id, name: wf.name, active: wf.active, nodeCount: wf.nodes.length, hasDockerMount: raw.includes('/opt/n8n/hyperframes:/work'), callsDataLabPipeline: raw.includes('scripts/run-data-lab-video-pipeline.mjs'), hasApproveWebhook: raw.includes('hyperframes-video-review-approve'), hasRejectWebhook: raw.includes('hyperframes-video-review-reject') }, null, 2));"
```

Expected:

```json
{
  "id": "eXLSEY7Fzg0kGBit",
  "name": "HyperFrames Content Intake",
  "active": false,
  "hasDockerMount": true,
  "callsDataLabPipeline": true,
  "hasApproveWebhook": true,
  "hasRejectWebhook": true
}
```

If `hasDockerMount` or `callsDataLabPipeline` is `false`, stop and patch the workflow with `node scripts\patch-summary-intake-vps-runtime.mjs` only after taking a fresh backup.

### Task 6: Optional Controlled Live Test After User Approval

**Files:**
- May create remote queue item under `/opt/n8n/hyperframes/content/video-queue/`.
- May create generated audio under `/opt/n8n/hyperframes/assets/character/audio/generated/`.
- May render draft MP4 and upload to R2.
- Must not schedule or publish to Meta.

**Interfaces:**
- Consumes: active n8n intake webhook.
- Produces: one review-gated `data-lab` draft with status `needs_review`.

- [ ] **Step 1: Ask for explicit approval before spending resources**

Use this exact confirmation text before running the live test:

```text
¿Quieres que haga una prueba real del intake de n8n ahora? Esto puede consumir ElevenLabs y render en VPS. La prueba se detendrá en needs_review y no publicaré nada.
```

Expected: continue only if the user clearly approves.

- [ ] **Step 2: Send a short test summary to the intake webhook**

```powershell
$EnvPath = "C:\Users\USUARIO\Downloads\mcp-n8n\.env"
$EnvMap = @{}
Get-Content $EnvPath | ForEach-Object {
  if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
  $Index = $_.IndexOf("=")
  $EnvMap[$_.Substring(0, $Index)] = $_.Substring($Index + 1).Trim("'`"")
}
$Headers = @{
  "CF-Access-Client-Id" = $EnvMap["CF_ACCESS_CLIENT_ID"]
  "CF-Access-Client-Secret" = $EnvMap["CF_ACCESS_CLIENT_SECRET"]
}
$Body = @{
  summary = "Video de prueba interno: explica que en SEO no basta mirar una sola métrica. Compara una auditoría superficial con una revisión clara de intención, autoridad y conversión. Termina pidiendo comentar DATA para recibir una checklist."
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "$($EnvMap["N8N_BASE_URL"].TrimEnd('/'))/webhook/hyperframes-summary-intake" `
  -Headers $Headers `
  -ContentType "application/json" `
  -Body $Body
```

Expected: response includes a `video_url`, `approve_url`, and `reject_url`, or an event equivalent to `data_lab_review_ready`. Do not call `approve_url`.

- [ ] **Step 3: Verify the queue item status remotely**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "cd /opt/n8n && sudo -n docker run --rm -v /opt/n8n/hyperframes:/work -w /work n8n-hyperframes-renderer node -e \"const fs=require('fs'); const q=JSON.parse(fs.readFileSync('content/video-queue/queue.json','utf8')); const item=q.items.at(-1); console.log(JSON.stringify({slug:item.slug,status:item.status,review:item.review?.status,render:!!item.outputs?.render}, null, 2));\""
```

Expected:

```json
{
  "status": "needs_review",
  "review": "needs_review",
  "render": true
}
```

### Task 7: Rollback Procedure If Validation Fails

**Files:**
- Restore remote runtime from `/opt/n8n/hyperframes_backups/$BackupName`.
- Preserve env files and queue state.

**Interfaces:**
- Consumes: backup from Task 1.
- Produces: previous runtime restored.

- [ ] **Step 1: Restore the runtime backup**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "sudo tar -xzf /opt/n8n/hyperframes_backups/$BackupName -C /opt/n8n/hyperframes && sudo chown -R codex_tmp:codex_tmp /opt/n8n/hyperframes/scripts /opt/n8n/hyperframes/assets/character/personas /opt/n8n/hyperframes/content/video-queue/ai-intake-prompt.md && sudo chmod +x /opt/n8n/hyperframes/scripts/vps/*.sh && sudo chmod 600 '/opt/n8n/hyperframes/.env local' /opt/n8n/hyperframes/.env.n8n"
```

Expected: previous runtime files restored. `queue.json` is still untouched.

- [ ] **Step 2: Re-run the remote syntax checks**

```powershell
ssh -i $Key "$RemoteUser@$RemoteHost" "cd /opt/n8n && sudo -n docker run --rm --network host -v /opt/n8n/hyperframes:/work -v /opt/n8n/hyperframes_uploads:/opt/n8n/hyperframes_uploads -w /work n8n-hyperframes-renderer bash -lc 'node --check scripts/build-social-narrator-video.mjs && node --check scripts/run-data-lab-video-pipeline.mjs && node --check scripts/trigger-n8n-build-render.mjs'"
```

Expected: syntax checks pass on restored files. If they do not, keep Summary Intake inactive and inspect the backup archive before any live request.

## Self-Review

- Spec coverage: The plan updates VPS runtime, preserves env/queue state, validates inside Docker, avoids publication, and keeps n8n patching out of scope unless workflow shape is wrong.
- Placeholder scan: No TBD/TODO/fill-in steps remain; every command has explicit paths and expected outcomes.
- Type consistency: The workflow id, paths, image name, script names, and template name match project docs.
- Review Focus coverage: Each listed failure mode has a validating step in Tasks 1 through 6.
