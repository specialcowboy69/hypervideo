#!/usr/bin/env node
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sceneKeys = ["hook", "problem", "system", "payoff", "cta"];
const HYPERFRAMES_VERSION = "0.8.63";

const args = parseArgs(process.argv.slice(2));
const slug = args.slug;
if (!slug) fail("Usage: node scripts/build-social-narrator-video.mjs --slug <video-slug>");

const root = process.cwd();
const contentDir = resolve(root, "content", "video-queue", "pending", slug);
const videoDir = resolve(root, "videos", slug);
const assetsDir = resolve(videoDir, "assets");
const compositionsDir = resolve(videoDir, "compositions");
const scenesPath = resolve(contentDir, "voiceover.scenes.json");
const audioDir = resolve(root, "assets", "character", "audio", "generated", slug);
const timingPath = resolve(audioDir, "voiceover-timing.json");
const masterAudioPath = resolve(audioDir, "voiceover-master.mp3");

if (!existsSync(scenesPath)) fail(`Missing ${scenesPath}`);
if (!existsSync(timingPath)) fail(`Missing ${timingPath}`);
if (!existsSync(masterAudioPath)) fail(`Missing ${masterAudioPath}`);

const sceneManifest = JSON.parse(await readFile(scenesPath, "utf8"));
const timing = JSON.parse(await readFile(timingPath, "utf8"));
const requestedTemplate = args.template || sceneManifest.project?.visual_template || "";
const config = configFor(slug, sceneManifest, requestedTemplate);
const template = normalizeTemplate(requestedTemplate || config.template || "dark-tech");
const templateProfile = templateProfileFor(template);
config.template = template;
const duration = round(getAudioDuration(masterAudioPath) || timing.total_duration_s);
const blocks = buildBlocks({ config, timing, duration, manifest: sceneManifest });

await mkdir(assetsDir, { recursive: true });
await mkdir(compositionsDir, { recursive: true });
if (templateProfile.hasNarrator) await copyCharacterAssets(assetsDir);
await copyFile(masterAudioPath, resolve(assetsDir, `${slug}-voice.mp3`));
await copyFile(timingPath, resolve(videoDir, "voiceover-timing.json"));
await writeFile(resolve(videoDir, "package.json"), packageJson(slug));
await writeFile(resolve(videoDir, "hyperframes.json"), hyperframesJson());
await writeFile(resolve(videoDir, "index.html"), html({ slug, config, duration, blocks, templateProfile }));
await writeFile(resolve(assetsDir, "social-narrator.css"), sharedCss(template));
await writeFile(resolve(assetsDir, "main.js"), mainJs({ blocks, duration, template }));
if (templateProfile.hasNarrator) {
  await writeFile(resolve(assetsDir, "narrator.js"), narratorJs({ duration, template }));
}
for (const [index, scene] of config.scenes.entries()) {
  const key = sceneKeys[index] || safeId(timing.scenes[index]?.id || `scene-${index + 1}`);
  await writeFile(resolve(compositionsDir, `scene-${key}.html`), sceneCompositionHtml(scene, key, blocks[index], template));
}

console.log(`Built videos/${slug} with ${template}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    out[item.slice(2)] = argv[i + 1];
    i += 1;
  }
  return out;
}

function normalizeTemplate(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "videos/arquitectura-informacion" || raw === "arquitectura-informacion" || raw === "dark" || raw === "dark-tech") {
    return "dark-tech";
  }
  if (raw === "videos/light-workshop" || raw === "light-workshop" || raw === "light" || raw === "workshop") {
    return "light-workshop";
  }
  if (raw === "data-lab" || raw === "datalab" || raw === "data_lab" || raw === "lab" || raw === "marketing-lab") {
    return "data-lab";
  }
  fail(`Unknown visual template ${value}`);
}

function templateProfileFor(template) {
  return {
    hasNarrator: template !== "data-lab",
    titleSuffix: template === "data-lab" ? "Data Lab" : "Narrador 3D"
  };
}

async function copyCharacterAssets(outDir) {
  const candidates = [
    ["breathing.glb", resolve(root, "videos", "arquitectura-informacion", "assets", "breathing.glb"), resolve(root, "assets", "character", "Breathing-Idle.glb")],
    ["talking.glb", resolve(root, "videos", "arquitectura-informacion", "assets", "talking.glb"), resolve(root, "assets", "character", "Talking.glb")],
    ["happy-hand.glb", resolve(root, "videos", "arquitectura-informacion", "assets", "happy-hand.glb"), resolve(root, "assets", "character", "Happy-Hand-Gesture.glb")],
    ["yelling.glb", resolve(root, "videos", "arquitectura-informacion", "assets", "yelling.glb"), resolve(root, "assets", "character", "Yelling.glb")]
  ];

  for (const [target, preferred, fallback] of candidates) {
    const source = existsSync(preferred) ? preferred : fallback;
    if (!existsSync(source)) fail(`Missing narrator asset for ${target}`);
    await copyFile(source, resolve(outDir, target));
  }
}

function packageJson(name) {
  return `${JSON.stringify({
    name,
    private: true,
    type: "module",
    scripts: {
      dev: `npx --yes hyperframes@${HYPERFRAMES_VERSION} preview`,
      check: `npx --yes hyperframes@${HYPERFRAMES_VERSION} check`,
      "render:draft": `npx --yes hyperframes@${HYPERFRAMES_VERSION} render --quality draft --crf 26`,
      render: `npx --yes hyperframes@${HYPERFRAMES_VERSION} render --quality standard --crf 23`
    }
  }, null, 2)}\n`;
}

function hyperframesJson() {
  return `${JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: {
      blocks: "compositions",
      components: "compositions/components",
      assets: "assets"
    },
    media: {
      autoProxy: true
    },
    authoringSkill: "hyperframes"
  }, null, 2)}\n`;
}

function buildBlocks({ config, timing, duration, manifest }) {
  return timing.scenes.map((scene, index) => {
    const key = sceneKeys[index] || safeId(scene.id || `scene-${index + 1}`);
    const start = round(scene.start);
    const end = round(index === timing.scenes.length - 1 ? duration : scene.end);
    const captions = config.template === "data-lab"
      ? captionCues(manifest.scenes?.[index]?.text || "", end - start)
      : [];
    return {
      key,
      compositionId: `scene-${key}`,
      file: `compositions/scene-${key}.html`,
      slot: `#el-scene-${key}`,
      start,
      end,
      duration: round(end - start),
      anim: scene.animation || config.animations[index] || "talking",
      subtitle: captions[0]?.text || (config.template === "data-lab" ? "" : config.subtitles[index] || scene.screen_text || scene.label || key),
      captions
    };
  });
}

function captionCues(value, duration) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && (chunk.length + word.length + 1 > 42 || /[.!?]$/.test(chunk) && chunk.length >= 20)) {
      chunks.push(chunk);
      chunk = "";
    }
    chunk = chunk ? `${chunk} ${word}` : word;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length > 1 && chunks.at(-1).length < 16 && chunks.at(-2).length + chunks.at(-1).length + 1 <= 58) {
    chunks[chunks.length - 2] += ` ${chunks.pop()}`;
  }
  const totalWords = words.length || 1;
  let usedWords = 0;
  return chunks.map((text) => {
    const start = round(usedWords / totalWords * duration);
    usedWords += text.split(/\s+/).length;
    return { start, text };
  });
}

