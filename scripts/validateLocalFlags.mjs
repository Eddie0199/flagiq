import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { LOCAL_PACKS } from "../src/localPacks.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const flags = LOCAL_PACKS.flatMap((pack) => pack.flags || []);
const expected = flags.map((flag) => ({
  code: flag.code,
  image: flag.image || flag.img,
}));

const missing = expected.filter(({ image }) => {
  if (!image) return true;
  const diskPath = path.join(repoRoot, "public", image);
  return !fs.existsSync(diskPath);
});

if (missing.length) {
  console.warn("Missing local flag images:");
  missing.forEach(({ code, image }) => {
    console.warn(`- ${code}: ${image || "no image path"}`);
  });
  process.exitCode = 1;
} else {
  console.log(`All ${expected.length} local flag images are present.`);
}
