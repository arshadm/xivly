// Check that every version source agrees (and matches the tag, if given):
//   node scripts/check-version.js [vX.Y.Z]
// package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml and the
// `xivly` entry of src-tauri/Cargo.lock. Used by .github/workflows/release.yml.
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
/** `version` of the `[package]` table (its lines up to the next table header). */
function packageVersion(toml) {
  const lines = toml.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "[package]");
  if (start < 0) return undefined;
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\[/.test(line)) break;
    const m = line.match(/^\s*version\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
}
const versions = {
  "package.json": JSON.parse(read("package.json")).version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": packageVersion(read("src-tauri/Cargo.toml")),
  "src-tauri/Cargo.lock": read("src-tauri/Cargo.lock").match(/\[\[package\]\]\nname = "xivly"\nversion = "([^"]+)"/)?.[1],
};

const tag = process.argv[2];
const expected = tag ? tag.replace(/^v/, "") : versions["package.json"];
let ok = true;
for (const [file, version] of Object.entries(versions)) {
  const match = version === expected;
  ok &&= match;
  console.log(`${match ? "ok  " : "FAIL"} ${file}: ${version ?? "(not found)"}`);
}
if (tag && !/^v\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag)) {
  console.error(`Tag ${tag} is not of the form vX.Y.Z`);
  ok = false;
}
if (!ok) {
  console.error(`\nVersion mismatch: expected ${expected}${tag ? ` (tag ${tag})` : ""}. Run \`bun run release <x.y.z>\`.`);
  process.exit(1);
}
console.log(`\nAll versions are ${expected}.`);
