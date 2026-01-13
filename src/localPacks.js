const LEVEL_SIZE = 10;
const RECENT_WINDOW_SIZE = 30;

const svgDataUrl = (label, color = "#ef4444") => {
  const safeLabel = String(label || "").slice(0, 10);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64" viewBox="0 0 96 64">
    <rect width="96" height="64" rx="8" fill="${color}" />
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" fill="#fff">${safeLabel}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const buildFlag = (code, name, label, color) => {
  const normalizedCode = String(code || "").toLowerCase();
  const [countryCode, subdivisionCode] = normalizedCode.split("_");
  const imagePath = `/local-flags/${countryCode}/${subdivisionCode}.svg`;
  return {
    code: normalizedCode,
    name,
    nameKey: `localFlags.subdivisions.${normalizedCode}.name`,
    image: imagePath,
    img: imagePath,
    fallbackImg: svgDataUrl(label, color),
  };
};

const buildPackFlags = (items, color) =>
  items.map(([code, name, label]) => buildFlag(code, name, label, color));

const CH_FLAGS = buildPackFlags(
  [
    ["ch_ag", "Aargau", "AG"],
    ["ch_ai", "Appenzell Innerrhoden", "AI"],
    ["ch_ar", "Appenzell Ausserrhoden", "AR"],
    ["ch_be", "Bern", "BE"],
    ["ch_bl", "Basel-Landschaft", "BL"],
    ["ch_bs", "Basel-Stadt", "BS"],
    ["ch_fr", "Fribourg", "FR"],
    ["ch_ge", "Geneva", "GE"],
    ["ch_gl", "Glarus", "GL"],
    ["ch_gr", "Graubünden", "GR"],
    ["ch_ju", "Jura", "JU"],
    ["ch_lu", "Lucerne", "LU"],
    ["ch_ne", "Neuchâtel", "NE"],
    ["ch_nw", "Nidwalden", "NW"],
    ["ch_ow", "Obwalden", "OW"],
    ["ch_sg", "St. Gallen", "SG"],
    ["ch_sh", "Schaffhausen", "SH"],
    ["ch_so", "Solothurn", "SO"],
    ["ch_sz", "Schwyz", "SZ"],
    ["ch_tg", "Thurgau", "TG"],
    ["ch_ti", "Ticino", "TI"],
    ["ch_ur", "Uri", "UR"],
    ["ch_vd", "Vaud", "VD"],
    ["ch_vs", "Valais", "VS"],
    ["ch_zg", "Zug", "ZG"],
    ["ch_zh", "Zürich", "ZH"],
  ],
  "#dc2626"
);

const ES_FLAGS = buildPackFlags(
  [
    ["es_an", "Andalusia", "AN"],
    ["es_ar", "Aragon", "AR"],
    ["es_as", "Asturias", "AS"],
    ["es_ib", "Balearic Islands", "IB"],
    ["es_pv", "Basque Country", "PV"],
    ["es_cn", "Canary Islands", "CN"],
    ["es_cb", "Cantabria", "CB"],
    ["es_cl", "Castile and León", "CL"],
    ["es_cm", "Castile-La Mancha", "CM"],
    ["es_ct", "Catalonia", "CT"],
    ["es_ex", "Extremadura", "EX"],
    ["es_ga", "Galicia", "GA"],
    ["es_ri", "La Rioja", "RI"],
    ["es_md", "Madrid", "MD"],
    ["es_mc", "Murcia", "MC"],
    ["es_nc", "Navarre", "NC"],
    ["es_vc", "Valencia", "VC"],
  ],
  "#f97316"
);

const DE_FLAGS = buildPackFlags(
  [
    ["de_bw", "Baden-Württemberg", "BW"],
    ["de_by", "Bavaria", "BY"],
    ["de_be", "Berlin", "BE"],
    ["de_bb", "Brandenburg", "BB"],
    ["de_hb", "Bremen", "HB"],
    ["de_hh", "Hamburg", "HH"],
    ["de_he", "Hesse", "HE"],
    ["de_ni", "Lower Saxony", "NI"],
    ["de_mv", "Mecklenburg-Vorpommern", "MV"],
    ["de_nw", "North Rhine-Westphalia", "NW"],
    ["de_rp", "Rhineland-Palatinate", "RP"],
    ["de_sl", "Saarland", "SL"],
    ["de_sn", "Saxony", "SN"],
    ["de_st", "Saxony-Anhalt", "ST"],
    ["de_sh", "Schleswig-Holstein", "SH"],
    ["de_th", "Thuringia", "TH"],
  ],
  "#f59e0b"
);