function html({ slug, config, duration, blocks, templateProfile }) {
  const importMap = templateProfile.hasNarrator
    ? `  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.181.2/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/"
      }
    }
  </script>
`
    : "";
  const narratorLayer = templateProfile.hasNarrator
    ? `    <div class="canvas-wrap" id="canvasWrap" data-hf-id="hf-canvas-wrap" data-layout-ignore></div>
`
    : "";
  const narratorScript = templateProfile.hasNarrator
    ? `  <script type="module" src="assets/narrator.js"></script>
`
    : "";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${escapeHtml(config.title)} - ${escapeHtml(templateProfile.titleSuffix)}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
${importMap.trimEnd()}
  <link rel="stylesheet" href="assets/social-narrator.css">
</head>
<body>
  <main id="composition" class="clip template-${escapeAttr(config.template)}" data-hf-id="hf-${escapeAttr(slug)}-root" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="1080" data-height="1920">
    <div class="backdrop" data-hf-id="hf-backdrop"></div>
    <div data-hf-id="hf-${escapeAttr(slug)}-ghost" class="ghost-word" data-layout-ignore>${config.ghost.map((word, index) => `<span data-hf-id="hf-${escapeAttr(slug)}-ghost-${index + 1}">${escapeHtml(word)}</span>`).join("")}</div>
${blocks.map((block) => `    <div id="el-${block.compositionId}" data-composition-id="${block.compositionId}" data-composition-src="${block.file}" data-start="${block.start}" data-duration="${block.duration}" data-track-index="1" data-width="1080" data-height="1920"></div>`).join("\n")}
${narratorLayer.trimEnd()}
    <div class="transition-beat" id="transitionBeat" data-hf-id="hf-transition-beat"></div>
    <div class="lower-mask" data-hf-id="hf-lower-mask"></div>
    <div class="subtitle" id="subtitle" data-hf-id="hf-subtitle">${escapeHtml(blocks[0]?.subtitle || "")}</div>
    <audio data-hf-id="hf-voiceover" id="voiceover" src="assets/${escapeAttr(slug)}-voice.mp3" data-start="0" data-duration="${duration}" data-track-index="20" data-volume="1"></audio>
  </main>
  <script>window.__timelines = window.__timelines || {}; window.__timelines["main"] = gsap.timeline({ paused: true });</script>
  <script src="assets/main.js"></script>
${narratorScript.trimEnd()}
</body>
</html>
`;
}

function sceneHtml(scene, key, template = "dark-tech") {
  const variantClass = key === "payoff" ? " scene-payoff-inner" : "";
  const takeaway = template === "data-lab" ? dataLabTakeawayText(scene) : "";
  const dataLabTakeaway = takeaway
    ? `          <div data-hf-id="hf-${key}-takeaway" class="stage-takeaway">${escapeHtml(takeaway)}</div>
`
    : "";
  return `      <div class="scene-inner${variantClass}" data-hf-id="hf-${key}-inner">
        <h1 data-hf-id="hf-${key}-headline" class="headline">${headlineHtml(scene.headline)}</h1>
        <p data-hf-id="hf-${key}-copy" class="copy">${escapeHtml(scene.copy)}</p>
        <div data-hf-id="hf-${key}-stage" class="visual-stage${takeaway ? " has-takeaway" : ""}">
          <div data-hf-id="hf-${key}-grid" class="stage-grid"></div>
${stageHtml(scene.stage, key)}
${dataLabTakeaway.trimEnd()}
        </div>
      </div>`;
}

function headlineHtml(parts) {
  return parts.map((part, index) => {
    const text = escapeHtml(part.text);
    return part.accent ? `<span data-hf-id="hf-headline-accent-${index}" class="accent">${text}</span>` : text;
  }).join("");
}

function headlineText(parts) {
  return ensureArray(parts, []).map((part) => part?.text || "").join("").trim();
}

function dataLabTakeawayText(scene) {
  const stage = scene.stage || {};
  const takeaway = compactText(scene.takeaway || stage.takeaway || "", 46);
  const same = (a, b) => String(a || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase() ===
    String(b || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return takeaway && !same(takeaway, headlineText(scene.headline)) && !same(takeaway, scene.copy)
    ? takeaway
    : "";
}

function stageHtml(stage, key) {
  if (stage.type === "serp") {
    const results = ensureArray(stage.results, ["Resultado organico", "Landing util", "Competidor"]).slice(0, 4);
    return `          <div data-hf-id="hf-${key}-serp" class="data-lab-serp">
            <div data-hf-id="hf-${key}-serp-search" class="serp-search">${escapeHtml(stage.query || "busqueda principal")}</div>
            <div data-hf-id="hf-${key}-serp-list" class="serp-list">
${results.map((result, index) => `              <div data-hf-id="hf-${key}-serp-result-${index + 1}" class="serp-result${index === 0 ? " active" : ""}"><span>${index + 1}</span><strong>${escapeHtml(result)}</strong><small>${escapeHtml(index === 0 ? stage.highlight || "Oportunidad" : "senal detectada")}</small></div>`).join("\n")}
            </div>
            <div data-hf-id="hf-${key}-serp-metric" class="serp-metric">${escapeHtml(stage.metric || "CTR +")}</div>
          </div>`;
  }

  if (stage.type === "dashboard") {
    const metrics = ensureArray(stage.metrics, [{ label: "Leads", value: "+24%" }, { label: "CTR", value: "6.4%" }, { label: "CPC", value: "-18%" }]).slice(0, 4);
    const trend = ensureArray(stage.trend, [24, 36, 30, 48, 58, 72]).slice(0, 8).map((value) => clampNumber(value, 12, 100));
    return `          <div data-hf-id="hf-${key}-dashboard" class="data-lab-dashboard">
            <div data-hf-id="hf-${key}-dashboard-label" class="dashboard-label">${escapeHtml(stage.label || "Marketing dashboard")}</div>
            <div data-hf-id="hf-${key}-dashboard-metrics" class="dashboard-metrics">
${metrics.map((metric, index) => `              <div data-hf-id="hf-${key}-dashboard-metric-${index + 1}" class="dashboard-card"><span>${escapeHtml(metric.label || `KPI ${index + 1}`)}</span><strong>${escapeHtml(metric.value || "+")}</strong></div>`).join("\n")}
            </div>
            <div data-hf-id="hf-${key}-dashboard-chart" class="dashboard-chart">
${trend.map((value, index) => `              <i data-hf-id="hf-${key}-dashboard-bar-${index + 1}" style="height:${value}%"></i>`).join("\n")}
            </div>
          </div>`;
  }

  if (stage.type === "keyword-map") {
    const clusters = ensureArray(stage.clusters, ["informacional", "comercial", "local", "comparativa"]).slice(0, 6);
    return `          <div data-hf-id="hf-${key}-keyword-map" class="data-lab-keyword-map">
            <div data-hf-id="hf-${key}-keyword-core" class="keyword-core">${escapeHtml(stage.core || "keyword principal")}</div>
${clusters.map((cluster, index) => {
  const position = keywordClusterPosition(index);
  return `            <div data-hf-id="hf-${key}-keyword-cluster-${index + 1}" class="keyword-cluster" style="left:${position.left}px;top:${position.top}px">${escapeHtml(cluster)}</div>`;
}).join("\n")}
          </div>`;
  }

  if (stage.type === "funnel") {
    const steps = ensureArray(stage.steps, ["Impresion", "Clic", "Lead", "Venta"]).slice(0, 5);
    return `          <div data-hf-id="hf-${key}-funnel" class="data-lab-funnel">
${steps.map((step, index) => `            <div data-hf-id="hf-${key}-funnel-step-${index + 1}" class="funnel-step" style="width:${Math.max(44, 96 - index * 12)}%"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(step)}</div>`).join("\n")}
            <div data-hf-id="hf-${key}-funnel-leak" class="funnel-leak">${escapeHtml(stage.leak || "Fuga detectada")}</div>
          </div>`;
  }

  if (stage.type === "comparison") {
    const left = stage.left || {};
    const right = stage.right || {};
    const connection = stage.relation === "connection";
    return `          <div data-hf-id="hf-${key}-comparison" class="data-lab-comparison${connection ? " is-connection" : ""}">
            <div data-hf-id="hf-${key}-comparison-left" class="comparison-panel bad"><span>${escapeHtml(left.label || "Antes")}</span><strong>${escapeHtml(left.value || "Sin foco")}</strong></div>
            <div data-hf-id="hf-${key}-comparison-vs" class="comparison-vs">${connection ? "↔" : "VS"}</div>
            <div data-hf-id="hf-${key}-comparison-right" class="comparison-panel good"><span>${escapeHtml(right.label || "Despues")}</span><strong>${escapeHtml(right.value || "Prioridad clara")}</strong></div>
          </div>`;
  }

  if (stage.type === "checklist") {
    const items = ensureArray(stage.items, ["Tracking", "Intencion", "Prioridad"]).slice(0, 5);
    const checked = clampNumber(stage.checked ?? items.length, 0, items.length);
    return `          <div data-hf-id="hf-${key}-checklist" class="data-lab-checklist">
${items.map((item, index) => `            <div data-hf-id="hf-${key}-checklist-item-${index + 1}" class="checklist-item${index < checked ? " done" : ""}"><span>${index < checked ? "OK" : "!"}</span>${escapeHtml(item)}</div>`).join("\n")}
          </div>`;
  }

  if (stage.type === "timeline") {
    const points = ensureArray(stage.points, ["Sem 1", "Sem 2", "Sem 3", "Sem 4"]).slice(0, 5);
    const values = ensureArray(stage.values, ["18", "11", "7", "3"]).slice(0, points.length);
    return `          <div data-hf-id="hf-${key}-timeline" class="data-lab-timeline">
            <div data-hf-id="hf-${key}-timeline-label" class="timeline-label">${escapeHtml(stage.label || "Evolucion")}</div>
            <div data-hf-id="hf-${key}-timeline-line" class="timeline-line"></div>
${points.map((point, index) => `            <div data-hf-id="hf-${key}-timeline-point-${index + 1}" class="timeline-point" style="left:${42 + index * Math.floor(390 / Math.max(1, points.length - 1))}px"><strong>${escapeHtml(values[index] || "")}</strong><span>${escapeHtml(point)}</span></div>`).join("\n")}
          </div>`;
  }

  if (stage.type === "map") {
    return `          <div data-hf-id="hf-${key}-label" class="stage-label">${escapeHtml(stage.label)}</div>
          <div data-hf-id="hf-${key}-node-1" class="node" style="left:48px;top:146px">${escapeHtml(stage.nodes[0])}</div>
          <div data-hf-id="hf-${key}-line-1" class="path-line" style="left:196px;top:188px;width:142px"></div>
          <div data-hf-id="hf-${key}-node-2" class="node" style="left:338px;top:146px">${escapeHtml(stage.nodes[1])}</div>
          <div data-hf-id="hf-${key}-line-2" class="path-line" style="left:444px;top:250px;width:92px;rotate:38deg"></div>
          <div data-hf-id="hf-${key}-node-3" class="node lost" style="left:366px;top:318px">${escapeHtml(stage.nodes[2])}</div>
          <div data-hf-id="hf-${key}-warning" class="stage-card warning">${escapeHtml(stage.warning)}</div>`;
  }

  if (stage.type === "chaos") {
    const positions = [
      "left:38px;top:132px;width:350px",
      "left:72px;top:224px;width:440px",
      "left:42px;top:316px;width:472px",
      "left:112px;top:408px;width:400px"
    ];
    return `          <div data-hf-id="hf-${key}-metric" class="metric">${escapeHtml(stage.metric)}</div>
${stage.cards.map((card, index) => `          <div data-hf-id="hf-${key}-card-${index + 1}" class="stage-card chaos-card${card.tone ? ` ${card.tone}` : ""}" style="${positions[index]}">${escapeHtml(card.text)}</div>`).join("\n")}`;
  }

  if (stage.type === "flow") {
    return `          <div data-hf-id="hf-${key}-label" class="stage-label">${escapeHtml(stage.label)}</div>
          <div data-hf-id="hf-${key}-flow" class="flow">
${stage.items.map((item, index) => `            <div data-hf-id="hf-${key}-flow-${index + 1}" class="flow-item">${escapeHtml(item)} <span data-hf-id="hf-${key}-num-${index + 1}">${String(index + 1).padStart(2, "0")}</span></div>`).join("\n")}
          </div>`;
  }

  if (stage.type === "route") {
    return stage.items.map((item, index) => `          <div data-hf-id="hf-${key}-route-${index + 1}" class="stage-card route-card ${["one", "two", "three"][index]}"><span data-hf-id="hf-${key}-check-${index + 1}" class="check">OK</span><span data-hf-id="hf-${key}-text-${index + 1}">${escapeHtml(item)}</span></div>`).join("\n");
  }

  if (stage.type === "cta") {
    return `          <div data-hf-id="hf-${key}-panel" class="cta-panel">
            <div data-hf-id="hf-${key}-word" class="cta-word">${escapeHtml(stage.word)}</div>
            <div data-hf-id="hf-${key}-box" class="comment-box">${escapeHtml(stage.box)}</div>
          </div>`;
  }

  fail(`Unknown stage type ${stage.type}`);
}

function sceneCompositionHtml(scene, key, block, template) {
  const id = `scene-${key}`;
  const rootBackground = template === "light-workshop" ? "#e4ece7" : template === "data-lab" ? "#071013" : "#08110f";
  const rootColor = template === "light-workshop" ? "#111621" : "#f4fff9";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080, height=1920">
  <title>${escapeHtml(id)}</title>
</head>
<body>
  <template>
    <style>
${sharedCss(template)}
    </style>
    <section id="root" data-hf-id="hf-scene-${key}" data-layout-allow-occlusion data-composition-id="${id}" data-start="0" data-duration="${block.duration}" data-width="1080" data-height="1920" style="position:relative;width:1080px;height:1920px;overflow:hidden;background:${rootBackground};color:${rootColor}">
      <div class="template-${escapeAttr(template)}" data-hf-id="hf-scene-${key}-template" style="position:absolute;inset:0;overflow:hidden">
${sceneHtml(scene, key, template)}
      </div>
    </section>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const rootSelector = '[data-composition-id="${id}"]';

      function exists(selector) {
        return Boolean(document.querySelector(selector));
      }

      function fromToIf(selector, fromVars, toVars, at) {
        if (exists(selector)) tl.fromTo(selector, fromVars, toVars, at);
      }

      function toIf(selector, vars, at) {
        if (exists(selector)) tl.to(selector, vars, at);
      }

      function enterScene(at) {
        fromToIf(rootSelector + " .headline", { y: 58, opacity: 0, scale: 0.98 }, { y: 0, opacity: 1, scale: 1, duration: 0.56, ease: "power3.out" }, at + 0.18);
        fromToIf(rootSelector + " .copy", { y: 34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.48, ease: "power2.out" }, at + 0.52);
        fromToIf(rootSelector + " .visual-stage", { y: 48, opacity: 0, scale: 0.97 }, { y: 0, opacity: 1, scale: 1, duration: 0.58, ease: "back.out(1.25)" }, at + 0.66);
        fromToIf(rootSelector + " .stage-label, " + rootSelector + " .node, " + rootSelector + " .stage-card, " + rootSelector + " .flow-item, " + rootSelector + " .metric, " + rootSelector + " .cta-panel, " + rootSelector + " .serp-result, " + rootSelector + " .dashboard-card, " + rootSelector + " .dashboard-chart i, " + rootSelector + " .keyword-cluster, " + rootSelector + " .funnel-step, " + rootSelector + " .comparison-panel, " + rootSelector + " .checklist-item, " + rootSelector + " .timeline-point, " + rootSelector + " .stage-takeaway", { y: 28, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, duration: 0.44, stagger: 0.09, ease: "back.out(1.5)" }, at + 0.88);
        fromToIf(rootSelector + " .path-line", { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.5, stagger: 0.12, ease: "power2.out" }, at + 1.02);
      }

      enterScene(0);
      const span = Math.max(1.2, ${block.duration} - 1.2);
      animateDataLabStage(0, span);
      toIf(rootSelector + " .visual-stage", { y: -10, duration: span, ease: "sine.inOut" }, 1.2);
      toIf(rootSelector + " .stage-card, " + rootSelector + " .flow-item, " + rootSelector + " .dashboard-card, " + rootSelector + " .keyword-cluster, " + rootSelector + " .comparison-panel", { y: -8, duration: 1.3, repeat: Math.max(1, Math.floor(span / 1.3)), yoyo: true, ease: "sine.inOut" }, 1.4);

      function animateDataLabStage(at, sceneSpan) {
        const repeatCount = Math.max(1, Math.floor(sceneSpan / 1.6));

        fromToIf(rootSelector + " .serp-search", { x: -18, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, ease: "power2.out", immediateRender: false }, at + 1.02);
        fromToIf(rootSelector + " .serp-result.active", { scale: 0.96, backgroundColor: "#f6fbf8" }, { scale: 1.035, backgroundColor: "#e9fff4", duration: 0.52, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, at + 1.34);
        fromToIf(rootSelector + " .serp-metric", { y: 18, scale: 0.86, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.48, ease: "back.out(1.6)", immediateRender: false }, at + 1.66);
        toIf(rootSelector + " .stage-takeaway", { scale: 1.018, duration: 0.74, yoyo: true, repeat: 1, ease: "sine.inOut", transformOrigin: "center center" }, at + 1.84);

        fromToIf(rootSelector + " .dashboard-chart i", { scaleY: 0.12, opacity: 0.72, transformOrigin: "bottom center" }, { scaleY: 1, opacity: 1, transformOrigin: "bottom center", duration: 0.74, stagger: 0.08, ease: "power3.out", immediateRender: false }, at + 1.18);
        toIf(rootSelector + " .dashboard-card strong", { scale: 1.08, duration: 0.42, stagger: 0.08, yoyo: true, repeat: 1, ease: "sine.inOut", transformOrigin: "left center" }, at + 1.62);

        fromToIf(rootSelector + " .keyword-core", { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.48, ease: "back.out(1.7)", immediateRender: false }, at + 1.1);
        fromToIf(rootSelector + " .keyword-cluster", { x: 0, scale: 0.86, opacity: 0 }, { x: 0, scale: 1, opacity: 1, duration: 0.42, stagger: 0.08, ease: "back.out(1.45)", immediateRender: false }, at + 1.26);
        toIf(rootSelector + " .keyword-core", { scale: 1.045, duration: 0.82, yoyo: true, repeat: Math.max(1, Math.floor(sceneSpan / 1.7)), ease: "sine.inOut" }, at + 1.72);

        fromToIf(rootSelector + " .funnel-step", { x: -36, opacity: 0, scale: 0.96 }, { x: 0, opacity: 1, scale: 1, duration: 0.48, stagger: 0.11, ease: "power3.out", immediateRender: false }, at + 1.12);
        fromToIf(rootSelector + " .funnel-leak", { x: 22, opacity: 0, scale: 0.94 }, { x: 0, opacity: 1, scale: 1, duration: 0.46, ease: "back.out(1.55)", immediateRender: false }, at + 1.72);

        fromToIf(rootSelector + " .comparison-panel.bad", { x: -34, opacity: 0, scale: 0.94 }, { x: 0, opacity: 1, scale: 1, duration: 0.52, ease: "power3.out", immediateRender: false }, at + 1.1);
        fromToIf(rootSelector + " .comparison-panel.good", { x: 34, opacity: 0, scale: 0.94 }, { x: 0, opacity: 1, scale: 1, duration: 0.52, ease: "power3.out", immediateRender: false }, at + 1.22);
        fromToIf(rootSelector + " .comparison-vs", { rotation: -18, scale: 0.72, opacity: 0 }, { rotation: 0, scale: 1, opacity: 1, duration: 0.48, ease: "back.out(1.8)", immediateRender: false }, at + 1.46);
        toIf(rootSelector + " .is-connection .comparison-vs", { scale: 1.12, duration: 0.68, yoyo: true, repeat: 1, ease: "sine.inOut" }, at + 2.02);

        fromToIf(rootSelector + " .checklist-item", { x: -28, opacity: 0, scale: 0.97 }, { x: 0, opacity: 1, scale: 1, duration: 0.4, stagger: 0.1, ease: "power2.out", immediateRender: false }, at + 1.12);
        fromToIf(rootSelector + " .checklist-item span", { scale: 0.55, rotation: -20 }, { scale: 1, rotation: 0, duration: 0.34, stagger: 0.1, ease: "back.out(2)", immediateRender: false }, at + 1.34);

        fromToIf(rootSelector + " .timeline-line", { scaleX: 0, opacity: 0, transformOrigin: "left center" }, { scaleX: 1, opacity: 1, transformOrigin: "left center", duration: 0.76, ease: "power2.out", immediateRender: false }, at + 1.12);
        fromToIf(rootSelector + " .timeline-point", { y: 24, scale: 0.72, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.44, stagger: 0.11, ease: "back.out(1.8)", immediateRender: false }, at + 1.42);

        fromToIf(rootSelector + " .cta-panel", { y: 34, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.58, ease: "back.out(1.65)", immediateRender: false }, at + 1.08);
        fromToIf(rootSelector + " .cta-word", { y: 18, scale: 0.86, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.48, ease: "back.out(1.75)", immediateRender: false }, at + 1.38);
        toIf(rootSelector + " .comment-box", { scale: 1.035, duration: 0.72, yoyo: true, repeat: repeatCount, ease: "sine.inOut" }, at + 1.78);
      }

      window.__timelines["${id}"] = tl;
    </script>
  </template>
</body>
</html>
`;
}

