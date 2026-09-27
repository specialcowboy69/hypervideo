#!/usr/bin/env bash
set -euo pipefail

# Install root-owned as the forced command for the dedicated authorized_keys entry.
read -r verb slug sha job_id extra <<< "${SSH_ORIGINAL_COMMAND:-}"
[[ "$verb" == render && -z "${extra:-}" ]] || exit 2
[[ "$slug" =~ ^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$ && ${#slug} -le 80 ]] || exit 2
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$job_id" =~ ^hfb-[a-z0-9-]+-[0-9]+$ && "$job_id" == hfb-"$slug"-* ]] || exit 2
exec sudo -n /usr/local/sbin/hyperframes-render-vps "$slug" "$sha" "$job_id"