const US_FLAGS = buildPackFlags(
  [
    ["us_al", "Alabama", "AL"],
    ["us_ak", "Alaska", "AK"],
    ["us_az", "Arizona", "AZ"],
    ["us_ar", "Arkansas", "AR"],
    ["us_ca", "California", "CA"],
    ["us_co", "Colorado", "CO"],
    ["us_ct", "Connecticut", "CT"],
    ["us_de", "Delaware", "DE"],
    ["us_fl", "Florida", "FL"],
    ["us_ga", "Georgia", "GA"],
    ["us_hi", "Hawaii", "HI"],
    ["us_id", "Idaho", "ID"],
    ["us_il", "Illinois", "IL"],
    ["us_in", "Indiana", "IN"],
    ["us_ia", "Iowa", "IA"],
    ["us_ks", "Kansas", "KS"],
    ["us_ky", "Kentucky", "KY"],
    ["us_la", "Louisiana", "LA"],
    ["us_me", "Maine", "ME"],
    ["us_md", "Maryland", "MD"],
    ["us_ma", "Massachusetts", "MA"],
    ["us_mi", "Michigan", "MI"],
    ["us_mn", "Minnesota", "MN"],
    ["us_ms", "Mississippi", "MS"],
    ["us_mo", "Missouri", "MO"],
    ["us_mt", "Montana", "MT"],
    ["us_ne", "Nebraska", "NE"],
    ["us_nv", "Nevada", "NV"],
    ["us_nh", "New Hampshire", "NH"],
    ["us_nj", "New Jersey", "NJ"],
    ["us_nm", "New Mexico", "NM"],
    ["us_ny", "New York", "NY"],
    ["us_nc", "North Carolina", "NC"],
    ["us_nd", "North Dakota", "ND"],
    ["us_oh", "Ohio", "OH"],
    ["us_ok", "Oklahoma", "OK"],
    ["us_or", "Oregon", "OR"],
    ["us_pa", "Pennsylvania", "PA"],
    ["us_ri", "Rhode Island", "RI"],
    ["us_sc", "South Carolina", "SC"],
    ["us_sd", "South Dakota", "SD"],
    ["us_tn", "Tennessee", "TN"],
    ["us_tx", "Texas", "TX"],
    ["us_ut", "Utah", "UT"],
    ["us_vt", "Vermont", "VT"],
    ["us_va", "Virginia", "VA"],
    ["us_wa", "Washington", "WA"],
    ["us_wv", "West Virginia", "WV"],
    ["us_wi", "Wisconsin", "WI"],
    ["us_wy", "Wyoming", "WY"],
  ],
  "#3b82f6"
);

const GB_FLAGS = buildPackFlags(
  [
    ["gb_eng", "England", "ENG"],
    ["gb_sct", "Scotland", "SCT"],
    ["gb_wls", "Wales", "WLS"],
    ["gb_nir", "Northern Ireland", "NIR"],
    ["gb_iom", "Isle of Man", "IOM"],
    ["gb_jsy", "Jersey", "JSY"],
    ["gb_ggy", "Guernsey", "GGY"],
    ["gb_gib", "Gibraltar", "GIB"],
    ["gb_bmu", "Bermuda", "BMU"],
    ["gb_cym", "Cayman Islands", "CYM"],
  ],
  "#6366f1"
);

export const LOCAL_PACKS = [
  {
    packId: "ALL",
    countryCode: null,
    title: "All Local Flags",
    type: "all",
    unlockTier: 1,
    iconSrc: svgDataUrl("ALL", "#b91c1c"),
    flags: [
      ...CH_FLAGS,
      ...ES_FLAGS,
      ...DE_FLAGS,
      ...US_FLAGS,
      ...GB_FLAGS,
    ],
  },
  {
    packId: "ch",
    countryCode: "CH",
    title: "Switzerland",
    type: "country",
    unlockTier: 1,
    flags: CH_FLAGS,
  },
  {
    packId: "es",
    countryCode: "ES",
    title: "Spain",
    type: "country",
    unlockTier: 1,
    flags: ES_FLAGS,
  },
  {
    packId: "de",
    countryCode: "DE",
    title: "Germany",
    type: "country",
    unlockTier: 1,
    flags: DE_FLAGS,
  },
  {
    packId: "us",
    countryCode: "US",
    title: "United States",
    type: "country",
    unlockTier: 1,
    flags: US_FLAGS,
  },
  {
    packId: "gb",
    countryCode: "GB",
    title: "United Kingdom",
    type: "country",
    unlockTier: 1,
    flags: GB_FLAGS,
  },
];

