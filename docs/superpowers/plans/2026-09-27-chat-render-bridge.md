# Chat Render Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Validate a video package from this chat via GitHub, then invoke the existing VPS draft pipeline and return the R2 review URL without publishing.

**Architecture:** An owner-created GitHub issue contains a slug and main-branch SHA. An `issues:labeled` workflow validates the package on a runner, and a separate render label connects to a restricted VPS command. The VPS uses its existing ElevenLabs and Cloudflare credentials, returns a structured result, and the workflow synchronizes the queue and reports status on the issue.

**Tech Stack:** Node.js ESM built-ins, GitHub Actions, SSH, existing n8n/VPS Docker renderer.

**Spec:** `docs/superpowers/specs/2026-09-27-chat-render-bridge-design.md`

## Global Constraints

- A complete-video request includes one draft render; scheduling and publishing remain separate and require explicit approval.
- The first integration test invokes no ElevenLabs, n8n, VPS renderer, or publication endpoint.
- Source packages and planning state live in GitHub; generated audio, ZIP and MP4 files do not.
- Use the existing `scripts/elevenlabs-generate-scenes.mjs` and `scripts/trigger-n8n-build-render.mjs --vps-local --mode draft` from the VPS Docker runtime.
- Render one job at a time. Never let untrusted issue text become shell code.

## Review Focus

- An issue with `../`, shell punctuation, or a malformed SHA must fail before remote execution (Task 1 test).
- An old main SHA must fail before paid processing (Task 1 test).
- A missing brief, structure, visual plan, scene text, CSV row, or queue item must fail validation (Task 1 test).
- Reapplying a render label after a successful result must not start a second paid job (Task 2 test).
- A failed remote render or missing download URL must never be reported as `needs_review` (Task 3 test).

---

### Task 1: Validate the production package without secrets

**Files:**
- Create: `scripts/validate-chat-render-request.mjs`
- Create: `scripts/test-validate-chat-render-request.mjs`

**Interfaces:**
- Produces: `parseRequest(body: string) -> {slug:string, sha:string}`, `validatePackage(root: string, slug: string) -> Promise<{slug:string,template:string}>`.
- CLI: `node scripts/validate-chat-render-request.mjs --slug <slug>` prints `{slug,template}` or exits nonzero. SHA membership is checked by GitHub workflow against the checked-out main commit.

- [x] **Step 1: Write failing tests** for accepted slug and template, invalid slug/SHA, missing each package element, empty scene text, absent queue item and CSV row.
- [x] **Step 2: Run** `node scripts/test-validate-chat-render-request.mjs`; expect failure.
- [x] **Step 3: Implement** the exported functions and CLI using Node built-ins, preserving existing queue and template conventions.
- [x] **Step 4: Run** the test script; expect all assertions to pass.
- [x] **Step 5: Commit** the validator and tests.

### Task 2: GitHub label trigger, with a free validation path

**Files:**
- Create: `.github/workflows/chat-render-bridge.yml`
- Create: `scripts/check-chat-render-issue.mjs`
- Create: `scripts/test-check-chat-render-issue.mjs`

**Interfaces:**
- Consumes Task 1's `parseRequest` and `validatePackage`.
- Produces: issue label `hyperframes:validate` as local validation; `hyperframes:render-draft` as VPS job request. Uses repository owner as issue author, SHA exactly equal to event main SHA, and a single global render concurrency group.
- `checkChatRenderIssue(issue, comments, expectedOwner) -> {skip:boolean}` detects a prior successful render marker for the same slug and SHA.

- [x] **Step 1: Write failing tests** for owner identity, stale SHA, duplicate successful marker and harmless issue text handling.
- [x] **Step 2: Run** `node scripts/test-check-chat-render-issue.mjs`; expect failure.
- [x] **Step 3: Implement** workflow validation job with read-only permissions and no secrets for validation; render job guarded by the render label and SSH secret. Pass issue data through environment variables, never inline shell expansion.
- [x] **Step 4: Run** both test scripts and parse workflow YAML; expect success.
- [x] **Step 5: Commit** workflow, duplicate check and tests.

### Task 3: VPS draft execution and queue reconciliation

**Files:**
- Create: `scripts/run-chat-render-draft.mjs`
- Create: `scripts/update-chat-render-queue.mjs`
- Create: `scripts/test-chat-render-bridge.mjs`
- Create: `docs/runbooks/chat-render-bridge.md`
- Modify: `.github/workflows/chat-render-bridge.yml`

**Interfaces:**
- Consumes Task 1's package metadata; runs existing scene generator and remote render trigger from an exact main SHA checked out on VPS, with `.env local` and `.env.n8n` mounted into Docker.
- Produces a last-line JSON event `{event:"review_ready",slug,jobId,downloadUrl}` on success; a nonzero exit and no `review_ready` event on failure.
- `updateQueue(root, {slug,jobId,downloadUrl,status}) -> Promise<void>` changes only the matching JSON item and matching CSV row; rejects missing item or invalid URL. GitHub workflow commits the queue update with retries for concurrent main changes and comments a URL on the triggering issue.

- [x] **Step 1: Write failing tests** for dry-run command selection, failed remote exit, no URL, preservation of unrelated rows and no publication commands.
- [x] **Step 2: Run** `node scripts/test-chat-render-bridge.mjs`; expect failure.
- [x] **Step 3: Implement** runner, queue updater, workflow remote step and runbook with exact one-time VPS/GitHub setup.
- [x] **Step 4: Run** all new tests and existing `scripts/test-trigger-n8n-build-render.mjs`; expect success.
- [ ] **Step 5: Commit** runner, updater, workflow and runbook.

## Final checks

- [ ] Run all scripts/test-*.mjs tests that do not contact external services.
- [ ] Review the branch diff for secret leakage and unexpected publish calls.
- [ ] Open a draft PR with the VPS setup steps, validation results and untested live-render boundary.
