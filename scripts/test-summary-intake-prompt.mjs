import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSummaryPromptCode, patchSummaryPrompt } from "./sync-summary-intake-prompt.mjs";

const root = new URL("../", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");
const workflow = JSON.parse(await read("n8n/hyperframes-summary-intake-workflow.json"));
const persona = (await read("assets/character/personas/social-retention-teacher.md")).trim();
const prompt = (await read("content/video-queue/ai-intake-prompt.md")).trim();
const node = workflow.nodes.find((entry) => entry.name === "Set Summary And Prompt");
const execute = new Function("$json", node.parameters.jsCode);
const generatedCode = await buildSummaryPromptCode();
assert.equal(node.parameters.jsCode, generatedCode, "Regenerate the export after editing either prompt source");
const summary = "Explica con un ejemplo cómo conectar dos temas sin perder el foco de una web.";
for (const payload of [{ summary }, { body: { summary } }, { query: { summary } }]) {
  const [{ json }] = execute(payload);
  assert.equal(json.summary, summary);
  assert.equal(json.aiPrompt, `${persona}\n\n${prompt}\n\nResumen del usuario:\n${summary}`);
}
assert.throws(() => execute({}), /summary/i);
assert.throws(() => execute({ summary: "corto" }), /summary/i);
// Updating the prompt must preserve live routing, credentials and activation.
const live = structuredClone(workflow);
live.active = true;
live.nodes[0].credentials = { example: { id: "fixture-credential" } };
live.nodes.find((entry) => entry.name === node.name).parameters.jsCode = "return [];";
const before = structuredClone(live);
const updated = patchSummaryPrompt(live, generatedCode);
assert.deepEqual(live, before, "patch must not mutate the input workflow");
const expected = structuredClone(before);
expected.nodes.find((entry) => entry.name === node.name).parameters.jsCode = generatedCode;
assert.deepEqual(updated, expected);
assert.deepEqual(patchSummaryPrompt(updated, generatedCode), updated, "patch must be idempotent");
assert.throws(() => patchSummaryPrompt({ nodes: [] }, generatedCode), /exactly one Code node/);
assert.throws(() => patchSummaryPrompt({ nodes: [node, node] }, generatedCode), /exactly one Code node/);
console.log("summary-intake-prompt tests passed");
