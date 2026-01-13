import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LOCAL_PACKS } from "../src/localPacks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const SPECIAL_CODE_MAP = {
  gb_eng: { code: "GB-ENG", type: "subdivision" },
  gb_sct: { code: "GB-SCT", type: "subdivision" },
  gb_wls: { code: "GB-WLS", type: "subdivision" },
  gb_nir: { code: "GB-NIR", type: "subdivision" },
  gb_iom: { code: "IM", type: "country" },
  gb_jsy: { code: "JE", type: "country" },
  gb_ggy: { code: "GG", type: "country" },
  gb_gib: { code: "GI", type: "country" },
  gb_bmu: { code: "BM", type: "country" },
  gb_cym: { code: "KY", type: "country" },
};

const flags = LOCAL_PACKS.flatMap((pack) => pack.flags || []);
const entries = flags
  .map((flag) => {
    const normalizedCode = String(flag.code || "").toLowerCase();
    if (!normalizedCode || !normalizedCode.includes("_")) {
      return null;
    }
    const special = SPECIAL_CODE_MAP[normalizedCode];
    if (special) {
      return { ...flag, lookupCode: special.code, lookupType: special.type };
    }
    const [countryCode, subdivisionCode] = normalizedCode.split("_");
    if (!countryCode || !subdivisionCode) return null;
    return {
      ...flag,
      lookupCode: `${countryCode.toUpperCase()}-${subdivisionCode.toUpperCase()}`,
      lookupType: "subdivision",
    };
  })
  .filter(Boolean);

const subdivisionCodes = new Set(
  entries
    .filter((entry) => entry.lookupType === "subdivision")
    .map((entry) => entry.lookupCode)
);
const countryCodes = new Set(
  entries
    .filter((entry) => entry.lookupType === "country")
    .map((entry) => entry.lookupCode)
);

const buildValues = (codes) =>
  [...codes].sort().map((code) => `"${code}"`).join(" ");

const sparql = `
SELECT ?code ?flag WHERE {
  VALUES ?code { ${buildValues(new Set([...subdivisionCodes, ...countryCodes]))} }
  {
    ?item wdt:P300 ?code.
  } UNION {
    ?item wdt:P297 ?code.
  }
  ?item wdt:P41 ?flag.
  FILTER regex(str(?flag), "\\\\.svg$", "i")
}
`;

const endpoint = "https://query.wikidata.org/sparql";
const url = new URL(endpoint);
url.searchParams.set("format", "json");
url.searchParams.set("query", sparql);

const response = await fetch(url.toString(), {
  headers: {
    "User-Agent": "flagiq-local-flags/1.0 (https://flagiq.local)",
    Accept: "application/sparql-results+json",
  },
});

if (!response.ok) {
  console.error(`Failed to query Wikidata: ${response.status}`);
  process.exit(1);
}

const data = await response.json();
const results = data?.results?.bindings || [];
const flagByCode = new Map(
  results.map((row) => [row.code.value, row.flag.value])
);

const missing = [];

for (const entry of entries) {
  const flagUrl = flagByCode.get(entry.lookupCode);
  if (!flagUrl) {
    missing.push(entry.code);
    continue;
  }
  const assetUrl = new URL(flagUrl);
  assetUrl.protocol = "https:";
  const imagePath = entry.image || entry.img;
  if (!imagePath) {
    missing.push(entry.code);
    continue;
  }
  const diskPath = path.join(repoRoot, "public", imagePath);
  fs.mkdirSync(path.dirname(diskPath), { recursive: true });

  const imageResponse = await fetch(assetUrl.toString());
  if (!imageResponse.ok) {
    console.warn(
      `Failed to download ${entry.code} from ${assetUrl}: ${imageResponse.status}`
    );
    missing.push(entry.code);
    continue;
  }
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  fs.writeFileSync(diskPath, buffer);
}

if (missing.length) {
  console.warn("Missing flags:", missing.join(", "));
  process.exitCode = 1;
} else {
  console.log(`Downloaded ${entries.length} local flags.`);
}
