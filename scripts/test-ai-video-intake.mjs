import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_PERSONA,
  normalizeAiVideoIntake,
  validateNormalizedIntake
} from "./ai-video-intake-schema.mjs";
import { writeVideoPackage } from "./create-video-from-summary.mjs";
import { pipelineCommandsFor } from "./run-data-lab-video-pipeline.mjs";

const input = {
  title: "Lanzamiento SEO 0 a 100",
  summary: "Construir en staging, publicar completo y escalar enlaces de forma proporcional.",
  scenes: [
    {
      id: "scene-01-hook",
      screen_text: "NO LANCES A MEDIAS",
      text: "Si publicas a trozos, Google ve migas sueltas.",
      stage: {
        type: "comparison",
        left: { label: "A TROZOS", value: "Ruido" },
        right: { label: "COMPLETO", value: "Sistema" }
      }
    },
    {
      screen_text: "PUBLICA COMPLETO",
      text: "La base tiene que salir como un sistema, no como una promesa.",
      stage: { type: "checklist", items: ["Arquitectura", "Contenido", "Enlaces"], checked: 2 }
    },
    {
      screen_text: "ESCALA ENLACES",
      text: "Los enlaces se escalan despues, segun el tamano real del proyecto.",
      stage: { type: "timeline", points: ["Dia 1", "Mes 1", "Mes 2", "Mes 3"] }
    },
    {
      screen_text: "COMENTA INFO",
      text: "Comenta INFO si quieres una checklist para lanzar sin improvisar.",
      stage: { type: "cta", word: "INFO", box: "Comenta INFO" }
    }
  ]
};

const normalized = normalizeAiVideoIntake(input);
validateNormalizedIntake(normalized);

// A useful closing must survive intake without an invented comment request.
for (const cta of [undefined, "", "   "]) {
  const noCta = normalizeAiVideoIntake({ ...input, cta });
  assert.equal(noCta.cta, "");
  assert.equal(noCta.caption, input.summary);
}
const explicitCta = normalizeAiVideoIntake({ ...input, cta: "Guarda este ejemplo" });
assert.equal(explicitCta.cta, "Guarda este ejemplo");
assert.equal(explicitCta.caption, `${input.summary} Guarda este ejemplo`);

assert.equal(normalized.template, "data-lab");
assert.equal(normalized.persona, "assets/character/personas/social-retention-teacher.md");
assert.equal(normalized.duration_target_s, 50);
assert.deepEqual(normalized.platforms, ["instagram"]);
assert.equal(normalized.status, "pending");
assert.match(normalized.slug, /^lanzamiento-seo-0-a-100/);
assert.equal(DEFAULT_PERSONA, "assets/character/personas/social-retention-teacher.md");

assert.throws(
  () => validateNormalizedIntake(normalizeAiVideoIntake({ title: "Sin resumen", scenes: [] })),
  /summary is required/
);

assert.throws(
  () => validateNormalizedIntake(normalizeAiVideoIntake({
    title: "Malo",
    summary: "ok",
    scenes: [{ screen_text: "X", text: "Y", stage: { type: "pie-chart" } }]
  })),
  /scenes must contain 4-7 items|invalid stage type/
);

const root = await mkdtemp(path.join(os.tmpdir(), "hf-ai-intake-"));
try {
  const packageIntake = normalizeAiVideoIntake({
    title: "Prueba Data Lab",
    summary: "Resumen de prueba",
    caption: "Caption de prueba",
    scenes: [
      { screen_text: "HOOK", text: "Texto uno", stage: { type: "comparison", left: { label: "A", value: "B" }, right: { label: "C", value: "D" } } },
      { screen_text: "SISTEMA", text: "Texto dos", stage: { type: "timeline", points: ["A", "B", "C", "D"], values: ["1", "2", "3", "4"] } },
      { screen_text: "DATO", text: "Texto tres", stage: { type: "dashboard", metrics: [{ label: "CTR", value: "6%" }] } },
      { screen_text: "APLICALO", text: "Texto cuatro", stage: { type: "checklist", items: ["Conecta los temas"], checked: 1 } }
    ]
  });
  const result = await writeVideoPackage({ root, intake: packageIntake });
  const voiceover = JSON.parse(await readFile(path.join(result.contentDir, "voiceover.scenes.json"), "utf8"));
  const queue = JSON.parse(await readFile(path.join(root, "content", "video-queue", "queue.json"), "utf8"));
  const csv = await readFile(path.join(root, "content", "video-queue", "video-queue.csv"), "utf8");

  assert.equal(voiceover.project.visual_template, "data-lab");
  assert.equal(voiceover.project.persona, DEFAULT_PERSONA);
  assert.equal(queue.items[0].status, "pending");
  assert.equal(queue.items[0].cta, "");
  assert.equal(queue.items[0].caption, "Caption de prueba");
  assert.deepEqual(voiceover.scenes.at(-1), packageIntake.scenes.at(-1));
  assert.equal(voiceover.scenes.at(-1).stage.type, "checklist");
  assert.ok(!csv.includes("Comenta INFO"));
  assert.match(csv, /prueba-data-lab/);
} finally {
  await rm(root, { recursive: true, force: true });
}

const commands = pipelineCommandsFor({ slug: "prueba-data-lab", input: "ai-output.json" });
assert.deepEqual(commands.map((cmd) => cmd.file), [
  "node",
  "node",
  "node"
]);
assert.match(commands[0].args.join(" "), /create-video-from-summary/);
assert.match(commands[1].args.join(" "), /elevenlabs-generate-scenes/);
assert.match(commands[2].args.join(" "), /trigger-n8n-build-render/);
assert.match(commands[2].args.join(" "), /--template data-lab/);

const vpsCommands = pipelineCommandsFor({
  slug: "prueba-data-lab",
  input: "ai-output.json",
  envPath: ".env.n8n",
  vpsLocal: true
});
assert.match(vpsCommands[2].args.join(" "), /--env \.env\.n8n/);
assert.match(vpsCommands[2].args.join(" "), /--vps-local/);

console.log("ai-video-intake tests passed");
