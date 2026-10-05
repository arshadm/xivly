// Check that every version source agrees (and matches the tag, if given):
//   node scripts/check-version.js [vX.Y.Z]
// package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml and the
// `xivly` entry of src-tauri/Cargo.lock. Used by .github/workflows/release.yml.
import { readFileSync } from "node:fs";

const read = (file) => readFileSync(file, "utf8");
const versions = {
  "package.json": JSON.parse(read("package.json")).version,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^\[package\][^[]*?^version\s*=\s*"([^"]+)"/m)?.[1],
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
