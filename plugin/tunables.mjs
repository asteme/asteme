// What the user may change from the panel, with the bounds each value must
// stay within. The host's Config sets the starting values; a saved setting
// wins over it. The judge's key is not here: it is stored apart and is never
// sent back to the panel or written to an export.
export const TUNABLES = {
  enabled: { type: "boolean" },
  language: { type: "string", oneOf: ["", "en", "ja", "zh", "de", "es", "fr", "pt", "ru"] },   // of the panel and the diary; empty follows the host
  learningProvider: { type: "string", max: 200 },
  learningModel: { type: "string", max: 200 },
  // Waiting for the model
  prepareTimeoutMs: { type: "number", min: 3000, max: 120000 },   // while the reply waits
  timeoutMs: { type: "number", min: 10000, max: 900000 },         // in the background
  // Background work
  outcomeDelayMs: { type: "number", min: 0, max: 3600000 },
  outcomeIntervalMs: { type: "number", min: 10000, max: 3600000 },
  sleepIntervalMs: { type: "number", min: 60000, max: 86400000 },
  // One round of background work: how many pieces of work may ask the model,
  // and the pause before the next round. Kept low: this runs unattended.
  roundCalls: { type: "number", min: 1, max: 5 },
  roundEveryMs: { type: "number", min: 10000, max: 3600000 },
  // Copies
  backupEveryHours: { type: "number", min: 0, max: 720 },
  backupKeep: { type: "number", min: 1, max: 365 },
  exportKeep: { type: "number", min: 1, max: 50 },
  exportDirectory: { type: "string", max: 1000 },
  // The quick judge
  judgeUrl: { type: "string", max: 500, url: true },
  judgeModel: { type: "string", max: 200 },
  judgeMode: { type: "string", oneOf: ["shadow", "judge", "model"] },
};
export const DEFAULTS = {
  enabled: true, language: "", prepareTimeoutMs: 30000, timeoutMs: 240000, outcomeDelayMs: 60000, outcomeIntervalMs: 60000, sleepIntervalMs: 600000, roundCalls: 1, roundEveryMs: 30000,
  backupEveryHours: 24, backupKeep: 7, exportKeep: 3, exportDirectory: "", judgeUrl: "", judgeModel: "", judgeMode: "shadow",
};
/** Throws on anything that is not a known setting within its bounds. Returns the cleaned patch. */
export function checkSettings(patch) {
  const out = {};
  for (const [key, raw] of Object.entries(patch ?? {})) {
    const rule = TUNABLES[key];
    if (!rule) throw new Error("Invalid setting");
    let value = raw;
    if (rule.type === "string" && typeof value === "string") value = value.trim();
    if (typeof value !== rule.type) throw new Error("Invalid setting");
    if (rule.type === "number" && (!Number.isFinite(value) || value < rule.min || value > rule.max)) throw new Error(`${key} must be between ${rule.min} and ${rule.max}`);
    if (rule.type === "number") value = Math.round(value);
    if (rule.type === "string" && value.length > rule.max) throw new Error("Invalid setting");
    if (rule.oneOf && !rule.oneOf.includes(value)) throw new Error("Invalid setting");
    if (rule.url && value && !/^https:\/\/[^\s]+$/.test(value)) throw new Error("The judge address must start with https://");
    out[key] = value;
  }
  return out;
}
