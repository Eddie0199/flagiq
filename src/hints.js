export const HINT_IDS = {
  REMOVE_TWO: "HINT_REMOVE_TWO",
  AUTO_PASS: "HINT_AUTO_PASS",
  PAUSE_TIMER: "HINT_PAUSE_TIMER",
};

export const HINT_INVENTORY_KEYS = {
  [HINT_IDS.REMOVE_TWO]: "remove2",
  [HINT_IDS.AUTO_PASS]: "autoPass",
  [HINT_IDS.PAUSE_TIMER]: "pause",
};

export const HINT_TRANSLATION_KEYS = {
  [HINT_IDS.REMOVE_TWO]: {
    label: "hints.removeTwo.label",
    description: "hints.removeTwo.description",
  },
  [HINT_IDS.AUTO_PASS]: {
    label: "hints.autoPass.label",
    description: "hints.autoPass.description",
  },
  [HINT_IDS.PAUSE_TIMER]: {
    label: "hints.pauseTimer.label",
    description: "hints.pauseTimer.description",
  },
};

const WARNED_HINT_KEYS = new Set();

export function getHintTranslation(t, lang, hintId, field) {
  const key = HINT_TRANSLATION_KEYS[hintId]?.[field];
  if (!key) {
    if (process.env.NODE_ENV !== "production" && !WARNED_HINT_KEYS.has(`${hintId}:${field}`)) {
      WARNED_HINT_KEYS.add(`${hintId}:${field}`);
      console.warn(`[i18n] Missing canonical hint field mapping for ${hintId}.${field}`);
    }
    return "";
  }

  const value = t ? t(lang, key) : key;
  if (process.env.NODE_ENV !== "production" && value === key && !WARNED_HINT_KEYS.has(key)) {
    WARNED_HINT_KEYS.add(key);
    console.warn(`[i18n] Missing translation for hint key: ${key} (${lang || "unknown"})`);
  }
  return value;
}