function sharedCss(template = "dark-tech") {
  const lightOverrides = template === "light-workshop" ? lightWorkshopCss() : "";
  const dataLabOverrides = template === "data-lab" ? dataLabCss() : "";
  return `    :root {
      --bg: #07140f;
      --panel: #10291e;
      --paper: #f8fff9;
      --ink: #09140f;
      --mint: #55d69a;
      --gold: #ffce63;
      --red: #ff5349;
      --blue: #5b8cff;
      --soft: #d9ffe8;
      --safe-left: 96px;
      --safe-right: 220px;
      --safe-top: 220px;
      --safe-bottom: 540px;
      --safe-width: 764px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      background: var(--bg);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #composition,
    #root {
      position: relative;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      color: var(--paper);
    }

    #composition { background: var(--bg); }
    #root { background: transparent; }

    [data-composition-src] {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      overflow: hidden;
      z-index: 9;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,.05) 1px, transparent 1px),
        radial-gradient(circle at 18% 16%, rgba(85, 214, 154, .34), transparent 34%),
        radial-gradient(circle at 78% 18%, rgba(255, 190, 92, .26), transparent 28%),
        radial-gradient(circle at 78% 78%, rgba(91, 140, 255, .18), transparent 34%),
        linear-gradient(145deg, #06110d 0%, #0c2419 48%, #172017 100%);
      background-size: 90px 90px, 90px 90px, auto, auto, auto, auto;
    }

    .ghost-word {
      position: absolute;
      left: 42px;
      top: 148px;
      width: 980px;
      color: rgba(248,255,249,.08);
      font-size: 128px;
      line-height: .9;
      font-weight: 1000;
      text-transform: uppercase;
      letter-spacing: 0;
      pointer-events: none;
    }

    .scene-inner {
      position: absolute;
      left: var(--safe-left);
      top: var(--safe-top);
      width: var(--safe-width);
      height: 1160px;
    }

    .headline {
      position: absolute;
      left: 260px;
      top: 18px;
      width: 504px;
      margin: 0;
      color: #f7fff9;
      font-size: 62px;
      line-height: .94;
      font-weight: 1000;
      text-transform: uppercase;
      letter-spacing: 0;
    }

    .headline .accent { color: var(--gold); }

    .scene-payoff-inner .headline {
      font-size: 54px;
      width: 504px;
    }

    .scene-payoff-inner .copy { top: 340px; }
    .scene-payoff-inner .visual-stage { top: 560px; height: 430px; }

    .copy {
      position: absolute;
      left: 260px;
      top: 286px;
      width: 504px;
      margin: 0;
      color: var(--soft);
      font-size: 32px;
      line-height: 1.16;
      font-weight: 760;
    }

    .visual-stage {
      position: absolute;
      left: 260px;
      top: 485px;
      width: 504px;
      height: 500px;
      border-radius: 34px;
      border: 2px solid rgba(255,255,255,.13);
      background: rgba(255,255,255,.065);
      box-shadow: 0 40px 90px rgba(0,0,0,.28);
      overflow: hidden;
    }

    .stage-grid {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(38deg, transparent 0 43%, rgba(255,255,255,.13) 43% 45%, transparent 45%),
        linear-gradient(128deg, transparent 0 36%, rgba(255,255,255,.10) 36% 38%, transparent 38%),
        linear-gradient(0deg, transparent 0 21%, rgba(85,214,154,.13) 21% 22%, transparent 22%),
        #10291e;
    }

    .stage-label {
      position: absolute;
      left: 32px;
      top: 30px;
      padding: 12px 18px;
      border-radius: 999px;
      background: var(--gold);
      color: #122018;
      font-size: 22px;
      font-weight: 950;
      text-transform: uppercase;
    }

    .stage-card {
      position: absolute;
      padding: 20px 22px;
      border-radius: 24px;
      background: rgba(248,255,249,.94);
      color: #0b1a12;
      box-shadow: 0 24px 64px rgba(0,0,0,.28);
      font-size: 26px;
      line-height: 1.06;
      font-weight: 900;
    }

    .stage-card.dark {
      background: #08120e;
      color: #d9ffe8;
      border: 2px solid rgba(186,248,213,.22);
    }

    .stage-card.bad {
      background: #fff0ed;
      color: #38110e;
      outline: 5px solid rgba(255,83,73,.26);
    }

    .node {
      position: absolute;
      display: grid;
      place-items: center;
      width: 112px;
      height: 76px;
      border-radius: 22px;
      background: var(--paper);
      color: var(--ink);
      font-size: 22px;
      font-weight: 950;
      box-shadow: 0 18px 44px rgba(0,0,0,.28);
      text-align: center;
      padding: 0 8px;
    }

    .node.lost { background: var(--red); color: white; }

    .path-line {
      position: absolute;
      height: 8px;
      border-radius: 999px;
      background: var(--mint);
      transform-origin: left center;
    }

    .warning {
      left: 54px;
      top: 332px;
      width: 366px;
      background: #fff7db;
      color: #211607;
      border-left: 10px solid var(--gold);
    }

    .metric {
      position: absolute;
      right: 28px;
      top: 28px;
      width: 150px;
      height: 150px;
      border-radius: 30px;
      display: grid;
      place-items: center;
      background: var(--red);
      color: white;
      font-size: 34px;
      font-weight: 1000;
      box-shadow: 0 22px 60px rgba(255,83,73,.34);
      text-align: center;
      padding: 0 10px;
    }

    .flow {
      position: absolute;
      left: 42px;
      right: 42px;
      top: 126px;
      display: grid;
      gap: 20px;
    }

    .flow-item {
      min-height: 82px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 22px 26px;
      border-radius: 24px;
      background: var(--paper);
      color: var(--ink);
      font-size: 28px;
      font-weight: 950;
      box-shadow: 0 22px 60px rgba(0,0,0,.24);
    }

    .flow-item span:last-child {
      color: #118950;
      font-size: 34px;
      flex: 0 0 auto;
    }

    .route-card {
      left: 38px;
      width: 398px;
      min-height: 78px;
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .route-card.one { top: 86px; }
    .route-card.two { top: 186px; }
    .route-card.three { top: 286px; }

    .check {
      width: 48px;
      height: 48px;
      flex: 0 0 auto;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--mint);
      color: #06110d;
      font-size: 24px;
      font-weight: 1000;
    }

    .cta-panel {
      position: absolute;
      left: 26px;
      top: 94px;
      width: 424px;
      height: 348px;
      padding: 42px 34px;
      border-radius: 32px;
      background: #f8fff9;
      color: #0b1a12;
      box-shadow: 0 28px 80px rgba(0,0,0,.30);
      text-align: center;
    }

    .cta-word {
      color: #118950;
      font-size: 38px;
      line-height: .9;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .comment-box {
      margin-top: 34px;
      padding: 22px 24px;
      border-radius: 22px;
      background: #08120e;
      color: var(--paper);
      font-size: 28px;
      line-height: 1.05;
      font-weight: 900;
    }

    .canvas-wrap,
    canvas {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      z-index: 8;
    }

    .lower-mask {
      position: absolute;
      left: 0;
      right: 0;
      top: 1235px;
      bottom: 0;
      z-index: 12;
      background:
        linear-gradient(180deg, rgba(7,20,15,0) 0%, rgba(7,20,15,.58) 24%, rgba(7,20,15,.96) 52%, #07140f 100%),
        linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,.04) 1px, transparent 1px);
      background-size: auto, 90px 90px, 90px 90px;
      pointer-events: none;
    }

    .subtitle {
      position: absolute;
      left: 112px;
      top: 1188px;
      width: 724px;
      min-height: 144px;
      z-index: 18;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 34px;
      border-radius: 30px;
      background: rgba(4, 15, 10, .84);
      border: 2px solid rgba(186, 248, 213, .20);
      box-shadow: 0 24px 70px rgba(0,0,0,.34);
      color: #f7fff9;
      text-align: center;
      font-size: 35px;
      line-height: 1.1;
      font-weight: 920;
    }

    .transition-beat {
      position: absolute;
      inset: 0;
      z-index: 16;
      background:
        radial-gradient(circle at 35% 42%, rgba(255, 255, 255, .84), rgba(255, 206, 99, .18) 28%, rgba(255, 255, 255, 0) 58%),
        linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(85,214,154,.42) 38%, rgba(255,206,99,.32) 55%, rgba(255,255,255,0) 100%);
      opacity: 0;
      transform: scaleX(.7);
      transform-origin: 34% 50%;
      pointer-events: none;
    }
${lightOverrides}${dataLabOverrides}`;
}

