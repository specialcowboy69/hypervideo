import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_PERSONA } from "./ai-video-intake-schema.mjs";

export const PROMPT_NODE_NAME = "Set Summary And Prompt";
const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

export async function buildSummaryPromptCode(root = REPO_ROOT) {
  const [persona, prompt] = await Promise.all([
    readFile(path.join(root, DEFAULT_PERSONA), "utf8"),
    readFile(path.join(root, "content/video-queue/ai-intake-prompt.md"), "utf8")
  ]);
  const systemPrompt = `${persona.trim()}\n\n${prompt.trim()}`;
  // JSON encoding preserves quotes, backticks and newlines as literal data.
  return `const input = $json.body || $json.query || $json;
const summary = String(input.summary || '').trim();
if (!summary) throw new Error('summary is required.');
if (summary.length < 40) throw new Error('summary must contain at least 40 characters.');
const systemPrompt = ${JSON.stringify(systemPrompt)};
return [{ json: { summary, aiPrompt: systemPrompt + '\\n\\nResumen del usuario:\\n' + summary } }];`;
}

export function patchSummaryPrompt(workflow, code) {
  const matches = workflow.nodes.filter((node) => node.name === PROMPT_NODE_NAME);
  if (matches.length !== 1 || matches[0].type !== "n8n-nodes-base.code") {
    throw new Error(`Expected exactly one Code node named ${PROMPT_NODE_NAME}.`);
  }
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => node.name === PROMPT_NODE_NAME
      ? { ...node, parameters: { ...node.parameters, jsCode: code } }
      : node)
  };
}

async function main() {
  const exportPath = path.join(REPO_ROOT, "n8n/hyperframes-summary-intake-workflow.json");
  const workflow = JSON.parse(await readFile(exportPath, "utf8"));
  const updated = patchSummaryPrompt(workflow, await buildSummaryPromptCode());
  await writeFile(exportPath, JSON.stringify(updated, null, 2), "utf8");
  console.log("Updated local Summary Intake prompt export. No live workflow was changed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
