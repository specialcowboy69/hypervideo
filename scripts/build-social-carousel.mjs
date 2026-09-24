import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";

const DEFAULT_CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
];

const ICONS = {
  layout: "▦",
  warning: "!",
  tool: "⌁",
  arrows: "→",
  chart: "▥",
  bookmark: "▱",
  default: "◆"
};

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function validateSlug(slug) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes("..")) {
    throw new Error("Invalid slug. Use only letters, numbers, dot, dash and underscore.");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fileUrl(filePath) {
  const absolute = path.resolve(filePath).replace(/\\/g, "/");
  return `file:///${absolute.replace(/^\/+/, "")}`;
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findChrome(explicitPath = "") {
  const candidates = explicitPath ? [explicitPath, ...DEFAULT_CHROME_PATHS] : DEFAULT_CHROME_PATHS;
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

function normalizeSlide(slide, index, total) {
  return {
    type: slide.type || (index === 0 ? "hook" : index === total - 1 ? "cta" : "steps"),
    tag: slide.tag || `SLIDE ${String(index + 1).padStart(2, "0")}`,
    icon: slide.icon || "default",
    title: slide.title || "",
    accent: slide.accent || "",
    headline: Array.isArray(slide.headline) ? slide.headline : [],
    serif: slide.serif || "",
    body: slide.body || "",
    cards: Array.isArray(slide.cards) ? slide.cards : [],
    steps: Array.isArray(slide.steps) ? slide.steps : [],
    items: Array.isArray(slide.items) ? slide.items : [],
    keyword: slide.keyword || "",
    number: `${String(index + 1).padStart(2, "0")}/${String(total).padStart(2, "0")}`
  };
}

function renderHeader(slide) {
  const icon = ICONS[slide.icon] || ICONS.default;
  return `
    <header class="slide-header">
      <div class="header-tag"><span class="tag-icon">${escapeHtml(icon)}</span><span>${escapeHtml(slide.tag)}</span></div>
      <div class="header-line"></div>
    </header>
  `;
}

function renderFooter({ handle, slide }) {
  return `
    <footer class="slide-footer">
      <div class="footer-username"><span class="footer-icon">◎</span><span>${escapeHtml(handle)}</span></div>
      <div class="save-for-later">save for later <span class="bookmark">▯</span></div>
      <div class="swipe-indicator"><span>${escapeHtml(slide.number)}</span><span>→</span></div>
    </footer>
  `;
}

function renderHook(slide) {
  const lines = slide.headline.length ? slide.headline : [slide.title, slide.accent].filter(Boolean);
  return `
    <main class="slide-content hook-layout">
      <h1 class="hook-title">
        ${lines.map((line) => `<span class="display accent">${escapeHtml(line)}</span>`).join("\n")}
        ${slide.serif ? `<span class="editorial">${escapeHtml(slide.serif)}</span>` : ""}
      </h1>
    </main>
  `;
}

function renderProblem(slide) {
  const cards = slide.cards.length
    ? slide.cards
    : [
        { label: "Ruido visual", tone: "bad" },
        { label: "Mensaje confuso", tone: "bad" },
        { label: "Conversion dormida", tone: "bad" }
      ];
  return `
    <main class="slide-content problem-layout">
      <h1 class="section-title">
        <span>${escapeHtml(slide.title || "EL PROBLEMA:")}</span>
        <span class="accent">${escapeHtml(slide.accent)}</span>
      </h1>
      ${slide.body ? `<p class="body-copy">${escapeHtml(slide.body)}</p>` : ""}
      <section class="ui-box stack-box">
        ${cards.map((card) => `<div class="mini-card ${card.tone === "good" ? "good" : "bad"}">${escapeHtml(card.label || card.text || card)}</div>`).join("\n")}
      </section>
    </main>
  `;
}

function renderSteps(slide) {
  const steps = slide.steps.length
    ? slide.steps
    : [
        { number: "1", title: slide.title || "DEFINE EL PUNTO", body: slide.body || "Una idea clara por slide." }
      ];
  return `
    <main class="slide-content steps-layout">
      <h1 class="section-title compact">
        <span>${escapeHtml(slide.title || "EL SISTEMA:")}</span>
        ${slide.serif ? `<span class="editorial inline">${escapeHtml(slide.serif)}</span>` : ""}
      </h1>
      <section class="steps-list">
        ${steps
          .map(
            (step, index) => `
          <article class="step-row">
            <div class="step-number">${escapeHtml(step.number || String(index + 1))}</div>
            <div>
              <h2>${escapeHtml(step.title || "")}</h2>
              <p>${escapeHtml(step.body || "")}</p>
            </div>
          </article>
        `
          )
          .join("\n")}
      </section>
    </main>
  `;
}

function renderPayoff(slide) {
  const items = slide.items.length ? slide.items : ["Mas claridad", "Mas confianza", "Mas conversion"];
  return `
    <main class="slide-content payoff-layout">
      <h1 class="section-title">
        <span>${escapeHtml(slide.title || "EL RESULTADO:")}</span>
        <span class="accent">${escapeHtml(slide.accent || "SE ENTIENDE A LA PRIMERA")}</span>
      </h1>
      <section class="ui-box payoff-box">
        ${items.map((item) => `<div class="payoff-item"><span>✓</span><strong>${escapeHtml(item)}</strong></div>`).join("\n")}
      </section>
    </main>
  `;
}

function renderCta(slide) {
  return `
    <main class="slide-content cta-layout">
      <div class="cta-icon">▯</div>
      <h1 class="section-title cta-title">
        <span>${escapeHtml(slide.title || "GUARDA ESTE POST")}</span>
        <span class="accent">${escapeHtml(slide.accent || "PARA USARLO LUEGO")}</span>
      </h1>
      <section class="ui-box cta-box">
        <span class="small-label">Comenta</span>
        <strong>"${escapeHtml(slide.keyword || "GUIA")}"</strong>
        ${slide.body ? `<p>${escapeHtml(slide.body)}</p>` : ""}
      </section>
    </main>
  `;
}

function renderSlideBody(slide) {
  switch (slide.type) {
    case "hook":
      return renderHook(slide);
    case "problem":
      return renderProblem(slide);
    case "payoff":
      return renderPayoff(slide);
    case "cta":
      return renderCta(slide);
    case "steps":
    default:
      return renderSteps(slide);
  }
}

function renderHtml({ carousel, slide, index }) {
  const handle = carousel.handle || "@crecimientosc";
  const title = carousel.title || carousel.slug || "Carousel";
  const isCta = slide.type === "cta";
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Slide ${index + 1}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
  <style>${COMMON_CSS}</style>
</head>
<body>
  <div class="slide ${isCta ? "slide-cta" : ""}">
    <div class="blob blob-orange"></div>
    <div class="blob blob-blue"></div>
    ${renderHeader(slide)}
    ${renderSlideBody(slide)}
    ${renderFooter({ handle, slide })}
  </div>
</body>
</html>`;
}

async function screenshot({ chromePath, htmlPath, pngPath }) {
  await run(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=3000",
    "--window-size=540,675",
    "--force-device-scale-factor=2",
    `--screenshot=${pngPath}`,
    fileUrl(htmlPath)
  ]);
}

async function updateQueue({ root, carousel, outDir }) {
  const queuePath = path.join(root, "content", "carousel-queue", "queue.json");
  if (!(await exists(queuePath)) || carousel.slug === "_template") return;

  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  const index = queue.items.findIndex((item) => item.slug === carousel.slug);
  const item = {
    slug: carousel.slug,
    title: carousel.title || carousel.slug,
    status: "generated",
    folder: `pending/${carousel.slug}`,
    created_at: carousel.created_at || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    template: carousel.theme || "editorial-moody-green",
    publish_at: carousel.publish_at || "",
    default_interval_minutes: carousel.default_interval_minutes || 240,
    outputs: {
      content_folder: `content/carousel-queue/pending/${carousel.slug}`,
      carousel_folder: path.relative(root, outDir).replace(/\\/g, "/"),
      manifest: path.relative(root, path.join(outDir, "manifest.json")).replace(/\\/g, "/")
    },
    notes: "Generated with Editorial Moody Green carousel template; pending R2 upload and n8n scheduling."
  };
  if (index >= 0) {
    queue.items[index] = { ...queue.items[index], ...item, created_at: queue.items[index].created_at || item.created_at };
  } else {
    queue.items.push(item);
  }
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
}

const COMMON_CSS = `
:root {
  --bg-color: #1A2B1E;
  --primary: #FFFFFF;
  --accent: #FF3B1D;
  --muted: rgba(255, 255, 255, 0.72);
  --line: rgba(255, 255, 255, 0.14);
  --card-bg: rgba(255, 255, 255, 0.045);
  --card-border: rgba(255, 255, 255, 0.12);
}

* { box-sizing: border-box; }

html,
body {
  width: 540px;
  height: 675px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--bg-color);
}

body {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slide {
  position: relative;
  width: 540px;
  height: 675px;
  padding: 70px;
  overflow: hidden;
  color: var(--primary);
  background:
    radial-gradient(circle at 78% 5%, rgba(255, 59, 29, 0.08), transparent 38%),
    radial-gradient(circle at 5% 98%, rgba(59, 130, 246, 0.12), transparent 34%),
    linear-gradient(135deg, #1A2B1E 0%, #142418 58%, #1A2B1E 100%);
  font-family: Arial, sans-serif;
}

.slide-cta {
  background:
    radial-gradient(circle at 82% 10%, rgba(255, 255, 255, 0.18), transparent 34%),
    linear-gradient(135deg, #FF3B1D 0%, #f62f13 100%);
  color: #1A2B1E;
}

.blob {
  position: absolute;
  z-index: 0;
  border-radius: 999px;
  filter: blur(70px);
  opacity: 0.16;
}

.blob-orange {
  top: -90px;
  right: -70px;
  width: 240px;
  height: 240px;
  background: var(--accent);
}

.blob-blue {
  left: -120px;
  bottom: -130px;
  width: 300px;
  height: 300px;
  background: #3B82F6;
}

.slide-header,
.slide-content,
.slide-footer {
  position: relative;
  z-index: 2;
}

.slide-header {
  height: 78px;
}

.header-tag {
  display: flex;
  align-items: center;
  gap: 11px;
  font-family: "JetBrains Mono", monospace;
  font-size: 14px;
  line-height: 1;
  color: var(--accent);
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.tag-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 1px solid currentColor;
  font-size: 12px;
  letter-spacing: 0;
}

.header-line {
  width: 100%;
  height: 1px;
  margin-top: 22px;
  background: linear-gradient(90deg, rgba(255,255,255,0.24), transparent);
}

.slide-content {
  height: 417px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.display,
.section-title span:first-child,
.step-row h2,
.cta-box strong {
  font-family: "Bebas Neue", Impact, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.accent {
  color: var(--accent);
}

.editorial {
  display: block;
  margin-top: 18px;
  color: var(--primary);
  font-family: "Playfair Display", Georgia, serif;
  font-style: italic;
  font-weight: 600;
  line-height: 1.06;
}

.hook-layout {
  align-items: center;
  text-align: center;
}

.hook-title {
  margin: 0;
}

.hook-title .display {
  display: block;
  font-size: 70px;
  line-height: 0.9;
}

.hook-title .editorial {
  font-size: 37px;
}

.section-title {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0 0 22px;
  font-size: 42px;
  line-height: 0.96;
}

.section-title.compact {
  margin-bottom: 26px;
}

.section-title .editorial.inline {
  margin-top: 4px;
  font-size: 36px;
  text-transform: none;
}

.body-copy {
  max-width: 360px;
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 22px;
  line-height: 1.2;
  font-family: "Playfair Display", Georgia, serif;
  font-style: italic;
}

.ui-box {
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(8px);
}

.stack-box {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 18px;
  border-radius: 14px;
}

.mini-card {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 8px;
  font-family: "JetBrains Mono", monospace;
  font-size: 13px;
  font-weight: 700;
}

.mini-card.bad {
  color: #FEE2E2;
  background: rgba(255, 59, 29, 0.12);
  border: 1px solid rgba(255, 59, 29, 0.44);
}

.mini-card.good {
  color: #ECFDF5;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.44);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 37px;
}

.step-row {
  display: grid;
  grid-template-columns: 66px 1fr;
  gap: 22px;
  align-items: start;
}

.step-number {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-family: "Bebas Neue", Impact, sans-serif;
  font-size: 38px;
  line-height: 1;
}

.step-row h2 {
  margin: 2px 0 12px;
  font-size: 30px;
  line-height: 0.98;
}

.step-row p {
  margin: 0;
  color: rgba(255,255,255,0.68);
  font-size: 19px;
  line-height: 1.42;
}

.payoff-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: 14px;
}

.payoff-item {
  display: grid;
  grid-template-columns: 38px 1fr;
  align-items: center;
  gap: 13px;
  min-height: 52px;
  padding: 10px 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
}

.payoff-item span {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #fff;
  background: var(--accent);
  font-family: "JetBrains Mono", monospace;
}

.payoff-item strong {
  font-family: "Bebas Neue", Impact, sans-serif;
  font-size: 24px;
  letter-spacing: 0.02em;
}

.cta-layout {
  align-items: center;
  text-align: center;
}

.cta-icon {
  display: flex;
  width: 58px;
  height: 58px;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border: 1px solid rgba(26,43,30,0.35);
  border-radius: 999px;
  font-size: 30px;
}

.cta-title {
  color: #1A2B1E;
  align-items: center;
  font-size: 40px;
}

.slide-cta .accent {
  color: #fff;
}

.cta-box {
  width: 330px;
  margin-top: 14px;
  padding: 18px;
  border-color: rgba(26,43,30,0.30);
  background: #1A2B1E;
  color: #fff;
}

.cta-box .small-label {
  display: block;
  margin-bottom: 5px;
  font-family: "JetBrains Mono", monospace;
  color: rgba(255,255,255,0.74);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
}

.cta-box strong {
  display: block;
  color: var(--accent);
  font-size: 52px;
  line-height: 0.95;
}

.cta-box p {
  margin: 10px auto 0;
  max-width: 260px;
  color: rgba(255,255,255,0.78);
  font-size: 17px;
  line-height: 1.25;
}

.slide-footer {
  height: 40px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 22px;
  align-items: end;
  font-family: "Playfair Display", Georgia, serif;
  font-style: italic;
  font-size: 17px;
}

.footer-username,
.save-for-later,
.swipe-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}

.footer-icon,
.swipe-indicator,
.bookmark {
  color: var(--accent);
}

.swipe-indicator {
  font-family: "JetBrains Mono", monospace;
  font-style: normal;
  font-size: 14px;
  font-weight: 700;
}

.slide-cta .header-tag,
.slide-cta .footer-icon,
.slide-cta .swipe-indicator,
.slide-cta .bookmark {
  color: #1A2B1E;
}

.slide-cta .header-line,
.slide-cta .slide-footer {
  border-color: rgba(26,43,30,0.22);
}

.slide-cta .header-line {
  background: linear-gradient(90deg, rgba(26,43,30,0.32), transparent);
}
`;

const slug = readArg("--slug");
const inputPath = readArg("--input");
const outArg = readArg("--out");
const chromeArg = readArg("--chrome");
const htmlOnly = hasFlag("--html-only");
const root = process.cwd();

if (!slug && !inputPath) {
  console.error("Usage: node scripts/build-social-carousel.mjs --slug <slug> [--html-only]");
  process.exit(1);
}

const resolvedInput = inputPath
  ? path.resolve(inputPath)
  : path.join(root, "content", "carousel-queue", "pending", slug, "carousel.json");

const carousel = JSON.parse(await fs.readFile(resolvedInput, "utf8"));
carousel.slug = carousel.slug || slug;
validateSlug(carousel.slug);

const slides = (Array.isArray(carousel.slides) ? carousel.slides : []).map((slide, index, list) =>
  normalizeSlide(slide, index, list.length)
);
if (slides.length < 2 || slides.length > 10) {
  throw new Error("carousel.json must define between 2 and 10 slides.");
}

const outDir = outArg ? path.resolve(outArg) : path.join(root, "carousels", carousel.slug);
await fs.mkdir(outDir, { recursive: true });

const manifest = {
  version: 1,
  slug: carousel.slug,
  title: carousel.title || carousel.slug,
  caption: carousel.caption || "",
  handle: carousel.handle || "@crecimientosc",
  theme: carousel.theme || "editorial-moody-green",
  publish_at: carousel.publish_at || "",
  default_interval_minutes: carousel.default_interval_minutes || 240,
  source: path.relative(root, resolvedInput).replace(/\\/g, "/"),
  generated_at: new Date().toISOString(),
  slides: []
};

for (let index = 0; index < slides.length; index += 1) {
  const slide = slides[index];
  const baseName = `slide-${String(index + 1).padStart(2, "0")}`;
  const htmlPath = path.join(outDir, `${baseName}.html`);
  const pngPath = path.join(outDir, `${baseName}.png`);
  await fs.writeFile(htmlPath, renderHtml({ carousel, slide, index }));
  manifest.slides.push({
    index: index + 1,
    type: slide.type,
    html: path.relative(root, htmlPath).replace(/\\/g, "/"),
    png: path.relative(root, pngPath).replace(/\\/g, "/"),
    fileName: `${baseName}.png`,
    r2Key: `carruseles instagram/${carousel.slug}/${baseName}.png`
  });
}

if (!htmlOnly) {
  const chromePath = await findChrome(chromeArg);
  if (!chromePath) {
    throw new Error("Chrome not found. Pass --chrome <path> or rerun with --html-only.");
  }
  for (const slide of manifest.slides) {
    await screenshot({
      chromePath,
      htmlPath: path.join(root, slide.html),
      pngPath: path.join(root, slide.png)
    });
  }
}

await fs.writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await updateQueue({ root, carousel, outDir });

console.log(JSON.stringify({
  event: "carousel_generated",
  slug: carousel.slug,
  slides: slides.length,
  outDir: path.relative(root, outDir).replace(/\\/g, "/"),
  htmlOnly
}, null, 2));