function dataLabCss() {
  return `
    #composition.template-data-lab,
    #root.template-data-lab {
      --bg: #071013;
      --panel: #101b20;
      --paper: #f6fbf8;
      --ink: #071013;
      --mint: #7cf7bd;
      --gold: #ffd166;
      --red: #ff5a61;
      --blue: #66a3ff;
      --soft: #c9f4e2;
      color: var(--paper);
    }

    #composition.template-data-lab {
      background: #071013;
    }

    .template-data-lab .backdrop {
      background:
        linear-gradient(90deg, rgba(124,247,189,.06) 1px, transparent 1px),
        linear-gradient(0deg, rgba(124,247,189,.045) 1px, transparent 1px),
        radial-gradient(circle at 50% 13%, rgba(102,163,255,.22), transparent 33%),
        radial-gradient(circle at 18% 80%, rgba(124,247,189,.18), transparent 30%),
        linear-gradient(145deg, #050b0d 0%, #071013 42%, #122128 100%);
      background-size: 72px 72px, 72px 72px, auto, auto, auto;
    }

    .template-data-lab .ghost-word {
      left: 40px;
      top: 112px;
      width: 990px;
      color: rgba(246,251,248,.055);
      font-size: 132px;
      line-height: .86;
    }

    .template-data-lab .scene-inner {
      left: var(--safe-left);
      right: var(--safe-right);
      top: 220px;
      bottom: var(--safe-bottom);
    }

    .template-data-lab .headline,
    .template-data-lab .scene-payoff-inner .headline {
      left: 0;
      top: 0;
      width: var(--safe-width);
      color: #f8fffb;
      font-size: 68px;
      line-height: .92;
      letter-spacing: 0;
    }

    .template-data-lab .headline .accent {
      color: var(--mint);
    }

    .template-data-lab .copy,
    .template-data-lab .scene-payoff-inner .copy {
      left: 0;
      top: 210px;
      width: var(--safe-width);
      color: #c6d8d1;
      font-size: 32px;
      line-height: 1.15;
    }

    .template-data-lab .visual-stage,
    .template-data-lab .scene-payoff-inner .visual-stage {
      left: 0;
      top: 390px;
      width: var(--safe-width);
      height: 640px;
      border-radius: 18px;
      border: 2px solid rgba(124,247,189,.22);
      background: rgba(8,18,22,.88);
      box-shadow: 0 28px 90px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.04);
    }

    .template-data-lab .stage-grid {
      background:
        linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px),
        linear-gradient(0deg, rgba(255,255,255,.055) 1px, transparent 1px),
        radial-gradient(circle at 80% 18%, rgba(102,163,255,.24), transparent 36%),
        linear-gradient(145deg, rgba(124,247,189,.10), rgba(255,209,102,.04)),
        #0b171b;
      background-size: 54px 54px, 54px 54px, auto, auto, auto;
    }

    .template-data-lab .stage-label {
      border-radius: 8px;
      background: var(--mint);
      color: #06100d;
    }

    .template-data-lab .stage-card,
    .template-data-lab .flow-item,
    .template-data-lab .node {
      border-radius: 12px;
      font-size: 32px;
    }

    .template-data-lab .data-lab-serp,
    .template-data-lab .data-lab-dashboard,
    .template-data-lab .data-lab-keyword-map,
    .template-data-lab .data-lab-funnel,
    .template-data-lab .data-lab-comparison,
    .template-data-lab .data-lab-checklist,
    .template-data-lab .data-lab-timeline {
      position: absolute;
      inset: 34px;
      z-index: 2;
    }

    .template-data-lab .serp-search {
      height: 74px;
      padding: 19px 28px;
      border-radius: 999px;
      background: #f8fffb;
      color: #091215;
      font-size: 30px;
      font-weight: 950;
      box-shadow: 0 18px 46px rgba(0,0,0,.28);
    }

    .template-data-lab .serp-list {
      display: grid;
      gap: 18px;
      margin-top: 26px;
    }

    .template-data-lab .serp-result {
      min-height: 96px;
      display: grid;
      grid-template-columns: 54px 1fr;
      grid-template-rows: auto auto;
      column-gap: 18px;
      padding: 20px 24px;
      border-radius: 14px;
      background: rgba(246,251,248,.94);
      color: #071013;
      box-shadow: 0 16px 42px rgba(0,0,0,.26);
    }

    .template-data-lab .serp-result.active {
      outline: 5px solid rgba(124,247,189,.34);
    }

    .template-data-lab .serp-result span {
      grid-row: 1 / 3;
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--blue);
      color: white;
      font-size: 24px;
      font-weight: 1000;
    }

    .template-data-lab .serp-result strong {
      font-size: 31px;
      line-height: 1;
    }

    .template-data-lab .serp-result small {
      color: #456159;
      font-size: 22px;
      font-weight: 800;
    }

    .template-data-lab .serp-metric {
      position: absolute;
      right: 6px;
      bottom: 6px;
      padding: 18px 22px;
      border-radius: 12px;
      background: var(--mint);
      color: #06100d;
      font-size: 34px;
      font-weight: 1000;
      box-shadow: 0 16px 44px rgba(124,247,189,.24);
    }

    .template-data-lab .dashboard-label,
    .template-data-lab .timeline-label {
      color: var(--mint);
      font-size: 24px;
      font-weight: 1000;
      text-transform: uppercase;
    }

    .template-data-lab .dashboard-metrics {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 18px;
      margin-top: 22px;
    }

    .template-data-lab .dashboard-card {
      min-height: 124px;
      padding: 22px 24px;
      border-radius: 14px;
      background: rgba(246,251,248,.94);
      color: #071013;
      box-shadow: 0 16px 44px rgba(0,0,0,.24);
    }

    .template-data-lab .dashboard-card span {
      display: block;
      color: #48645b;
      font-size: 22px;
      font-weight: 850;
    }

    .template-data-lab .dashboard-card strong {
      display: block;
      margin-top: 10px;
      font-size: 44px;
      line-height: .95;
      font-weight: 1000;
    }

    .template-data-lab .dashboard-chart {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 210px;
      display: flex;
      align-items: end;
      gap: 18px;
      padding: 24px;
      border-radius: 16px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.08);
    }

    .template-data-lab .dashboard-chart i {
      flex: 1;
      min-height: 28px;
      border-radius: 8px 8px 0 0;
      background: linear-gradient(180deg, var(--mint), var(--blue));
      box-shadow: 0 10px 28px rgba(102,163,255,.22);
    }

    .template-data-lab .keyword-core {
      position: absolute;
      left: 182px;
      top: 224px;
      width: 320px;
      min-height: 118px;
      display: grid;
      place-items: center;
      padding: 22px;
      border-radius: 18px;
      background: var(--mint);
      color: #06100d;
      text-align: center;
      font-size: 34px;
      line-height: 1;
      font-weight: 1000;
      box-shadow: 0 20px 58px rgba(124,247,189,.22);
    }

    .template-data-lab .keyword-cluster {
      position: absolute;
      min-width: 150px;
      padding: 18px 20px;
      border-radius: 999px;
      background: rgba(246,251,248,.94);
      color: #071013;
      text-align: center;
      font-size: 25px;
      line-height: 1;
      font-weight: 950;
      box-shadow: 0 14px 34px rgba(0,0,0,.24);
    }

    .template-data-lab .funnel-step {
      height: 84px;
      margin: 0 auto 18px;
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 0 26px;
      border-radius: 14px;
      background: rgba(246,251,248,.94);
      color: #071013;
      font-size: 32px;
      font-weight: 1000;
      box-shadow: 0 16px 44px rgba(0,0,0,.24);
    }

    .template-data-lab .funnel-step span {
      color: var(--blue);
      font-size: 28px;
      flex: 0 0 auto;
    }

    .template-data-lab .funnel-leak {
      margin: 28px auto 0;
      width: 78%;
      padding: 20px 24px;
      border-radius: 12px;
      background: #fff2d6;
      color: #201407;
      text-align: center;
      font-size: 30px;
      line-height: 1;
      font-weight: 1000;
      border-left: 10px solid var(--gold);
    }

    .template-data-lab .data-lab-comparison {
      display: grid;
      grid-template-columns: 1fr 86px 1fr;
      align-items: center;
      gap: 18px;
    }

    .template-data-lab .comparison-panel {
      min-height: 350px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 30px;
      border-radius: 18px;
      color: #071013;
      box-shadow: 0 18px 50px rgba(0,0,0,.26);
    }

    .template-data-lab .comparison-panel.bad {
      background: #ffe8ea;
      outline: 5px solid rgba(255,90,97,.22);
    }

    .template-data-lab .comparison-panel.good {
      background: #e9fff4;
      outline: 5px solid rgba(124,247,189,.24);
    }

    .template-data-lab .comparison-panel span {
      font-size: 25px;
      font-weight: 900;
      text-transform: uppercase;
    }

    .template-data-lab .comparison-panel strong {
      margin-top: 18px;
      font-size: 40px;
      line-height: .98;
      font-weight: 1000;
    }

    .template-data-lab .comparison-vs {
      width: 86px;
      height: 86px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--blue);
      color: white;
      font-size: 30px;
      font-weight: 1000;
    }

    .template-data-lab .data-lab-checklist {
      display: grid;
      gap: 22px;
      align-content: center;
    }

    .template-data-lab .checklist-item {
      min-height: 88px;
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 22px 26px;
      border-radius: 14px;
      background: rgba(246,251,248,.94);
      color: #071013;
      font-size: 33px;
      font-weight: 1000;
      box-shadow: 0 16px 44px rgba(0,0,0,.24);
    }

    .template-data-lab .checklist-item span {
      width: 54px;
      height: 54px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--red);
      color: white;
      font-size: 23px;
      flex: 0 0 auto;
    }

    .template-data-lab .checklist-item.done span {
      background: var(--mint);
      color: #06100d;
    }

    .template-data-lab .timeline-line {
      position: absolute;
      left: 44px;
      right: 44px;
      top: 312px;
      height: 8px;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--red), var(--gold), var(--mint));
    }

    .template-data-lab .timeline-point {
      position: absolute;
      top: 244px;
      width: 112px;
      text-align: center;
    }

    .template-data-lab .timeline-point strong {
      width: 82px;
      height: 82px;
      display: grid;
      place-items: center;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: #f8fffb;
      color: #071013;
      font-size: 32px;
      font-weight: 1000;
      box-shadow: 0 14px 36px rgba(0,0,0,.24);
    }

    .template-data-lab .timeline-point span {
      color: #d7e6e0;
      font-size: 21px;
      line-height: 1;
      font-weight: 850;
    }

    .template-data-lab .cta-panel {
      left: 70px;
      top: 118px;
      width: 560px;
      height: 390px;
      border-radius: 18px;
    }

    .template-data-lab .cta-word {
      color: #128251;
      font-size: 64px;
    }

    .template-data-lab .comment-box {
      border-radius: 14px;
      font-size: 34px;
    }

    .template-data-lab .lower-mask {
      top: 1280px;
      background:
        linear-gradient(180deg, rgba(7,16,19,0) 0%, rgba(7,16,19,.72) 26%, #071013 72%),
        linear-gradient(90deg, rgba(124,247,189,.045) 1px, transparent 1px),
        linear-gradient(0deg, rgba(124,247,189,.04) 1px, transparent 1px);
      background-size: auto, 72px 72px, 72px 72px;
    }

    .template-data-lab .subtitle {
      left: 96px;
      top: 1160px;
      width: 764px;
      min-height: 150px;
      border-radius: 16px;
      background: rgba(246,251,248,.94);
      color: #071013;
      border: 0;
      font-size: 34px;
      box-shadow: 0 22px 60px rgba(0,0,0,.32);
    }

    .template-data-lab .scene-inner {
      height: 1230px;
    }

    .template-data-lab .copy,
    .template-data-lab .scene-payoff-inner .copy {
      top: 194px;
      font-size: 30px;
      line-height: 1.12;
      max-height: 118px;
      overflow: hidden;
    }

    .template-data-lab .visual-stage,
    .template-data-lab .scene-payoff-inner .visual-stage {
      top: 350px;
      height: 650px;
      border-radius: 20px;
      border-color: rgba(124,247,189,.35);
      box-shadow: 0 34px 100px rgba(0,0,0,.48), 0 0 62px rgba(124,247,189,.08);
    }

    .template-data-lab .visual-stage::before {
      content: "";
      position: absolute;
      top: 0;
      left: 24px;
      width: 38%;
      height: 5px;
      z-index: 3;
      background: linear-gradient(90deg, var(--mint), rgba(124,247,189,0));
      box-shadow: 0 0 26px rgba(124,247,189,.52);
      pointer-events: none;
    }

    .template-data-lab .data-lab-serp,
    .template-data-lab .data-lab-dashboard,
    .template-data-lab .data-lab-keyword-map,
    .template-data-lab .data-lab-funnel,
    .template-data-lab .data-lab-comparison,
    .template-data-lab .data-lab-checklist,
    .template-data-lab .data-lab-timeline {
      inset: 32px;
    }

    .template-data-lab .has-takeaway .data-lab-serp,
    .template-data-lab .has-takeaway .data-lab-dashboard,
    .template-data-lab .has-takeaway .data-lab-keyword-map,
    .template-data-lab .has-takeaway .data-lab-funnel,
    .template-data-lab .has-takeaway .data-lab-comparison,
    .template-data-lab .has-takeaway .data-lab-checklist,
    .template-data-lab .has-takeaway .data-lab-timeline {
      bottom: 142px;
    }

    .template-data-lab .stage-takeaway {
      position: absolute;
      left: 28px;
      right: 28px;
      bottom: 26px;
      min-height: 88px;
      z-index: 4;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px 26px;
      border-radius: 16px;
      background: rgba(7,16,19,.76);
      color: #edf9f3;
      border: 2px solid rgba(124,247,189,.22);
      text-align: center;
      font-size: 28px;
      line-height: 1;
      font-weight: 1000;
      box-shadow: 0 18px 48px rgba(0,0,0,.24), inset 0 0 0 1px rgba(255,255,255,.04);
    }

    .template-data-lab .serp-search {
      height: 64px;
      padding: 16px 24px;
      font-size: 28px;
    }

    .template-data-lab .serp-list {
      gap: 12px;
      margin-top: 20px;
    }

    .template-data-lab .serp-result {
      min-height: 78px;
      padding: 16px 20px;
    }

    .template-data-lab .serp-result strong {
      font-size: 28px;
    }

    .template-data-lab .serp-result small {
      font-size: 20px;
    }

    .template-data-lab .data-lab-comparison {
      height: auto;
    }

    .template-data-lab .is-connection .comparison-panel.bad {
      background: #e6eeff;
      outline: 5px solid rgba(102,163,255,.23);
    }

    .template-data-lab .is-connection::before {
      content: "";
      position: absolute;
      left: 22%;
      right: 22%;
      top: 50%;
      height: 5px;
      background: linear-gradient(90deg, var(--blue), var(--mint));
      box-shadow: 0 0 28px rgba(124,247,189,.45);
    }

    .template-data-lab .is-connection .comparison-panel,
    .template-data-lab .is-connection .comparison-vs {
      position: relative;
      z-index: 1;
    }

    .template-data-lab .is-connection .comparison-panel.good {
      background: #e2ffef;
      outline: 5px solid rgba(124,247,189,.24);
    }

    .template-data-lab .is-connection .comparison-vs {
      background: var(--mint);
      color: #071013;
      box-shadow: 0 0 38px rgba(124,247,189,.36);
      font-size: 52px;
    }

    .template-data-lab .comparison-panel {
      min-height: 330px;
    }

    .template-data-lab .funnel-step {
      height: 72px;
      margin-bottom: 14px;
      font-size: 29px;
    }

    .template-data-lab .funnel-leak {
      margin-top: 18px;
      padding: 16px 22px;
      font-size: 28px;
    }

    .template-data-lab .checklist-item {
      min-height: 72px;
      padding: 18px 22px;
      font-size: 29px;
    }

    .template-data-lab .data-lab-checklist {
      gap: 14px;
    }

    .template-data-lab .cta-panel {
      top: 72px;
      height: 330px;
    }

    .template-data-lab .lower-mask {
      top: 1290px;
    }

    .template-data-lab .subtitle {
      top: 1250px;
      min-height: 112px;
      padding: 18px 30px;
      font-size: 31px;
      border-radius: 14px;
      justify-content: flex-start;
      text-align: left;
      font-weight: 750;
      background: rgba(8,22,25,.93);
      color: #f8fffb;
      border-left: 6px solid var(--mint);
      box-shadow: 0 18px 58px rgba(0,0,0,.36);
    }

    .template-data-lab .transition-beat {
      transform-origin: 50% 50%;
      background:
        radial-gradient(circle at 50% 48%, rgba(124,247,189,.80), rgba(102,163,255,.18) 34%, rgba(255,255,255,0) 62%),
        linear-gradient(90deg, rgba(255,255,255,0), rgba(124,247,189,.32), rgba(255,255,255,0));
    }
`;
}

