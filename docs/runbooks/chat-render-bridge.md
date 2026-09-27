# Chat to VPS draft render bridge

This route uses the manual HyperFrames video queue. It does not activate Summary Intake and never invokes the Reel publisher.

## One-time setup after merging the bridge

1. On the VPS, update `/opt/n8n/hyperframes` to the merged main commit. Verify the existing renderer image, `/opt/n8n/hyperframes_uploads`, `/opt/n8n/hyperframes_jobs`, `.env local` and `.env.n8n` exist. Do not print the env contents.
2. Install `scripts/vps/chat-render-ssh-guard.sh` as root-owned `/usr/local/sbin/hyperframes-render-ssh-guard` and `scripts/vps/chat-render-vps-wrapper.sh` as root-owned `/usr/local/sbin/hyperframes-render-vps`, both mode 0755. The latter is the only command allowed through sudo for the dedicated `hfrender` account. The SSH key entry must use `command="/usr/local/sbin/hyperframes-render-ssh-guard",restrict` before the public key. Make the key exclusive to this integration; do not reuse your PC key. The guard validates the original SSH request and the root-owned wrapper validates it again.
3. Give `hfrender` permission through a dedicated sudoers entry for `/usr/local/sbin/hyperframes-render-vps *` only. Verify the wrapper itself is root-owned and not writable by `hfrender`. The wrapper runs Docker as root after validating its two arguments; review this privilege boundary before granting sudo. The account needs no general Docker group membership.
4. Generate the dedicated ED25519 key outside chat. Put its public half into the new account's `~/.ssh/authorized_keys` and its private half into the GitHub Actions repository secret `HYPERFRAMES_DEPLOY_KEY`. Do not commit either key or paste the private key into chat. Verify SSH directory/file permissions are 0700/0600.
5. Set repository variables `HYPERFRAMES_SSH_HOST`, `HYPERFRAMES_SSH_USER` (normally `hfrender`) and `HYPERFRAMES_SSH_HOST_KEY`. The last variable is one complete known_hosts line with your VPS hostname/IP and the trusted ED25519 host public key obtained on the VPS; verify its fingerprint through a separate trusted channel. Do not disable strict host-key checking.
6. Create the two GitHub issue labels `hyperframes:validate` and `hyperframes:render-draft`. Allow GitHub Actions in the repository and permit this workflow to use `contents: write` and `issues: write` for its render job. If main branch protection disallows workflow commits, change the queue update to a PR before the first render. Verify the n8n `hyperframes-build-render` and `hyperframes-render-status` webhooks are operational; the Summary Intake webhook can stay inactive.

For steps 2–3, install the merged files with:

```sh
sudo useradd --create-home --shell /bin/bash hfrender
sudo install -o root -g root -m 0755 /opt/n8n/hyperframes/scripts/vps/chat-render-ssh-guard.sh /usr/local/sbin/hyperframes-render-ssh-guard
sudo install -o root -g root -m 0755 /opt/n8n/hyperframes/scripts/vps/chat-render-vps-wrapper.sh /usr/local/sbin/hyperframes-render-vps
sudo visudo -f /etc/sudoers.d/hyperframes-render
```

The last command opens a root-owned sudoers file: add the single line `hfrender ALL=(root) NOPASSWD: /usr/local/sbin/hyperframes-render-vps *`. Do not grant `hfrender` unrestricted sudo or Docker group access. If the account exists already, omit `useradd`. Add the public key to `/home/hfrender/.ssh/authorized_keys` prefixed with the forced-command options above; verify ownership and mode before testing. Keep the private key only in GitHub Actions secrets, not on the VPS after setup.

## Request from ChatGPT

1. Create a complete video source package and a pending entry in both queue.json and video-queue.csv, then merge the reviewed changes into main.
2. Create a GitHub issue authored by the repository owner. Its body must have exactly two lines, `slug: <slug>` and `sha: <40-character-main-commit-sha>`. The SHA must still be the current main HEAD when the label is applied.
3. Apply `hyperframes:validate` first. GitHub Actions checks owner, SHA, package files, queue and scene text without any production secret or external paid service. Read its job result.
4. Apply `hyperframes:render-draft` to the same issue. The Action runs one job at a time and rechecks the current queue after waiting. It commits an `in_progress` state with a durable job ID and Actions URL before any paid operation. The forced SSH command asks the VPS to check out the request SHA, generate ElevenLabs scene audio and invoke the existing build/render n8n workflow with `--vps-local --job-id <id>`.
5. On success the Action updates queue.json and CSV to `needs_review`, commits the result to main and comments the R2 MP4 URL and job ID on the issue. If SSH setup definitely fails before sending a job, it records `blocked`. If the remote connection fails after dispatch, it keeps `in_progress` and comments the job ID and Actions URL: check n8n status before deciding whether to retry. If the queue push fails, the Action fails rather than silently claiming that state was synchronized.

## Local checks before any VPS work

```sh
node scripts/test-validate-chat-render-request.mjs
node scripts/test-check-chat-render-issue.mjs
node scripts/test-chat-render-bridge.mjs
node scripts/test-check-chat-render-current.mjs
node scripts/test-trigger-n8n-build-render.mjs
bash -n scripts/vps/chat-render-ssh-guard.sh scripts/vps/chat-render-vps-wrapper.sh
```

## Safety and troubleshooting

- A failed or missing HTTPS MP4 URL never becomes `needs_review`.
- Reapplying the render label after a successful comment for the same slug and SHA skips another paid job. The job also rechecks the latest queue after serialization, so a second queued request cannot downgrade a finished draft. For a revised script, create a new commit and new issue.
- A blocked item may be retried through a fresh issue and the current main SHA. An `in_progress` item with uncertain remote status cannot be retried automatically: use its stored job ID to reconcile with n8n first.
- If main changes before the label is applied, validation refuses the old SHA. After dispatch, the bridge itself advances main to record the running job; the VPS checks that the requested source SHA is still an ancestor of main and executes that pinned source.
- Generated audio and ZIP bundles remain temporary and untracked; the R2 URL and job state are written to the queue.
- The Actions runner needs SSH to the VPS; the VPS needs outbound GitHub, ElevenLabs, and its existing n8n/Cloudflare routes. This chat session itself does not need direct VPS access.
- There is no call to `schedule-instagram-reel.mjs` in the bridge. Publication still requires the user's separate approval.
