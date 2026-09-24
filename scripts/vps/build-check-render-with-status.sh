#!/usr/bin/env bash
set -euo pipefail

SOURCE_ZIP="${1:?source zip path required}"
MODE="${2:-draft}"
SLUG="${3:?slug required}"
JOB_ID="${4:-${SLUG}-build-$(date +%Y%m%d-%H%M%S)}"
TEMPLATE="${5:-}"

if [[ ! "$SLUG" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "Invalid slug: $SLUG" >&2
  exit 1
fi

if [[ "$MODE" == "standard" ]]; then
  MODE="final"
fi

if [[ "$MODE" != "draft" && "$MODE" != "final" ]]; then
  echo "Invalid mode: $MODE" >&2
  exit 1
fi

JOB_DIR="/work/jobs/${JOB_ID}"
STATUS_FILE="${JOB_DIR}/status.json"
LOG_FILE="${JOB_DIR}/render.log"
WORKSPACE="${JOB_DIR}/workspace"
PROJECT_DIR="${WORKSPACE}/videos/${SLUG}"
RENDER_ZIP="${JOB_DIR}/${SLUG}-renderable.zip"
SNAPSHOTS_DIR="${PROJECT_DIR}/snapshots"

mkdir -p "$JOB_DIR" "$WORKSPACE" /work/outputs

write_status() {
  local status="$1"
  local step="$2"
  local progress="$3"
  local message="$4"
  local download_url="${5:-}"

  local last_log=""
  if [ -f "$LOG_FILE" ]; then
    last_log="$(tail -n 1 "$LOG_FILE" || true)"
  fi

  STATUS="$status" \
  STEP="$step" \
  PROGRESS="$progress" \
  MESSAGE="$message" \
  DOWNLOAD_URL="$download_url" \
  LAST_LOG="$last_log" \
  JOB_ID="$JOB_ID" \
  SLUG="$SLUG" \
  MODE="$MODE" \
  LOG_FILE="$LOG_FILE" \
  SNAPSHOTS_DIR="$SNAPSHOTS_DIR" \
  node - <<'NODE' > "$STATUS_FILE"
const out = {
  jobId: process.env.JOB_ID,
  slug: process.env.SLUG,
  mode: process.env.MODE,
  status: process.env.STATUS,
  step: process.env.STEP,
  progress: Number(process.env.PROGRESS),
  message: process.env.MESSAGE,
  updatedAt: new Date().toISOString(),
  logFile: process.env.LOG_FILE,
  snapshotsDir: process.env.SNAPSHOTS_DIR,
  lastLog: process.env.LAST_LOG || ""
};
if (process.env.DOWNLOAD_URL) out.downloadUrl = process.env.DOWNLOAD_URL;
console.log(JSON.stringify(out, null, 2));
NODE
}

fail_step() {
  local step="$1"
  local message="$2"
  write_status "failed" "$step" 100 "$message"
}

extract_progress() {
  if [ ! -f "$LOG_FILE" ]; then
    echo 55
    return
  fi

  local pct=""
  pct="$(grep -aoE '[0-9]{1,3}%[[:space:]]+(Processing audio tracks|Streaming frame|Assembling final video|Render complete)' "$LOG_FILE" | tail -1 | grep -aoE '^[0-9]{1,3}' || true)"
  if [ -n "$pct" ]; then
    if [ "$pct" -lt 55 ]; then echo 55; else echo "$pct"; fi
    return
  fi

  if grep -q "Checking source" "$LOG_FILE"; then
    echo 55
    return
  fi

  echo 60
}

extract_step() {
  if [ ! -f "$LOG_FILE" ]; then
    echo "render"
    return
  fi

  if grep -q "Render complete" "$LOG_FILE"; then echo "done"; return; fi
  if grep -q "Assembling final video" "$LOG_FILE"; then echo "assemble"; return; fi
  if grep -q "Streaming frame" "$LOG_FILE"; then echo "capture"; return; fi
  if grep -q "Processing audio tracks" "$LOG_FILE"; then echo "audio"; return; fi
  if grep -q "Checking source" "$LOG_FILE"; then echo "render-check"; return; fi
  echo "render"
}

write_status "queued" "received" 2 "Job recibido"

if [ ! -f "$SOURCE_ZIP" ]; then
  fail_step "source" "Source ZIP no encontrado"
  exit 1
fi

{
  echo "[$(date -Iseconds)] Source ZIP: $SOURCE_ZIP"
  echo "[$(date -Iseconds)] Job: $JOB_ID"
  echo "[$(date -Iseconds)] Slug: $SLUG"
  echo "[$(date -Iseconds)] Mode: $MODE"
} >> "$LOG_FILE"

write_status "preparing" "extract" 8 "Extrayendo bundle fuente"
unzip -q "$SOURCE_ZIP" -d "$WORKSPACE" >> "$LOG_FILE" 2>&1

if [ ! -f "${WORKSPACE}/scripts/build-social-narrator-video.mjs" ]; then
  fail_step "source" "Falta scripts/build-social-narrator-video.mjs en el bundle"
  exit 1
fi

if [ ! -f "${WORKSPACE}/content/video-queue/pending/${SLUG}/voiceover.scenes.json" ]; then
  fail_step "source" "Falta voiceover.scenes.json para ${SLUG}"
  exit 1
fi

if [ ! -f "${WORKSPACE}/assets/character/audio/generated/${SLUG}/voiceover-master.mp3" ]; then
  fail_step "source" "Falta voiceover-master.mp3 para ${SLUG}"
  exit 1
fi

if [ ! -f "${WORKSPACE}/assets/character/audio/generated/${SLUG}/voiceover-timing.json" ]; then
  fail_step "source" "Falta voiceover-timing.json para ${SLUG}"
  exit 1
fi

write_status "building" "build" 18 "Construyendo proyecto HyperFrames"
cd "$WORKSPACE"
BUILD_ARGS=(scripts/build-social-narrator-video.mjs --slug "$SLUG")
if [ -n "$TEMPLATE" ]; then
  BUILD_ARGS+=(--template "$TEMPLATE")
fi
if ! node "${BUILD_ARGS[@]}" >> "$LOG_FILE" 2>&1; then
  fail_step "build" "Build fallido"
  exit 1
fi

if [ ! -f "${PROJECT_DIR}/index.html" ]; then
  fail_step "build" "No se genero videos/${SLUG}/index.html"
  exit 1
fi

write_status "checking" "check" 32 "Ejecutando check y snapshots"
cd "$PROJECT_DIR"
if ! npm run check -- --snapshots --timeout 60000 >> "$LOG_FILE" 2>&1; then
  fail_step "check" "Check o snapshots fallaron"
  exit 1
fi

write_status "packaging" "package" 48 "Empaquetando proyecto renderizable"
rm -f "$RENDER_ZIP"
if ! zip -qr "$RENDER_ZIP" index.html package.json hyperframes.json voiceover-timing.json assets compositions >> "$LOG_FILE" 2>&1; then
  fail_step "package" "Empaquetado fallido"
  exit 1
fi

write_status "rendering" "render" 55 "Render remoto iniciado"
(
  while true; do
    sleep 10
    PCT="$(extract_progress)"
    STEP="$(extract_step)"
    write_status "rendering" "$STEP" "$PCT" "Render en ejecucion"
  done
) &
HEARTBEAT_PID="$!"

set +e
render-hyperframes-job "$RENDER_ZIP" "$MODE" "$SLUG" >> "$LOG_FILE" 2>&1
EXIT_CODE="$?"
set -e

kill "$HEARTBEAT_PID" >/dev/null 2>&1 || true

if [ "$EXIT_CODE" -ne 0 ]; then
  fail_step "render" "Render fallido"
  exit "$EXIT_CODE"
fi

OUTPUT_FILE="$(find /work/outputs -maxdepth 1 -type f -name "${SLUG}*.mp4" -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
DOWNLOAD_URL="$(grep -aoE 'https?://[^[:space:]"'"'"'<>]+\.mp4([^[:space:]"'"'"'<>]*)?' "$LOG_FILE" | tail -1 || true)"

write_status "rendered" "output" 92 "Render terminado" "$DOWNLOAD_URL"

JOB_ID="$JOB_ID" \
SLUG="$SLUG" \
MODE="$MODE" \
OUTPUT_FILE="$OUTPUT_FILE" \
DOWNLOAD_URL="$DOWNLOAD_URL" \
SNAPSHOTS_DIR="$SNAPSHOTS_DIR" \
node - <<'NODE' > "${JOB_DIR}/result.json"
const out = {
  jobId: process.env.JOB_ID,
  slug: process.env.SLUG,
  mode: process.env.MODE,
  outputFile: process.env.OUTPUT_FILE || "",
  downloadUrl: process.env.DOWNLOAD_URL || "",
  snapshotsDir: process.env.SNAPSHOTS_DIR || "",
  finishedAt: new Date().toISOString()
};
console.log(JSON.stringify(out, null, 2));
NODE

write_status "completed" "done" 100 "Build, check, snapshots y render completados" "$DOWNLOAD_URL"