function lightWorkshopCss() {
  return `
    #composition.template-light-workshop,
    #root.template-light-workshop {
      --bg: #e4ece7;
      --panel: #ffffff;
      --paper: #fbfff8;
      --ink: #111621;
      --mint: #aee56a;
      --gold: #f8c24f;
      --red: #ff5f7d;
      --blue: #2467de;
      --soft: #303947;
      color: var(--ink);
    }

    #composition.template-light-workshop {
      background: #e4ece7;
    }

    .template-light-workshop .backdrop {
      background:
        linear-gradient(90deg, rgba(17,22,33,.055) 1px, transparent 1px),
        linear-gradient(0deg, rgba(17,22,33,.055) 1px, transparent 1px),
        radial-gradient(circle at 14% 10%, rgba(174,229,106,.48), transparent 32%),
        radial-gradient(circle at 88% 13%, rgba(255,95,125,.24), transparent 29%),
        radial-gradient(circle at 74% 82%, rgba(36,103,222,.18), transparent 35%),
        linear-gradient(145deg, #fbfff8 0%, #e4ece7 54%, #cdd9d4 100%);
      background-size: 72px 72px, 72px 72px, auto, auto, auto, auto;
    }

    .template-light-workshop .ghost-word {
      left: 28px;
      top: 132px;
      width: 1030px;
      color: rgba(17,22,33,.075);
      font-size: 118px;
      line-height: .88;
    }

    .template-light-workshop .headline {
      left: 300px;
      top: 64px;
      width: 560px;
      color: #111621;
      font-size: 62px;
      line-height: .95;
      font-weight: 1000;
    }

    .template-light-workshop .headline .accent {
      color: var(--blue);
    }

    .template-light-workshop .scene-payoff-inner .headline {
      left: 300px;
      width: 560px;
      font-size: 56px;
    }

    .template-light-workshop .copy,
    .template-light-workshop .scene-payoff-inner .copy {
      left: 300px;
      top: 320px;
      width: 550px;
      color: #2c3443;
      font-size: 31px;
      line-height: 1.16;
    }

    .template-light-workshop .visual-stage,
    .template-light-workshop .scene-payoff-inner .visual-stage {
      left: 300px;
      top: 440px;
      width: 560px;
      height: 520px;
      border-radius: 8px;
      border: 2px solid rgba(17,22,33,.12);
      background: rgba(255,255,255,.78);
      box-shadow: 0 20px 62px rgba(17,22,33,.16);
    }

    .template-light-workshop .stage-grid {
      background:
        linear-gradient(90deg, rgba(17,22,33,.08) 2px, transparent 2px),
        linear-gradient(0deg, rgba(17,22,33,.08) 2px, transparent 2px),
        linear-gradient(135deg, rgba(174,229,106,.36), rgba(36,103,222,.14)),
        #ffffff;
      background-size: 62px 62px, 62px 62px, auto, auto;
    }

    .template-light-workshop .stage-label {
      left: 28px;
      top: 28px;
      border-radius: 8px;
      background: var(--blue);
      color: #ffffff;
      font-size: 24px;
      box-shadow: 0 10px 24px rgba(36,103,222,.22);
    }

    .template-light-workshop .stage-card {
      border-radius: 8px;
      background: rgba(255,255,255,.93);
      color: #111621;
      box-shadow: 0 16px 44px rgba(17,22,33,.16);
      font-size: 31px;
      line-height: 1.08;
      padding: 22px 24px;
    }

    .template-light-workshop .stage-card.dark {
      background: #111621;
      color: #ffffff;
      border: 0;
    }

    .template-light-workshop .stage-card.bad {
      background: #fff3f5;
      color: #35131a;
      outline: 4px solid rgba(255,95,125,.22);
    }

    .template-light-workshop .node {
      width: 150px;
      height: 88px;
      font-size: 24px;
      border-radius: 8px;
      background: #ffffff;
      color: #111621;
      box-shadow: 0 14px 32px rgba(17,22,33,.14);
    }

    .template-light-workshop .node.lost {
      background: var(--red);
      color: #ffffff;
    }

    .template-light-workshop .path-line {
      background: var(--blue);
    }

    .template-light-workshop .warning {
      left: 36px;
      top: 424px;
      width: 488px;
      background: #fff7dd;
      color: #211607;
      border-left: 9px solid var(--gold);
      font-size: 27px;
    }

    .template-light-workshop .metric {
      right: 24px;
      top: 24px;
      width: 154px;
      height: 154px;
      border-radius: 8px;
      background: var(--red);
      box-shadow: 0 18px 42px rgba(255,95,125,.24);
      font-size: 34px;
    }

    .template-light-workshop .flow {
      left: 34px;
      right: 34px;
      top: 126px;
      gap: 22px;
    }

    .template-light-workshop .flow-item {
      min-height: 96px;
      border-radius: 8px;
      background: #ffffff;
      color: #111621;
      font-size: 32px;
      box-shadow: 0 14px 36px rgba(17,22,33,.13);
    }

    .template-light-workshop .flow-item span:last-child {
      color: var(--blue);
    }

    .template-light-workshop .route-card {
      left: 34px;
      width: 492px;
      min-height: 92px;
      border-left: 8px solid var(--blue);
    }

    .template-light-workshop .route-card.one { top: 104px; }
    .template-light-workshop .route-card.two { top: 224px; }
    .template-light-workshop .route-card.three { top: 344px; }

    .template-light-workshop .check {
      border-radius: 8px;
      background: var(--mint);
      color: #111621;
    }

    .template-light-workshop .cta-panel {
      left: 38px;
      top: 82px;
      width: 484px;
      height: 392px;
      border-radius: 8px;
      background: #111621;
      color: #ffffff;
      box-shadow: 0 22px 58px rgba(17,22,33,.25);
    }

    .template-light-workshop .cta-word {
      color: var(--mint);
      font-size: 48px;
    }

    .template-light-workshop .comment-box {
      border-radius: 8px;
      background: rgba(255,255,255,.92);
      color: #111621;
    }

    .template-light-workshop .lower-mask {
      background:
        linear-gradient(180deg, rgba(228,236,231,0) 0%, rgba(228,236,231,.72) 24%, rgba(228,236,231,.97) 50%, #e4ece7 100%),
        linear-gradient(90deg, rgba(17,22,33,.045) 1px, transparent 1px),
        linear-gradient(0deg, rgba(17,22,33,.045) 1px, transparent 1px);
      background-size: auto, 72px 72px, 72px 72px;
    }

    .template-light-workshop .subtitle {
      left: 112px;
      top: 1190px;
      width: 724px;
      min-height: 138px;
      border-radius: 8px;
      background: rgba(255,255,255,.90);
      border: 2px solid rgba(17,22,33,.10);
      box-shadow: 0 16px 42px rgba(17,22,33,.16);
      color: #111621;
      font-size: 34px;
    }

    .template-light-workshop .transition-beat {
      background:
        radial-gradient(circle at 34% 40%, rgba(255,255,255,.94), rgba(174,229,106,.22) 28%, transparent 55%),
        linear-gradient(90deg, transparent 0%, rgba(174,229,106,.45) 38%, rgba(36,103,222,.28) 52%, rgba(255,95,125,.28) 64%, transparent 100%);
    }`;
}