export const LOCAL_LEVEL_SIZE = LEVEL_SIZE;

const pickLeastUsed = (candidates, usageCounts) => {
  let minCount = Infinity;
  for (const flag of candidates) {
    const count = usageCounts.get(flag.code) || 0;
    minCount = Math.min(minCount, count);
  }
  return [...candidates]
    .filter((flag) => (usageCounts.get(flag.code) || 0) === minCount)
    .sort((a, b) => a.code.localeCompare(b.code))[0];
};

export function getLocalPackLevels(flags, perLevel = LEVEL_SIZE) {
  if (!flags || flags.length === 0) return [];
  const baseBlocks = Math.ceil(flags.length / perLevel);
  const levelsCount = Math.max(10, baseBlocks * 6);

  const usageCounts = new Map(flags.map((flag) => [flag.code, 0]));
  const recentQueue = [];
  const levels = [];

  for (let levelNumber = 1; levelNumber <= levelsCount; levelNumber += 1) {
    const levelUsed = new Set();
    const questionIds = [];

    while (questionIds.length < perLevel) {
      const recentSet = new Set(recentQueue);
      const candidates = flags.filter((flag) => !levelUsed.has(flag.code));
      const freshCandidates = candidates.filter(
        (flag) => !recentSet.has(flag.code)
      );
      const pool = freshCandidates.length ? freshCandidates : candidates;

      if (!pool.length) {
        break;
      }

      const chosen = pickLeastUsed(pool, usageCounts);
      if (!chosen) break;

      questionIds.push(chosen.code);
      levelUsed.add(chosen.code);
      usageCounts.set(chosen.code, (usageCounts.get(chosen.code) || 0) + 1);
      recentQueue.push(chosen.code);
      if (recentQueue.length > RECENT_WINDOW_SIZE) {
        recentQueue.shift();
      }
    }

    levels.push({ levelNumber, questionIds });
  }

  return levels;
}

export function buildLocalPackLevels(pack) {
  const flags = pack?.flags || [];
  const levelDefs = getLocalPackLevels(flags, LEVEL_SIZE);
  const byCode = new Map(flags.map((flag) => [flag.code, flag]));

  return levelDefs.map((level) => ({
    id: level.levelNumber,
    label: String(level.levelNumber),
    questionIds: level.questionIds,
    pool: level.questionIds.map((code) => byCode.get(code)).filter(Boolean),
    questionCount: LEVEL_SIZE,
  }));
}

export function getLocalPackProgress(pack, progress) {
  const levels = buildLocalPackLevels(pack);
  const levelsMap =
    progress?.localFlags?.packs?.[pack?.packId]?.starsByLevel || {};
  const totalLevels = levels.length;
  const completedLevels = levels.reduce((sum, level) => {
    const stars = Number(levelsMap[level.id] || 0);
    return sum + (stars > 0 ? 1 : 0);
  }, 0);
  const starsEarned = levels.reduce(
    (sum, level) => sum + Number(levelsMap[level.id] || 0),
    0
  );
  const maxStars = totalLevels * 3;
  return { completedLevels, totalLevels, starsEarned, maxStars };
}

export function isLocalPackUnlocked(pack) {
  return Number(pack?.unlockTier || 1) <= 1;
}

export function getLocalLevelStars(progress, packId, levelId) {
  const levelsMap = progress?.localFlags?.packs?.[packId]?.starsByLevel || {};
  return Number(levelsMap[levelId] || 0);
}

export function buildPackIcon(pack, fallbackFlagSrc) {
  if (pack?.iconSrc) return pack.iconSrc;
  if (pack?.countryCode && typeof fallbackFlagSrc === "function") {
    return fallbackFlagSrc(pack.countryCode, 64);
  }
  return svgDataUrl("FLAG", "#334155");
}
