// Bump the version everywhere, commit and tag: `bun run release 0.2.0`.
// Pushing the tag (`git push --follow-tags`) triggers .github/workflows/release.yml.
// See RELEASING.md (svelte-pdf-mini must be on npm first).
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("usage: bun run release <x.y.z>");
  process.exit(1);
}

// Release from a clean, up-to-date main: the tag must point at what CI checked.
const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (git("status --porcelain")) fail("The working tree has changes: commit or stash them first.");
if (git("branch --show-current") !== "main") fail("Release from main.");
git("fetch origin main --quiet");
if (git("rev-parse HEAD") !== git("rev-parse origin/main")) fail("main is not in sync with origin/main: pull or push first.");
if (git(`tag --list v${version}`)) fail(`Tag v${version} already exists.`);

const edit = (file, fn) => writeFileSync(file, fn(readFileSync(file, "utf8")));
const setJson = (s) => s.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
edit("package.json", setJson);
edit("src-tauri/tauri.conf.json", setJson);
edit("src-tauri/Cargo.toml", (s) => s.replace(/^version = ".*"$/m, `version = "${version}"`));

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("cargo update -p xivly --offline --manifest-path src-tauri/Cargo.toml");
run(`node scripts/check-version.js v${version}`);
run("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");
run(`git commit -m "release v${version}"`);
run(`git tag -a v${version} -m "v${version}"`);
console.log(`\nTagged v${version}. Push with: git push --follow-tags`);