function mainJs({ blocks, duration }) {
  return `window.__timelines = window.__timelines || {};
const blocks = ${JSON.stringify(blocks, null, 2)};
const duration = ${duration};
const root = document.getElementById("composition");
const subtitleEl = document.getElementById("subtitle");
const transitionBeat = document.getElementById("transitionBeat");
const tl = gsap.timeline({ paused: true });

tl.to(".ghost-word", { y: -70, opacity: 0.78, duration, ease: "none" }, 0);
tl.to("#voiceover", { volume: 0.94, duration, ease: "none" }, 0);
window.__timelines["main"] = tl;
window.__narratorBlocks = blocks;

function renderAt(time) {
  const t = Math.max(0, Math.min(duration, Number(time) || 0));
  const block = activeBlock(t);
  const transition = transitionState(t);
  if (subtitleEl) {
    let caption = block.subtitle;
    for (const cue of block.captions || []) {
      if (t - block.start >= cue.start) caption = cue.text;
    }
    subtitleEl.textContent = caption;
    subtitleEl.style.display = caption ? "flex" : "none";
  }
  if (transitionBeat) {
    transitionBeat.style.opacity = (transition.power * 0.82).toFixed(3);
    transitionBeat.style.transform = "scaleX(" + (0.7 + transition.power * 0.78).toFixed(3) + ")";
  }
}

function activeBlock(time) {
  return blocks.find((block) => time >= block.start && time < block.end) || blocks[blocks.length - 1] || { subtitle: "" };
}

function transitionState(time) {
  const boundaries = blocks.slice(1).map((block) => block.start);
  let nearest = Infinity;
  boundaries.forEach((boundary) => {
    nearest = Math.min(nearest, Math.abs(time - boundary));
  });
  const radius = 0.28;
  const power = nearest < radius ? 1 - smoothstep(0, radius, nearest) : 0;
  return { power };
}

function smoothstep(edge0, edge1, x) {
  const n = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return n * n * (3 - 2 * n);
}

function currentTime() {
  return Number(root?.dataset.currentTime || 0);
}

window.addEventListener("hf-seek", (event) => {
  renderAt(event.detail?.time ?? 0);
});
renderAt(currentTime());
`;
}

function narratorJs({ duration, template = "dark-tech" }) {
  return `import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const root = document.getElementById("composition");
const mount = document.getElementById("canvasWrap");
const blocks = window.__narratorBlocks || [];
const duration = ${duration};
const template = "${escapeAttr(template)}";

const slots = [
  { key: "breathing", file: "breathing.glb" },
  { key: "talking", file: "talking.glb" },
  { key: "happy", file: "happy-hand.glb" },
  { key: "yelling", file: "yelling.glb" }
];

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1.6875, 1.6875, 3, -3, 0.1, 100);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(1080, 1920);
renderer.outputColorSpace = THREE.SRGBColorSpace;
mount.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7c9098, 2.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
keyLight.position.set(-3, 4, 6);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x9af7ff, 1.35);
rimLight.position.set(4, 2, 3);
scene.add(rimLight);

const loader = new GLTFLoader();
const loaded = new Map();
let ready = false;

Promise.all(slots.map(loadSlot)).then(() => {
  ready = true;
  renderAt(currentTime());
}).catch((error) => {
  console.error(error);
});

async function loadSlot(slot) {
  const gltf = await loader.loadAsync("./assets/" + slot.file);
  const model = gltf.scene;
  model.visible = false;
  model.traverse((node) => {
    node.matrixAutoUpdate = true;
    node.matrixWorldAutoUpdate = true;
    if (node.isMesh) {
      node.frustumCulled = false;
      node.renderOrder = 1;
      if (Array.isArray(node.material)) node.material.forEach(normalizeMaterial);
      else if (node.material) normalizeMaterial(node.material);
    }
  });
  fitModel(model);
  scene.add(model);
  const clip = gltf.animations[0] || null;
  const mixer = clip ? new THREE.AnimationMixer(model) : null;
  if (mixer && clip) {
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();
  }
  loaded.set(slot.key, { model, mixer, clip });
}

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const profile = template === "light-workshop"
    ? { frameHeight: 3.85, x: -1.30, y: -1.05, rotation: 0.12 }
    : { frameHeight: 3.65, x: -1.22, y: -1.05, rotation: 0.12 };
  const scale = profile.frameHeight / Math.max(size.y, 1);
  model.scale.setScalar(scale);
  model.position.set(profile.x - center.x * scale, profile.y - center.y * scale, 0);
  model.rotation.set(0, profile.rotation, 0);
}

function normalizeMaterial(material) {
  material.transparent = false;
  material.opacity = 1;
  material.alphaTest = 0;
  material.depthTest = true;
  material.depthWrite = true;
  material.side = THREE.FrontSide;
  material.needsUpdate = true;
}

function renderAt(time) {
  const t = Math.max(0, Math.min(duration, Number(time) || 0));
  const block = activeBlock(t);
  const transition = transitionState(t);
  loaded.forEach((entry, key) => {
    entry.model.visible = ready && key === block.anim;
    if (entry.model.visible && entry.mixer && entry.clip) {
      const local = Math.max(0, t - block.start);
      entry.mixer.setTime(local % entry.clip.duration);
      entry.model.updateMatrixWorld(true);
      entry.model.traverse((node) => {
        if (node.isSkinnedMesh && node.skeleton) node.skeleton.update();
      });
    }
  });
  const punch = 1 + transition.power * 0.028;
  mount.style.transform = "scale(" + punch.toFixed(4) + ") translateY(" + (-transition.power * 8).toFixed(2) + "px)";
  mount.style.transformOrigin = "30% 44%";
  renderer.render(scene, camera);
}

function activeBlock(time) {
  return blocks.find((block) => time >= block.start && time < block.end) || blocks[blocks.length - 1];
}

function transitionState(time) {
  const boundaries = blocks.slice(1).map((block) => block.start);
  let nearest = Infinity;
  boundaries.forEach((boundary) => {
    nearest = Math.min(nearest, Math.abs(time - boundary));
  });
  const radius = 0.28;
  const power = nearest < radius ? 1 - smoothstep(0, radius, nearest) : 0;
  return { power };
}

function smoothstep(edge0, edge1, x) {
  const n = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return n * n * (3 - 2 * n);
}

function currentTime() {
  return Number(root.dataset.currentTime || 0);
}

window.addEventListener("hf-seek", (event) => {
  renderAt(event.detail?.time ?? 0);
});
renderAt(0);
`;
}

