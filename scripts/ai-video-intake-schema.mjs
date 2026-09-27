export const DEFAULT_PERSONA = "assets/character/personas/social-retention-teacher.md";
export const DEFAULT_TEMPLATE = "data-lab";
export const DEFAULT_DURATION = 50;

export const ALLOWED_STAGE_TYPES = new Set([
  "serp",
  "dashboard",
  "keyword-map",
  "funnel",
  "comparison",
  "checklist",
  "timeline",
  "cta"
]);

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function softenGuaranteedClaims(value) {
  return cleanText(value)
    .replace(/\bgarantizad[oa]s?\b/gi, "probables")
    .replace(/\bgarantiza\b/gi, "ayuda a mejorar")
    .replace(/\basegura\b/gi, "puede mejorar")
    .replace(/\bresultados seguros\b/gi, "resultados mas controlados");
}

export function slugifyTitle(title) {
  const base = String(title || "video-data-lab")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "video-data-lab";
}

export function normalizePlatforms(value) {
  const raw = Array.isArray(value) ? value : String(value || "instagram").split(/[,\s]+/);
  const mapped = raw
    .map((entry) => String(entry).toLowerCase().trim())
    .filter(Boolean)
    .map((entry) => {
      if (["ig", "instagram", "instagram-reel"].includes(entry)) return "instagram";
      if (["fb", "facebook", "facebook-reel"].includes(entry)) return "facebook";
      throw new Error(`Unknown platform: ${entry}`);
    });
  return [...new Set(mapped.length ? mapped : ["instagram"])];
}

function defaultStage(index) {
  if (index === 0) {
    return {
      type: "comparison",
      left: { label: "ANTES", value: "Ruido" },
      right: { label: "DESPUES", value: "Sistema" }
    };
  }
  return { type: "checklist", items: ["Idea", "Prueba", "Accion"], checked: 2 };
}

function normalizeScene(scene, index) {
  const label = cleanText(scene.label || `SCENE ${index + 1}`);
  return {
    id: cleanText(scene.id || `scene-${String(index + 1).padStart(2, "0")}`),
    label,
    animation: "talking",
    screen_text: cleanText(scene.screen_text || scene.title || label).slice(0, 42),
    visual_note: cleanText(scene.visual_note || ""),
    text: softenGuaranteedClaims(scene.text || ""),
    stage: scene.stage || defaultStage(index)
  };
}

export function normalizeAiVideoIntake(raw = {}) {
  const title = cleanText(raw.title || raw.headline || "Video Data Lab");
  const summary = softenGuaranteedClaims(raw.summary || raw.brief || "");
  const cta = cleanText(raw.cta);
  const caption = softenGuaranteedClaims(
    raw.caption || raw.post_caption || `${summary} ${cta}`.trim()
  ).slice(0, 2200);
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];

  return {
    slug: slugifyTitle(raw.slug || title),
    status: "pending",
    title,
    summary,
    template: DEFAULT_TEMPLATE,
    persona: DEFAULT_PERSONA,
    tone: "experto cercano, directo e incisivo; ironia ligera opcional",
    duration_target_s: Number(raw.duration_target_s || DEFAULT_DURATION),
    cta,
    caption,
    platforms: normalizePlatforms(raw.platforms),
    scenes: scenes.map(normalizeScene)
  };
}

export function validateNormalizedIntake(intake) {
  if (!intake.summary) throw new Error("summary is required.");
  if (!intake.title) throw new Error("title is required.");
  if (!/^[a-z0-9._-]{1,80}$/.test(intake.slug)) throw new Error("invalid slug.");
  if (intake.template !== DEFAULT_TEMPLATE) throw new Error("V1 only supports data-lab.");
  if (intake.persona !== DEFAULT_PERSONA) throw new Error("data-lab persona mismatch.");
  if (!Number.isFinite(intake.duration_target_s) || intake.duration_target_s < 30 || intake.duration_target_s > 90) {
    throw new Error("duration_target_s must be between 30 and 90.");
  }
  if (!Array.isArray(intake.platforms) || intake.platforms.length < 1) throw new Error("platforms must not be empty.");
  if (!Array.isArray(intake.scenes) || intake.scenes.length < 4 || intake.scenes.length > 7) {
    throw new Error("scenes must contain 4-7 items.");
  }
  for (const scene of intake.scenes) {
    if (!scene.id) throw new Error("scene missing id.");
    if (!scene.screen_text) throw new Error(`scene ${scene.id} missing screen_text.`);
    if (!scene.text) throw new Error(`scene ${scene.id} missing text.`);
    if (!scene.stage?.type || !ALLOWED_STAGE_TYPES.has(scene.stage.type)) {
      throw new Error(`scene ${scene.id} has invalid stage type.`);
    }
  }
}
