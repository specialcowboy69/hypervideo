import assert from "node:assert/strict";

import { archiveCommandForPlatform, tarExecutable, uploadModeFromArgs } from "./trigger-n8n-build-render.mjs";

assert.equal(tarExecutable("win32"), "tar.exe");
assert.equal(tarExecutable("linux"), "tar");
assert.equal(
  archiveCommandForPlatform("linux", "/tmp/source.zip", "/work", ["scripts/build.mjs"]).file,
  "zip"
);
assert.equal(uploadModeFromArgs(["--vps-local"], {}), "local");
assert.equal(uploadModeFromArgs([], { HYPERFRAMES_VPS_LOCAL: "1" }), "local");
assert.equal(uploadModeFromArgs([], {}), "ssh");

console.log("trigger-n8n-build-render tests passed");