function configFor(videoSlug, manifest = {}, requestedTemplate = "") {
  const configs = {
    "animaciones-ux-funcionales": {
      title: "Animaciones UX Funcionales",
      ghost: ["ANIMACION", "UX FUNCIONAL"],
      animations: ["yelling", "talking", "happy", "talking", "yelling"],
      subtitles: [
        "Si se mueve sin ayudar, molesta.",
        "El usuario vino a decidir, no a sobrevivir a tu interfaz.",
        "Hover sutil, scroll suave y progreso visible.",
        "Feedback, orientación y control del movimiento.",
        "Comenta ANIMACIÓN y te envío la checklist."
      ],
      scenes: [
        {
          headline: [{ text: "Tu web se mueve " }, { text: "demasiado", accent: true }],
          copy: "Más movimiento no es más diseño. A veces solo es ruido con presupuesto.",
          stage: { type: "map", label: "Ruido visual", nodes: ["Hover", "Rebote", "Mareo"], warning: "Si anima sola y no ayuda, está robando atención." }
        },
        {
          headline: [{ text: "El movimiento también " }, { text: "cansa", accent: true }],
          copy: "Cuando todo salta, el usuario no entiende prioridad. Solo quiere escapar.",
          stage: { type: "chaos", metric: "Mareo", cards: [{ text: "Parpadeo gratuito", tone: "bad" }, { text: "Scroll brusco" }, { text: "Rebote automático", tone: "bad" }, { text: "Foco perdido", tone: "dark" }] }
        },
        {
          headline: [{ text: "Anima con " }, { text: "propósito", accent: true }],
          copy: "Convierte la animación en feedback, no en confeti digital desesperado.",
          stage: { type: "flow", label: "Microinteracciones", items: ["Hover sutil", "Scroll suave", "Progreso visible"] }
        },
        {
          headline: [{ text: "Feedback, no " }, { text: "ruido", accent: true }],
          copy: "El movimiento debe responder a una acción y orientar el siguiente paso.",
          stage: { type: "route", items: ["Acción clara", "Respuesta visible", "Reducir movimiento"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "checklist", accent: true }],
          copy: "Úsala antes de convertir tu web en una atracción de feria con botones.",
          stage: { type: "cta", word: "ANIMACION", box: "Comenta la palabra y te envío la checklist por privado." }
        }
      ]
    },
    "berry-picking-ia": {
      title: "Berry Picking IA",
      ghost: ["BUSQUEDA", "NO LINEAL"],
      animations: ["yelling", "talking", "happy", "talking", "yelling"],
      subtitles: [
        "La búsqueda real no es una línea recta.",
        "El usuario aprende mientras busca.",
        "Berry-picking: consulta, pista, nueva consulta.",
        "Une búsqueda y navegación en el mismo sistema.",
        "Comenta BÚSQUEDA y te envío la checklist."
      ],
      scenes: [
        {
          headline: [{ text: "Buscar no es " }, { text: "lineal", accent: true }],
          copy: "Una barra de búsqueda no es una máquina de respuestas perfectas.",
          stage: { type: "map", label: "Ruta rota", nodes: ["Pregunta", "Resultado", "Nueva duda"], warning: "El usuario no llega con la pregunta perfecta en la cabeza." }
        },
        {
          headline: [{ text: "Nadie empieza " }, { text: "sabiendo", accent: true }],
          copy: "La primera consulta suele ser torpe. Luego aprende, corrige y cambia.",
          stage: { type: "chaos", metric: "Vaga", cards: [{ text: "Consulta inicial", tone: "bad" }, { text: "Resultado útil" }, { text: "Nueva intención", tone: "dark" }, { text: "Otra búsqueda" }] }
        },
        {
          headline: [{ text: "Recolecta " }, { text: "pistas", accent: true }],
          copy: "Bates lo llamó Berry-picking: recoger fragmentos y ajustar la ruta.",
          stage: { type: "flow", label: "Berry-picking", items: ["Consulta vaga", "Pista útil", "Consulta mejor"] }
        },
        {
          headline: [{ text: "Une buscar y " }, { text: "navegar", accent: true }],
          copy: "Tu arquitectura debe permitir saltar entre categorías, filtros y búsquedas.",
          stage: { type: "route", items: ["Buscar en categoría", "Explorar resultados", "Refinar sin fricción"] }
        },
        {
          headline: [{ text: "Quieres mejores " }, { text: "flujos", accent: true }],
          copy: "Diseña para humanos que cambian de idea, no para robots obedientes.",
          stage: { type: "cta", word: "BUSQUEDA", box: "Comenta la palabra y te envío la checklist por privado." }
        }
      ]
    },
    "disenar-funcionalidades-no-shell": {
      title: "Diseña Funcionalidades No Shell",
      ghost: ["FUNCION", "NO SHELL"],
      animations: ["yelling", "talking", "happy", "talking", "yelling"],
      subtitles: [
        "Un menú bonito sin función no salva nada.",
        "El layout vacío te hace decidir en el aire.",
        "Primero diseña la acción central.",
        "La jerarquía aparece cuando el uso está claro.",
        "Comenta FUNCIONALIDAD y te envío el framework."
      ],
      scenes: [
        {
          headline: [{ text: "Deja el " }, { text: "cascarón", accent: true }],
          copy: "Diseñar menús antes que funciones es decorar una casa sin suelo.",
          stage: { type: "map", label: "Shell vacío", nodes: ["Logo", "Menú", "¿Uso?"], warning: "Si no hay acción real, el layout solo está fingiendo." }
        },
        {
          headline: [{ text: "El layout te " }, { text: "atasca", accent: true }],
          copy: "Te quedas moviendo piezas que aún no tienen una razón para existir.",
          stage: { type: "chaos", metric: "Bloqueo", cards: [{ text: "Sidebar primero", tone: "bad" }, { text: "Footer eterno" }, { text: "Logo gigante", tone: "bad" }, { text: "Función pendiente", tone: "dark" }] }
        },
        {
          headline: [{ text: "Diseña el " }, { text: "núcleo", accent: true }],
          copy: "Empieza por la acción que el usuario viene a completar. Lo demás obedece.",
          stage: { type: "flow", label: "Función central", items: ["Buscar vuelo", "Elegir fecha", "Confirmar reserva"] }
        },
        {
          headline: [{ text: "La estructura " }, { text: "aparece", accent: true }],
          copy: "Cuando el uso manda, navegación y jerarquía dejan de ser adivinanza.",
          stage: { type: "route", items: ["Acción principal", "Datos necesarios", "Layout natural"] }
        },
        {
          headline: [{ text: "Empieza por " }, { text: "función", accent: true }],
          copy: "El framework te evita horas diseñando pantallas vacías con cara seria.",
          stage: { type: "cta", word: "FUNCIONALIDAD", box: "Comenta la palabra y te envío el framework por privado." }
        }
      ]
    },
    "estrategia-colonias-seo": {
      title: "Estrategia Colonias SEO",
      ghost: ["COLONIAS SEO", "RAMIFICA"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "Una URL ganadora no es un trofeo muerto.",
        "Crear páginas huérfanas desde cero quema autoridad.",
        "Núcleo, ramas long-tail y enlaces internos.",
        "Así blindas rankings y multiplicas entradas.",
        "Comenta COLONIA y te envío el framework."
      ],
      scenes: [
        {
          headline: [{ text: "Tu URL #1 es un " }, { text: "núcleo", accent: true }],
          copy: "Cuando Google ya confía en una página, úsala para expandir el territorio semántico.",
          stage: { type: "map", label: "Núcleo SEO", nodes: ["URL #1", "Long-tail", "Ranking"], warning: "La autoridad ganada debe ramificarse, no quedarse decorando Analytics." }
        },
        {
          headline: [{ text: "Deja de empezar " }, { text: "desde cero", accent: true }],
          copy: "Las páginas huérfanas compiten sin fuerza. Mucho contenido, poca tracción.",
          stage: { type: "chaos", metric: "Fuerza", cards: [{ text: "Página nueva", tone: "bad" }, { text: "Sin enlaces" }, { text: "Keyword aislada", tone: "bad" }, { text: "Núcleo olvidado", tone: "dark" }] }
        },
        {
          headline: [{ text: "Construye " }, { text: "colonias", accent: true }],
          copy: "Crea variaciones específicas alrededor de la URL ganadora y conecta todo con intención.",
          stage: { type: "flow", label: "Ramificación", items: ["URL núcleo", "Variaciones long-tail", "Enlazado interno"] }
        },
        {
          headline: [{ text: "Multiplica el " }, { text: "territorio", accent: true }],
          copy: "Cada rama captura una intención concreta y refuerza la autoridad temática del dominio.",
          stage: { type: "route", items: ["Núcleo fuerte", "Ramas específicas", "Ranking blindado"] }
        },
        {
          headline: [{ text: "Quieres el " }, { text: "framework", accent: true }],
          copy: "Te paso la guía para convertir una URL ganadora en una red de rankings.",
          stage: { type: "cta", word: "COLONIA", box: "Comenta la palabra y te envío el framework por privado." }
        }
      ]
    },
    "modificador-barato-seo": {
      title: "Modificador Barato SEO",
      ghost: ["BARATO", "CTR SEO"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "La palabra barato también vende.",
        "Elegante no significa que convierta.",
        "Modificador, intención y menciones externas.",
        "Google y las IAs leen señales de mercado.",
        "Comenta TRUCO y te envío la checklist."
      ],
      scenes: [
        {
          headline: [{ text: "Barato también " }, { text: "vende", accent: true }],
          copy: "Si el usuario busca precio, esconderlo por ego de marca es perder clics calientes.",
          stage: { type: "map", label: "Intención", nodes: ["Barato", "Precio", "Comprar"], warning: "No todo el mundo busca lujo. Mucha gente busca resolver con presupuesto." }
        },
        {
          headline: [{ text: "Prestigio no paga " }, { text: "facturas", accent: true }],
          copy: "Los títulos elegantes pueden sonar bonitos y aun así dejar el CTR en coma.",
          stage: { type: "chaos", metric: "CTR", cards: [{ text: "Keyword premium", tone: "bad" }, { text: "Clic frío" }, { text: "Miedo a precio", tone: "bad" }, { text: "Búsqueda real", tone: "dark" }] }
        },
        {
          headline: [{ text: "Añade el " }, { text: "modificador", accent: true }],
          copy: "Combina títulos con intención económica y micro-influencers pequeños para generar menciones.",
          stage: { type: "flow", label: "Palanca", items: ["Barato / económico", "Landing específica", "Menciones externas"] }
        },
        {
          headline: [{ text: "Gana señales " }, { text: "reales", accent: true }],
          copy: "Más clics, más enlaces y más contexto para que Google y las IAs entiendan tu oferta.",
          stage: { type: "route", items: ["Clic transaccional", "Mención externa", "Recomendación IA"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "checklist", accent: true }],
          copy: "Te paso los modificadores que convierten búsquedas feas en visitas que compran.",
          stage: { type: "cta", word: "TRUCO", box: "Comenta la palabra y te envío la checklist por privado." }
        }
      ]
    },
    "pagerank-decay-compra": {
      title: "PageRank Decay Compra",
      ghost: ["PAGERANK", "DECAY"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "Tu home no debería tragarse toda la autoridad.",
        "Cada clic profundo diluye fuerza interna.",
        "Enlaza directo hacia páginas con intención de compra.",
        "Menos pérdida, más ranking transaccional.",
        "Comenta DECAY y te envío el mapa."
      ],
      scenes: [
        {
          headline: [{ text: "Tu home no lo " }, { text: "merece todo", accent: true }],
          copy: "Si toda la autoridad se queda arriba, tus páginas de venta llegan débiles.",
          stage: { type: "map", label: "Flujo roto", nodes: ["Home", "Cat.", "Producto"], warning: "La página que convierte no puede vivir a cinco clics de la fuerza." }
        },
        {
          headline: [{ text: "Cada clic " }, { text: "diluye", accent: true }],
          copy: "Menús profundos, categorías infinitas y rutas largas hacen que el PageRank pierda pegada.",
          stage: { type: "chaos", metric: "Decay", cards: [{ text: "Clic 1", tone: "dark" }, { text: "Clic 2" }, { text: "Clic 3", tone: "bad" }, { text: "Producto débil", tone: "bad" }] }
        },
        {
          headline: [{ text: "Enlaza directo a " }, { text: "compra", accent: true }],
          copy: "Lleva autoridad desde URLs fuertes hacia páginas con intención comercial clara.",
          stage: { type: "flow", label: "Ruta corta", items: ["URL fuerte", "Enlace directo", "Página de compra"] }
        },
        {
          headline: [{ text: "Ranking con menos " }, { text: "fricción", accent: true }],
          copy: "Al acortar la ruta, más fuerza llega a donde se decide la venta.",
          stage: { type: "route", items: ["Autoridad intacta", "Destino transaccional", "Posición más rápida"] }
        },
        {
          headline: [{ text: "Quieres el " }, { text: "mapa", accent: true }],
          copy: "Te paso la arquitectura para que el PageRank no se evapore antes de vender.",
          stage: { type: "cta", word: "DECAY", box: "Comenta la palabra y te envío el mapa por privado." }
        }
      ]
    },
    "analisis-competidores-data": {
      title: "Análisis Competidores Data",
      ghost: ["DATA SEO", "NO ADIVINES"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "Deja de mirar el DR como si fuera sagrado.",
        "Autoridad sin tráfico real puede ser humo.",
        "Cruza enlaces, tráfico y posiciones con Python.",
        "Los hubs reales aparecen en tres o más competidores.",
        "Comenta COMPETIDOR y te envío la plantilla."
      ],
      scenes: [
        {
          headline: [{ text: "No adivines el " }, { text: "SEO", accent: true }],
          copy: "Mirar solo autoridad es cómodo. También puede ser una chapuza con logo bonito.",
          stage: { type: "map", label: "Métrica rota", nodes: ["DR", "DA", "Ranking"], warning: "Una métrica aislada no explica por qué te pasan por encima." }
        },
        {
          headline: [{ text: "El DR puede ser " }, { text: "humo", accent: true }],
          copy: "Si el dominio referente no tiene tráfico, ese enlace quizá solo queda bonito en el informe.",
          stage: { type: "chaos", metric: "R2 bajo", cards: [{ text: "DR alto", tone: "bad" }, { text: "Tráfico cero" }, { text: "Visibilidad floja", tone: "bad" }, { text: "Dato real manda", tone: "dark" }] }
        },
        {
          headline: [{ text: "Mide con " }, { text: "Python", accent: true }],
          copy: "Calcula Link Capital cruzando enlaces, tráfico acumulado y posiciones reales.",
          stage: { type: "flow", label: "Pipeline SEO", items: ["Extrae enlaces", "Cruza tráfico", "Modela rankings"] }
        },
        {
          headline: [{ text: "Encuentra los " }, { text: "hubs", accent: true }],
          copy: "Filtra dominios que enlazan a varios competidores y aparece la red útil del nicho.",
          stage: { type: "route", items: ["3+ competidores", "Hubs reales", "Prioridad de enlaces"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "plantilla", accent: true }],
          copy: "Te paso el script para dejar de adivinar y empezar a operar con datos.",
          stage: { type: "cta", word: "COMPETIDOR", box: "Comenta la palabra y te envío la plantilla Python." }
        }
      ]
    },
    "auditoria-enlaces-toxicos": {
      title: "Auditoría Enlaces Tóxicos",
      ghost: ["ENLACES", "TOXICOS"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "El DR puede mentirte con una sonrisa.",
        "Autoridad inflada no significa confianza real.",
        "Cruza Spam Score, Trust Flow y toxicidad.",
        "Los anchors son el filtro de seguridad.",
        "Comenta AUDITORIA y te envío la checklist."
      ],
      scenes: [
        {
          headline: [{ text: "El DR puede " }, { text: "mentir", accent: true }],
          copy: "Una métrica alta no limpia un perfil lleno de spam. Solo lo disfraza mejor.",
          stage: { type: "map", label: "Métrica falsa", nodes: ["DR alto", "Spam", "Riesgo"], warning: "Si compras por un numerito bonito, compras el problema de otro." }
        },
        {
          headline: [{ text: "Autoridad " }, { text: "inflada", accent: true }],
          copy: "Los enlaces automatizados suben métricas externas, pero no crean confianza frente a Google.",
          stage: { type: "chaos", metric: "Spam", cards: [{ text: "DR bonito", tone: "bad" }, { text: "Anchors raros" }, { text: "Enlaces basura", tone: "bad" }, { text: "Trust bajo", tone: "dark" }] }
        },
        {
          headline: [{ text: "Audita con " }, { text: "cruce", accent: true }],
          copy: "No mires una herramienta aislada. Cruza señales hasta que el perfil deje de fingir.",
          stage: { type: "flow", label: "Filtro real", items: ["Spam Score", "Trust Flow", "Toxicidad"] }
        },
        {
          headline: [{ text: "Mira los " }, { text: "anchors", accent: true }],
          copy: "Marca y URL limpia son salud. Spam, idiomas raros o temáticas turbias son salida inmediata.",
          stage: { type: "route", items: ["Marca dominante", "URL desnuda", "Descartar spam"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "checklist", accent: true }],
          copy: "Te paso el filtro para auditar enlaces antes de tragarte una penalización elegante.",
          stage: { type: "cta", word: "AUDITORIA", box: "Comenta la palabra y te envío la checklist por privado." }
        }
      ]
    },
    "escalera-enlaces-seo-laddering": {
      title: "Escalera Enlaces SEO",
      ghost: ["LINK", "LADDER"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "No compres enlaces a ciegas.",
        "Las páginas difíciles sin clics se hunden.",
        "Long-tail, dificultad media y página de venta.",
        "Los clics reales empujan autoridad interna.",
        "Comenta ESCALERA y te envío la guía."
      ],
      scenes: [
        {
          headline: [{ text: "No quemes " }, { text: "dinero", accent: true }],
          copy: "Comprar enlaces para una página fría puede ser caro, lento y bastante torpe.",
          stage: { type: "map", label: "Ruta cara", nodes: ["Backlink", "Venta", "Bloqueo"], warning: "Si la página no tiene tracción, el enlace externo llega a un solar vacío." }
        },
        {
          headline: [{ text: "Sin clics, " }, { text: "invisible", accent: true }],
          copy: "Una página comercial difícil publicada desde cero suele quedarse enterrada.",
          stage: { type: "chaos", metric: "Clics", cards: [{ text: "Keyword difícil", tone: "bad" }, { text: "Sin rutas" }, { text: "Indexación floja", tone: "bad" }, { text: "Página huérfana", tone: "dark" }] }
        },
        {
          headline: [{ text: "Construye " }, { text: "escalera", accent: true }],
          copy: "Empieza por búsquedas fáciles y usa cada victoria para subir al siguiente nivel.",
          stage: { type: "flow", label: "Link Ladder", items: ["Long-tail fácil", "Página media", "Página de venta"] }
        },
        {
          headline: [{ text: "Canaliza " }, { text: "autoridad", accent: true }],
          copy: "Los clics reales y el PageRank interno viajan por la cadena hacia lo transaccional.",
          stage: { type: "route", items: ["Clics reales", "Enlace interno", "Ranking comercial"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "guía", accent: true }],
          copy: "Te paso el mapa para montar una escalera de autoridad sin depender de backlinks.",
          stage: { type: "cta", word: "ESCALERA", box: "Comenta la palabra y te envío la guía por privado." }
        }
      ]
    },
    "rank-rent-seo-local-canalla": {
      title: "Rank And Rent SEO Local",
      template: "light-workshop",
      ghost: ["RANK RENT", "LLAMADAS"],
      animations: ["yelling", "talking", "talking", "happy", "happy"],
      subtitles: [
        "Deja de mendigar informes SEO.",
        "El modelo de agencia tradicional está roto.",
        "Crea webs, manda llamadas y cobra renta semanal.",
        "Si el activo es tuyo, el control también.",
        "Comenta RENTAR y te envío el blueprint."
      ],
      scenes: [
        {
          headline: [{ text: "Deja de " }, { text: "mendigar", accent: true }],
          copy: "Vender informes a clientes que no entienden SEO es una forma muy elegante de sufrir.",
      stage: { type: "map", label: "Agencia clásica", nodes: ["Informe", "Reunión", "Cancelado"], warning: "Vendes métricas. Te cancelan." }
        },
        {
          headline: [{ text: "El modelo está " }, { text: "roto", accent: true }],
          copy: "Haces trabajo útil y te cancelan porque la gráfica no les ha dado dopamina inmediata.",
          stage: { type: "chaos", metric: "No paga", cards: [{ text: "Cliente pesado", tone: "bad" }, { text: "Informe eterno" }, { text: "Métrica confusa", tone: "bad" }, { text: "Contrato cancelado", tone: "dark" }] }
        },
        {
          headline: [{ text: "Crea el " }, { text: "activo", accent: true }],
          copy: "Web propia, número de rastreo, llamadas reales y una renta semanal cuando ya hay valor.",
          stage: { type: "flow", label: "Rank and Rent", items: ["Crear web", "Enviar llamadas", "Cobro semanal"] }
        },
        {
          headline: [{ text: "Tú tienes el " }, { text: "control", accent: true }],
          copy: "El dominio y la línea son tuyos. Si no pagan, el flujo cambia de destino en segundos.",
          stage: { type: "route", items: ["Dominio propio", "Número propio", "Redirigir llamadas"] }
        },
        {
          headline: [{ text: "Quieres el " }, { text: "blueprint", accent: true }],
          copy: "Te paso el esquema para montar el sistema sin vender humo corporativo.",
          stage: { type: "cta", word: "RENTAR", box: "Comenta RENTAR y te envío el blueprint técnico por privado." }
        }
      ]
    },
    "mito-domain-rating-seo": {
      title: "Mito Domain Rating SEO",
      ghost: ["DOMAIN", "RATING"],
      animations: ["yelling", "talking", "talking", "happy", "yelling"],
      subtitles: [
        "El DR no es confianza.",
        "Una métrica inflada puede venderte humo.",
        "Busca trust, anchors limpios y tráfico.",
        "Un dominio limpio ahorra meses.",
        "Comenta DOMINIO y te envío la checklist."
      ],
      scenes: [
        {
          headline: [{ text: "El DR no es " }, { text: "trust", accent: true }],
          copy: "Un número alto puede sonar poderoso y seguir siendo humo con traje caro.",
          stage: { type: "map", label: "DR inflado", nodes: ["DR alto", "Trust", "Compra"], warning: "Si no revisas la confianza real, compras una caja negra." }
        },
        {
          headline: [{ text: "La métrica se " }, { text: "infla", accent: true }],
          copy: "Los vendedores pueden manipular señales externas con enlaces automatizados.",
          stage: { type: "chaos", metric: "Humo", cards: [{ text: "DR alto", tone: "bad" }, { text: "Trust bajo" }, { text: "Sin tráfico", tone: "bad" }, { text: "Anchors spam", tone: "dark" }] }
        },
        {
          headline: [{ text: "Busca " }, { text: "confianza", accent: true }],
          copy: "Analiza enlaces limpios, anchors de marca, URL directa y señales reales de tráfico.",
          stage: { type: "flow", label: "Auditoría", items: ["Trust real", "Anchors limpios", "Tráfico vivo"] }
        },
        {
          headline: [{ text: "Compra " }, { text: "limpio", accent: true }],
          copy: "Un dominio antiguo sano puede saltarse meses de espera. Uno inflado solo trae líos.",
          stage: { type: "route", items: ["Perfil limpio", "Autoridad temática", "Rankings más rápidos"] }
        },
        {
          headline: [{ text: "Quieres la " }, { text: "checklist", accent: true }],
          copy: "Te paso los filtros para no comprar un dominio bonito por fuera y podrido por dentro.",
          stage: { type: "cta", word: "DOMINIO", box: "Comenta la palabra y te envío la checklist por privado." }
        }
      ]
    }
  };

  const config = configs[videoSlug];
  if (config) return config;
  return configFromManifest(videoSlug, manifest, requestedTemplate);
}

