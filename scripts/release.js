// Bump the version everywhere, commit and tag: `bun run release 0.2.0`.
// Pushing the tag (`git push --follow-tags`) triggers .github/workflows/release.yml.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("usage: bun run release <x.y.z>");
  process.exit(1);
}

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
const setJson = (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
edit("package.json", setJson);
edit("src-tauri/tauri.conf.json", setJson);
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = ".*"$/m, `version = "${version}"`));

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("cargo update -p xivly --offline --manifest-path src-tauri/Cargo.toml");
run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
run(`git commit -m "release v${version}"`);
run(`git tag v${version}`);
console.log(`\nTagged v${version}. Push with: git push --follow-tags`);
