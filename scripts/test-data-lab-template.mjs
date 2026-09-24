import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const slug = "__data_lab_template_test__";
const pendingDir = resolve(root, "content", "video-queue", "pending", slug);
const audioDir = resolve(root, "assets", "character", "audio", "generated", slug);
const videoDir = resolve(root, "videos", slug);
const retentionPersona = "assets/character/personas/social-retention-teacher.md";

const scenes = [
  ["scene-01-serp", "SERP BAJO CONTROL", "Una SERP clara enseña qué resultado se lleva la atención.", { type: "serp", query: "seo local madrid", results: ["Mapa local", "Guía completa", "Comparativa"], highlight: "Posición 3", metric: "CTR 7.8%" }],
  ["scene-02-dashboard", "MIRA LA FOTO ENTERA", "Tráfico, leads y coste juntos muestran si la campaña avanza.", { type: "dashboard", label: "Panel SEO", metrics: [{ label: "Leads", value: "+38%" }, { label: "CTR", value: "7.8%" }, { label: "CPC", value: "1.12" }], trend: [24, 34, 30, 44, 52, 68] }],
  ["scene-03-keywords", "AGRUPA LA INTENCION", "Una keyword aislada no explica la intención completa del usuario.", { type: "keyword-map", core: "auditoria seo", clusters: ["tecnico", "local", "ecommerce", "barato"] }],
  ["scene-04-funnel", "DEL CLIC AL DINERO", "Si el funnel pierde gente, el problema no era el algoritmo.", { type: "funnel", steps: ["Anuncio", "Landing", "Lead", "Venta"], leak: "Formulario eterno" }],
  ["scene-05-comparison", "ANTES Y DESPUES", "La comparación muestra qué cambia cuando la acción es clara.", { type: "comparison", left: { label: "Antes", value: "Informe eterno" }, right: { label: "Despues", value: "Accion clara" } }],
  ["scene-06-checklist", "AUDITA SIN HUMO", "Tres comprobaciones bien elegidas ayudan a decidir la prioridad.", { type: "checklist", items: ["Intencion", "Tracking", "Prioridad"], checked: 2 }],
  ["scene-07-timeline", "MIDE LA EVOLUCION", "El crecimiento serio se ve en tendencia, no en capturas sueltas.", { type: "timeline", label: "Ranking", points: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"], values: ["18", "11", "7", "3"] }],
  ["scene-08-cta", "PIDE EL MAPA", "Comenta DATA y te paso la plantilla de analisis.", { type: "cta", word: "DATA", box: "Comenta DATA y te envio el mapa de analisis." }]
];

const manifest = {
  project: {
    slug,
    language: "es",
    persona: retentionPersona,
    target_duration_s: 48,
    visual_template: "data-lab",
    title: "Data Lab Test",
    ghost: ["DATA", "LAB"]
  },
  scenes: scenes.map(([id, screenText, text, stage], index) => ({
    id,
    label: `SCENE ${index + 1}`,
    screen_text: screenText,
    text,
    visual_note: "Test data-lab visual block.",
    stage
  }))
};

const timing = {
  project: manifest.project,
  total_duration_s: 48,
  scenes: scenes.map(([id], index) => ({
    id,
    start: index * 6,
    end: index * 6 + 6
  }))
};

try {
  await rm(pendingDir, { recursive: true, force: true });
  await rm(audioDir, { recursive: true, force: true });
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(pendingDir, { recursive: true });
  await mkdir(audioDir, { recursive: true });
  await writeFile(join(pendingDir, "voiceover.scenes.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(audioDir, "voiceover-timing.json"), `${JSON.stringify(timing, null, 2)}\n`);
  await writeFile(join(audioDir, "voiceover-master.mp3"), "test audio placeholder");

  const result = spawnSync(process.execPath, ["scripts/build-social-narrator-video.mjs", "--slug", slug, "--template", "data-lab"], {
    cwd: root,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const indexHtml = await readFile(join(videoDir, "index.html"), "utf8");
  const packageJson = await readFile(join(videoDir, "package.json"), "utf8");
  const mainJs = await readFile(join(videoDir, "assets", "main.js"), "utf8");
  const css = await readFile(join(videoDir, "assets", "social-narrator.css"), "utf8");
  const serpScene = await readFile(join(videoDir, "compositions", "scene-hook.html"), "utf8");
  const dashboardScene = await readFile(join(videoDir, "compositions", "scene-problem.html"), "utf8");
  const generatedScenes = await Promise.all([
    "scene-hook.html",
    "scene-problem.html",
    "scene-system.html",
    "scene-payoff.html",
    "scene-cta.html"
  ].map((file) => readFile(join(videoDir, "compositions", file), "utf8")));
  const generatedSceneHtml = generatedScenes.join("\n");
  const remoteTrigger = await readFile(join(root, "scripts", "trigger-n8n-build-render.mjs"), "utf8");
  const builtTiming = JSON.parse(await readFile(join(videoDir, "voiceover-timing.json"), "utf8"));

  assert.match(indexHtml, /template-data-lab/);
  assert.doesNotMatch(indexHtml, /three\/addons|three\.module|canvasWrap|narrator\.js/);
  assert.doesNotMatch(packageJson, /hyperframes@0\.8\.6(?!\d)/);
  assert.match(packageJson, /hyperframes@0\.8\.63/);
  assert.equal(existsSync(join(videoDir, "assets", "narrator.js")), false);
  assert.equal(existsSync(join(videoDir, "assets", "breathing.glb")), false);
  assert.match(indexHtml, /id="subtitle"/);
  assert.match(indexHtml, /voiceover/);
  assert.match(mainJs, /renderAt/);
  assert.match(mainJs, /subtitleEl\.textContent/);
  assert.match(css, /template-data-lab/);
  assert.match(css, /\.template-data-lab \.stage-takeaway/);
  assert.match(css, /\.template-data-lab \.data-lab-bottom-band/);
  assert.match(css, /\.template-data-lab \.copy,[\s\S]*max-height: 118px/);
  assert.match(css, /\.template-data-lab \.subtitle\s*\{[\s\S]*top: 1250px/);
  assert.match(serpScene, /data-lab-serp/);
  assert.match(serpScene, /Test data-lab visual block\./);
  assert.doesNotMatch(serpScene, /Una SERP clara enseña/);
  assert.match(dashboardScene, /data-lab-dashboard/);
  assert.match(generatedSceneHtml, /class="stage-takeaway"/);
  assert.match(generatedSceneHtml, /class="data-lab-bottom-band"/);
  assert.match(generatedSceneHtml, /function animateDataLabStage/);
  assert.match(generatedSceneHtml, /\.stage-takeaway/);
  assert.match(generatedSceneHtml, /\.data-lab-bottom-band \.lab-trace/);
  assert.match(generatedSceneHtml, /\.serp-result\.active/);
  assert.match(generatedSceneHtml, /\.dashboard-chart i/);
  assert.match(generatedSceneHtml, /scaleY/);
  assert.match(generatedSceneHtml, /\.keyword-core/);
  assert.match(generatedSceneHtml, /\.funnel-step/);
  assert.match(generatedSceneHtml, /\.comparison-vs/);
  assert.match(generatedSceneHtml, /\.checklist-item span/);
  assert.match(generatedSceneHtml, /\.timeline-line/);
  assert.match(generatedSceneHtml, /\.cta-panel/);
  assert.match(remoteTrigger, /data-lab/);
  assert.match(remoteTrigger, /requiresCharacterAssets/);
  assert.equal(manifest.project.persona, retentionPersona);
  assert.equal(builtTiming.project.persona, retentionPersona);
} finally {
  await rm(pendingDir, { recursive: true, force: true });
  await rm(audioDir, { recursive: true, force: true });
  await rm(videoDir, { recursive: true, force: true });
}
