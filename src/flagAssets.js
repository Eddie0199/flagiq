const FLAG_FALLBACK_MAP = {
  england: "gb-eng",
  scotland: "gb-sct",
  wles: "gb-wls",
  wales: "gb-wls",
  "northern ireland": "gb-nir",
  "isle of man": "im",
  greenland: "gl",
  "puerto rico": "pr",
  "hong kong": "hk",
  macau: "mo",
  "faroe islands": "fo",
  bermuda: "bm",
  curaçao: "cw",
  aruba: "aw",
  "cayman islands": "ky",
  guernsey: "gg",
  jersey: "je",
  gibraltar: "gi",
  "french polynesia": "pf",
  "new caledonia": "nc",
  // Ascension Island uses the CLDR-style code "AC" in our data set.
  // FlagCDN serves it as "ac" (not "sh-ac").
  "ascension island": "ac",
};

const CODE_FALLBACK_MAP = {
  nir: "gb-nir",
  // Keep explicit to avoid regressions if upstream data format changes.
  ac: "ac",
};

export function resolveFlagImageSrc(flagOrCode, w = 256) {
  if (flagOrCode && typeof flagOrCode === "object") {
    if (flagOrCode.img) return flagOrCode.img;

    let code = (flagOrCode.code || "").toLowerCase().replace(/_/g, "-");
    const name = (flagOrCode.name || "").toLowerCase();

    if (CODE_FALLBACK_MAP[code]) {
      code = CODE_FALLBACK_MAP[code];
    } else if (FLAG_FALLBACK_MAP[name]) {
      code = FLAG_FALLBACK_MAP[name];
    }

    return `https://flagcdn.com/w${w}/${code}.png`;
  }

  const raw = String(flagOrCode || "").toLowerCase().replace(/_/g, "-");
  const mapped = FLAG_FALLBACK_MAP[raw] || CODE_FALLBACK_MAP[raw] || raw;
  return `https://flagcdn.com/w${w}/${mapped}.png`;
}

export function createFlagFallbackPlaceholder(flagKey) {
  const safeKey = encodeURIComponent(String(flagKey || "unknown"));
  return `data:image/svg+xml;utf8,${
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 200'>` +
    `<rect width='320' height='200' fill='%23f1f5f9' />` +
    `<rect x='8' y='8' width='304' height='184' rx='12' ry='12' fill='none' stroke='%23cbd5e1' stroke-width='2'/>` +
    `<text x='160' y='92' text-anchor='middle' font-family='Arial' font-size='18' font-weight='700' fill='%23334155'>Flag unavailable</text>` +
    `<text x='160' y='120' text-anchor='middle' font-family='Arial' font-size='12' fill='%2364758b'>${safeKey}</text>` +
    `</svg>`
  }`;
}

