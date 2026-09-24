import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_CSV = "content/carousel-queue/carousel-queue.csv";

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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        value += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((item) => item.some((cell) => String(cell).trim()));
}

function objectFromRow(headers, row) {
  const out = {};
  headers.forEach((header, index) => {
    out[header] = row[index] ?? "";
  });
  return out;
}

function splitMaybe(value) {
  return String(value || "")
    .split(/\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowToCarousel(row) {
  const slug = String(row.slug || "").trim();
  validateSlug(slug);
  return {
    slug,
    title: row.title || slug,
    status: row.status || "pending",
    handle: row.handle || "@crecimientosc",
    publish_at: row.publish_at || "",
    default_interval_minutes: Number(row.default_interval_minutes || 240),
    caption: row.caption || "",
    theme: "editorial-moody-green",
    slides: [
      {
        type: "hook",
        tag: row.slide_1_tag || "CARRUSEL",
        icon: "layout",
        headline: [row.slide_1_line_1, row.slide_1_line_2].filter(Boolean),
        serif: row.slide_1_serif || ""
      },
      {
        type: "problem",
        tag: "EL PROBLEMA",
        icon: "warning",
        title: row.slide_2_title || "EL PROBLEMA:",
        accent: row.slide_2_accent || "",
        body: row.slide_2_body || "",
        cards: splitMaybe(row.slide_2_cards).map((label) => ({ label, tone: "bad" }))
      },
      {
        type: "steps",
        tag: "ACCION: PASOS 1 & 2",
        icon: "tool",
        title: row.slide_3_title || "EL SISTEMA:",
        serif: row.slide_3_serif || "",
        steps: [
          { number: "1", title: row.slide_3_step_1_title || "", body: row.slide_3_step_1_body || "" },
          { number: "2", title: row.slide_3_step_2_title || "", body: row.slide_3_step_2_body || "" }
        ].filter((step) => step.title || step.body)
      },
      {
        type: "steps",
        tag: "ACCION: PASOS 3 & 4",
        icon: "arrows",
        title: row.slide_4_title || "LA EJECUCION:",
        serif: row.slide_4_serif || "",
        steps: [
          { number: "3", title: row.slide_4_step_1_title || "", body: row.slide_4_step_1_body || "" },
          { number: "4", title: row.slide_4_step_2_title || "", body: row.slide_4_step_2_body || "" }
        ].filter((step) => step.title || step.body)
      },
      {
        type: "payoff",
        tag: "EL RESULTADO",
        icon: "chart",
        title: row.slide_5_title || "EL RESULTADO:",
        accent: row.slide_5_accent || "",
        items: [row.slide_5_bullet_1, row.slide_5_bullet_2, row.slide_5_bullet_3].filter(Boolean)
      },
      {
        type: "cta",
        tag: "CTA",
        icon: "bookmark",
        title: row.slide_6_title || "GUARDA ESTE POST",
        accent: row.slide_6_accent || "",
        keyword: row.slide_6_keyword || "GUIA",
        body: row.slide_6_body || ""
      }
    ]
  };
}

async function updateQueue({ root, carousel }) {
  const queuePath = path.join(root, "content", "carousel-queue", "queue.json");
  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  const index = queue.items.findIndex((item) => item.slug === carousel.slug);
  const item = {
    slug: carousel.slug,
    title: carousel.title,
    status: "pending",
    folder: `pending/${carousel.slug}`,
    created_at: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    template: carousel.theme,
    publish_at: carousel.publish_at,
    default_interval_minutes: carousel.default_interval_minutes,
    outputs: {
      content_folder: `content/carousel-queue/pending/${carousel.slug}`
    },
    notes: "Imported from carousel CSV; pending visual build."
  };
  if (index >= 0) queue.items[index] = { ...queue.items[index], ...item, created_at: queue.items[index].created_at || item.created_at };
  else queue.items.push(item);
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
}

const root = process.cwd();
const csvPath = path.resolve(readArg("--csv", DEFAULT_CSV));
const requestedSlug = readArg("--slug");
const dryRun = hasFlag("--dry-run");
const text = await fs.readFile(csvPath, "utf8");
const rows = parseCsv(text);
if (rows.length < 2) throw new Error("CSV must include a header row and at least one data row.");

const headers = rows[0].map((header) => header.trim());
const records = rows.slice(1).map((row) => objectFromRow(headers, row));
const record = requestedSlug
  ? records.find((item) => String(item.slug || "").trim() === requestedSlug)
  : records.find((item) => String(item.status || "pending").trim() === "pending") || records[0];

if (!record) throw new Error(`No matching row found for slug: ${requestedSlug}`);

const carousel = rowToCarousel(record);
if (dryRun) {
  console.log(JSON.stringify({
    event: "dry_run",
    slug: carousel.slug,
    carousel
  }, null, 2));
  process.exit(0);
}

const outDir = path.join(root, "content", "carousel-queue", "pending", carousel.slug);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "carousel.json"), `${JSON.stringify(carousel, null, 2)}\n`);
await updateQueue({ root, carousel });

console.log(JSON.stringify({
  event: "carousel_row_imported",
  slug: carousel.slug,
  output: path.relative(root, path.join(outDir, "carousel.json")).replace(/\\/g, "/")
}, null, 2));
