#!/usr/bin/env bash
set -euo pipefail

slug="${1:-}"
sha="${2:-}"
job_id="${3:-}"
[[ $# -eq 3 && "$slug" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ && ${#slug} -le 80 ]] || exit 2
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$job_id" =~ ^hfb-[a-z0-9-]+-[0-9]+$ && "$job_id" == hfb-"$slug"-* ]] || exit 2

jobs=/opt/n8n/hyperframes_jobs
mkdir -p "$jobs"
exec 9>"$jobs/chat-render.lock"
flock -n 9 || { echo 'Another render is running' >&2; exit 3; }
work="$(mktemp -d "$jobs/chat-render.XXXXXXXX")"
trap 'rm -rf -- "$work"' EXIT

# The pinned request must be an ancestor of main; the running-state commit may already have advanced main.
git clone --quiet --branch main https://github.com/specialcowboy69/hypervideo.git "$work/repo"
git -C "$work/repo" merge-base --is-ancestor "$sha" origin/main || { echo 'Source commit is not on main' >&2; exit 4; }
git -C "$work/repo" checkout --quiet --detach "$sha"

docker run --rm --network host \
  --mount "type=bind,source=$work/repo,target=/work" \
  --mount 'type=bind,source=/opt/n8n/hyperframes_uploads,target=/opt/n8n/hyperframes_uploads' \
  --mount 'type=bind,source=/opt/n8n/hyperframes/.env local,target=/work/.env local,readonly' \
  --mount 'type=bind,source=/opt/n8n/hyperframes/.env.n8n,target=/work/.env.n8n,readonly' \
  --workdir /work n8n-hyperframes-renderer \
  node scripts/run-chat-render-draft.mjs --slug "$slug" --job-id "$job_id"