function configFromManifest(videoSlug, manifest, requestedTemplate) {
  const manifestScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (!manifestScenes.length) fail(`No visual config for ${videoSlug}`);

  const rawTemplate = requestedTemplate || manifest.project?.visual_template || "dark-tech";
  const template = normalizeTemplate(rawTemplate);
  const title = manifest.project?.title || titleFromSlug(videoSlug);
  const ghost = ensureArray(manifest.project?.ghost, dataLabGhost(title, template)).slice(0, 3);

  return {
    title,
    template,
    ghost,
    animations: manifestScenes.map((scene) => scene.animation || "talking"),
    subtitles: manifestScenes.map((scene) => compactText(scene.screen_text || scene.label || scene.text || "Escena", 78)),
    scenes: manifestScenes.map((scene, index) => {
      const copySource = template === "data-lab"
        ? scene.copy || scene.visual_copy || scene.visual_note || scene.text || scene.screen_text || ""
        : scene.copy || scene.visual_copy || scene.text || scene.visual_note || scene.screen_text || "";
      return {
        headline: headlineFromText(scene.headline || scene.screen_text || scene.label || `Escena ${index + 1}`),
        copy: compactText(copySource, template === "data-lab" ? 104 : 138),
        takeaway: compactText(scene.takeaway || "", 46),
        stage: normalizeStage(scene.stage || fallbackStageFor(scene, index, manifestScenes.length, template))
      };
    })
  };
}

function fallbackStageFor(scene, index, totalScenes, template) {
  const screenText = compactText(scene.screen_text || scene.label || `Escena ${index + 1}`, 34);
  const short = compactText(scene.visual_note || scene.text || screenText, 42);
  const isLast = index === totalScenes - 1;

  if (template !== "data-lab") {
    if (isLast) return { type: "cta", word: keywordFromText(screenText), box: short };
    if (index === 0) return { type: "map", label: screenText, nodes: ["Problema", "Dato", "Accion"], warning: short };
    if (index === 1) return { type: "chaos", metric: keywordFromText(screenText), cards: [{ text: "Ruido", tone: "bad" }, { text: "Dato suelto" }, { text: short, tone: "dark" }] };
    if (index === 2) return { type: "flow", label: screenText, items: ["Senal", "Diagnostico", "Accion"] };
    return { type: "route", items: ["Prioridad clara", "Paso medible", "Resultado visible"] };
  }

  if (isLast) return { type: "cta", word: keywordFromText(screenText), box: short };
  const pattern = index % 7;
  if (pattern === 0) return { type: "serp", query: compactText(screenText.toLowerCase(), 30), results: ["Resultado organico", "Landing util", "Competidor"], highlight: "Oportunidad", metric: "CTR +" };
  if (pattern === 1) return { type: "dashboard", label: screenText, metrics: [{ label: "Leads", value: "+24%" }, { label: "CTR", value: "6.8%" }, { label: "CPC", value: "-18%" }, { label: "ROAS", value: "3.1x" }], trend: [26, 34, 31, 48, 57, 72] };
  if (pattern === 2) return { type: "keyword-map", core: keywordFromText(screenText), clusters: ["intencion", "long-tail", "local", "comercial"] };
  if (pattern === 3) return { type: "funnel", steps: ["Impresion", "Clic", "Lead", "Venta"], leak: short };
  if (pattern === 4) return { type: "comparison", left: { label: "Antes", value: "Ruido" }, right: { label: "Despues", value: "Prioridad" } };
  if (pattern === 5) return { type: "checklist", items: ["Tracking", "Intencion", "Oferta"], checked: 2 };
  return { type: "timeline", label: screenText, points: ["Sem 1", "Sem 2", "Sem 3", "Sem 4"], values: ["18", "11", "7", "3"] };
}

function normalizeStage(stage) {
  if (!stage || typeof stage !== "object") return { type: "flow", label: "Sistema", items: ["Senal", "Diagnostico", "Accion"] };
  if (stage.type === "map") return { ...stage, nodes: ensureArray(stage.nodes, ["Inicio", "Dato", "Accion"]).slice(0, 3), warning: stage.warning || "Prioriza lo que mueve la aguja." };
  if (stage.type === "chaos") return { ...stage, cards: ensureArray(stage.cards, [{ text: "Ruido", tone: "bad" }, { text: "Dato suelto" }, { text: "Sin prioridad", tone: "dark" }]).slice(0, 4) };
  if (stage.type === "flow" || stage.type === "route") return { ...stage, items: ensureArray(stage.items, ["Paso 1", "Paso 2", "Paso 3"]).slice(0, 5) };
  if (stage.type === "cta") return { ...stage, word: stage.word || "DATA", box: stage.box || "Comenta la palabra y te envio la plantilla." };
  return stage;
}

function headlineFromText(value) {
  const text = compactText(value || "Nuevo video", 44).toUpperCase();
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [{ text, accent: true }];
  const accent = parts.pop();
  return [{ text: `${parts.join(" ")} ` }, { text: accent, accent: true }];
}

function dataLabGhost(title, template) {
  if (template === "data-lab") return ["DATA", "MARKETING"];
  const words = String(title || "VIDEO").toUpperCase().split(/\s+/).filter(Boolean);
  return [words.slice(0, 2).join(" ") || "VIDEO", words.slice(2, 4).join(" ") || "SOCIAL"];
}

function titleFromSlug(value) {
  return String(value || "video")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function compactText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function keywordFromText(value) {
  const words = String(value || "DATA").toUpperCase().replace(/[^A-Z0-9ÁÉÍÓÚÜÑ ]/g, " ").split(/\s+/).filter(Boolean);
  return (words.find((word) => word.length >= 4) || words[0] || "DATA").slice(0, 12);
}

function ensureArray(value, fallback) {
  return Array.isArray(value) && value.length ? value : fallback;
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function keywordClusterPosition(index) {
  const positions = [
    { left: 70, top: 82 },
    { left: 456, top: 92 },
    { left: 64, top: 408 },
    { left: 452, top: 410 },
    { left: 246, top: 38 },
    { left: 246, top: 510 }
  ];
  return positions[index] || positions[index % positions.length];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function safeId(value) {
  return escapeAttr(String(value).toLowerCase()).replace(/^-+|-+$/g, "") || "scene";
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function getAudioDuration(file) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : null;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
