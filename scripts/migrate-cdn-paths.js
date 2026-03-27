const fs = require("fs");
const path = require("path");

const LEGACY_PREFIX = "/files/images/fg";
const CDN_BASE = "https://cdn.empac.co/gameshuffle/images";

function transformPath(imgPath) {
  if (!imgPath) return imgPath;
  return imgPath.startsWith(LEGACY_PREFIX)
    ? imgPath.replace(LEGACY_PREFIX, CDN_BASE)
    : imgPath;
}

function transformObject(obj) {
  if (typeof obj === "string") return transformPath(obj);
  if (Array.isArray(obj)) return obj.map(transformObject);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        k,
        k === "img" ? transformPath(v) : transformObject(v),
      ])
    );
  }
  return obj;
}

const dataFiles = [
  path.join(process.cwd(), "src/data/mk8dx-data.json"),
  path.join(process.cwd(), "src/data/mkw-data.json"),
];

for (const dataPath of dataFiles) {
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const transformed = transformObject(raw);
  fs.writeFileSync(dataPath, JSON.stringify(transformed, null, 4) + "\n");
  const name = path.basename(dataPath);
  console.log(`Done: ${name}`);
}
