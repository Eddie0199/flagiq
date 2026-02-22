const DAILY_PREFIX = "FLAGIQ_DAILY_";

export function getUtcDailyKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function hashStringToInt(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDailySeed(dailyKey) {
  return hashStringToInt(`${DAILY_PREFIX}${dailyKey}`);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let v = Math.imul(t ^ (t >>> 15), t | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seed) {
  const arr = [...items];
  const rand = mulberry32(seed || 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getDailyQuestionSet(flags, dailyKey, count = 10) {
  const cleanFlags = (flags || []).filter((f) => f?.name && f?.code);
  const seed = getDailySeed(dailyKey);
  const selected = seededShuffle(cleanFlags, seed).slice(0, count);

  const questions = selected.map((correct, index) => {
    const wrongPool = cleanFlags.filter((f) => f.code !== correct.code);
    const wrongs = seededShuffle(wrongPool, seed + index * 101).slice(0, 3);
    const options = seededShuffle(
      [correct.name, ...wrongs.map((w) => w.name)],
      seed + index * 997
    );
    return { id: `${dailyKey}-${index + 1}-${correct.code}`, correct, options };
  });

  return { dailyKey, seed, questions };
}

export function getUtcResetMs(now = new Date()) {
  const nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  );
  return Math.max(0, nextUtcMidnight - now.getTime());
}
