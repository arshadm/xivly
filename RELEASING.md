# Releasing Xivly

A release is triggered by pushing a tag `vX.Y.Z`. `.github/workflows/release.yml` builds the desktop app for macOS, Linux and Windows, uploads everything to one GitHub release (kept as a draft until all platforms succeed), publishes it, then bumps the Homebrew cask.

## Ordering: svelte-pdf-mini first

Xivly installs [`svelte-pdf-mini`](https://www.npmjs.com/package/svelte-pdf-mini) from npm. If this release needs a new svelte-pdf-mini:

1. Release svelte-pdf-mini (see its `RELEASING.md`: tag `vA.B.C` in `julien-blanchon/svelte-pdf-mini`).
2. Wait until `npm view svelte-pdf-mini@A.B.C version` answers.
3. In Xivly: `bun add svelte-pdf-mini@^A.B.C`, check the app, commit `package.json` and `bun.lock`.
4. Release Xivly.

The workflow's *prepare* job reads the version locked in `bun.lock` and stops with an error if it isn't on npm.

## Prerequisites

Repository secrets (`gh secret list -R julien-blanchon/xivly`), all present today:

| Secret | Used for |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | its password |
| `KEYCHAIN_PASSWORD` | any random string (temporary keychain on the runner) |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | notarization (`APPLE_PASSWORD` is an app-specific password) |
| `HOMEBREW_TAP_DEPLOY_KEY` | SSH deploy key with write access to `julien-blanchon/homebrew-tap` |

Without the Apple secrets the macOS app is ad-hoc signed and the cask strips the quarantine flag. Linux and Windows builds are **not** code-signed (Windows SmartScreen will warn on first launch).

The Apple secrets reach only the steps that need them (certificate import, the macOS build that notarizes the app, DMG notarization), never the environment of the whole job. Third-party actions are pinned to commit SHAs (the comment gives the tag); bump them deliberately.

`GITHUB_TOKEN` (automatic, `contents: write`) creates the release and uploads assets.

## Version bump and tag

The version lives in four places that must agree: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `xivly` entry of `src-tauri/Cargo.lock`.

```sh
git switch main && git pull           # CI green
bun run release 0.2.0                 # refuses unless the tree is clean and main == origin/main;
                                      # bumps all four, verifies, commits "release v0.2.0", tags v0.2.0 (annotated)
git push --follow-tags                # pushes the commit and the tag -> release.yml
```

Check versions at any time with `node scripts/check-version.js [vX.Y.Z]`.

Prereleases: `bun run release 0.2.0-rc.1` → tag `v0.2.0-rc.1`. The GitHub release is marked as a prerelease, Windows ships only the NSIS installer (WiX `.msi` needs a numeric version) and the Homebrew cask is **not** updated. A release candidate is the safest way to try the Linux/Windows builds before a stable release.

## What `release.yml` does

1. **prepare** (ubuntu)
   - `node scripts/check-version.js vX.Y.Z`: tag vs `package.json` vs `tauri.conf.json` vs `Cargo.toml` vs `Cargo.lock`.
   - The `svelte-pdf-mini` version from `bun.lock` is on npm.
   - `bun install --frozen-lockfile`, `bun run check`.
   - Creates a **draft** release `vX.Y.Z` (title *Xivly vX.Y.Z*, install instructions + GitHub-generated notes), or reuses that tag's draft on re-runs. An already **published** release is refused (its assets are what users and the cask's sha256 have) unless a manual run sets **force**.
2. **build** (matrix, `fail-fast: false`). The Rust cache comes from `cache.yml` (see below):
   - **macOS** (`macos-latest`): `--target universal-apple-darwin`, bundles from `tauri.conf.json` (`app`, `dmg`). Imports the Developer ID certificate into a temporary keychain; `tauri build` signs the app, notarizes it and staples it. The DMG is then notarized itself (`xcrun notarytool submit --wait`), stapled and checked (`stapler validate`, `spctl`), and uploaded with `gh release upload --clobber`. Assets: `Xivly_X.Y.Z_universal.dmg`, `Xivly_X.Y.Z_universal.app.tar.gz`.
   - **Linux** (`ubuntu-24.04`, for a WebKitGTK recent enough to run pdf.js): installs `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev libssl-dev patchelf`, `--bundles appimage,deb,rpm`. Assets: `Xivly_X.Y.Z_amd64.AppImage`, `Xivly_X.Y.Z_amd64.deb`, `Xivly-X.Y.Z-1.x86_64.rpm`. Built against glibc 2.39: Ubuntu 24.04, Debian 13, Fedora 40 or newer (not Ubuntu 22.04 / Debian 12).
   - **Windows** (`windows-latest`): `--bundles nsis,msi`. Assets: `Xivly_X.Y.Z_x64-setup.exe`, `Xivly_X.Y.Z_x64_en-US.msi`. Linux and Windows upload with `tauri-apps/tauri-action` (`releaseId`).
3. **publish** (after all builds): fails if any expected asset is missing, otherwise publishes the draft. It is marked **Latest** only if it is the newest stable version, so re-running an old tag never takes "Latest" from a newer one. A failed build leaves the release as a draft, invisible to users and to Homebrew.
4. **homebrew** (stable versions only, after publish; one run at a time across tags): downloads the published `*_universal.dmg`, computes its sha256, renders `Casks/xivly.rb` with `scripts/cask.sh` and pushes it to `julien-blanchon/homebrew-tap` (rebase + retry on a race). It never moves the cask to an older version than the one in the tap, and is a no-op when unchanged.

### Windows code signing (SignPath Foundation)

Free for open-source projects through the [SignPath Foundation](https://signpath.org); the policy it requires is [CODE_SIGNING.md](CODE_SIGNING.md). Until it is set up, the workflow skips signing and Windows builds ship unsigned, exactly as before.

**How it works.** SignPath signs *GitHub artifacts* and verifies their origin (every job of the run on GitHub-hosted runners, the tagged commit of this repository), so it can't be a per-file `signCommand` called by the bundler. On Windows, when SignPath is configured, `build`:

1. builds the program only (`tauri build --no-bundle`) and uploads `xivly.exe` as an artifact;
2. submits it with [`signpath/github-action-submit-signing-request`](https://github.com/SignPath/github-action-submit-signing-request) (artifact configuration `app`) and waits (up to an hour: release signing waits for a manual approval);
3. puts the signed `xivly.exe` back and bundles the installers around it (`tauri bundle`), so the installed program is signed too;
4. uploads the NSIS setup and the MSI as an artifact, signs them (configuration `installers`, or `installers-nsis` for prereleases, which have no MSI), checks the signatures (`Get-AuthenticodeSignature`) and uploads them to the draft release.

**Setup**, once the Foundation has approved the project:

1. In SignPath: the organization and project (slug, e.g. `xivly`), with GitHub as trusted build system and the repository linked.
2. Artifact configurations, from the files in [`.signpath/`](.signpath): `app.xml` → slug `app`, `installers.xml` → slug `installers`, `installers-nsis.xml` → slug `installers-nsis`.
3. Signing policies: `release-signing` (Foundation certificate, approver: the maintainer) and, if offered, `test-signing` (prereleases).
4. A CI user with submitter rights on those policies; create its API token.
5. In GitHub (*Settings → Secrets and variables → Actions*):

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `SIGNPATH_API_TOKEN` | the CI user's API token |
   | Variable | `SIGNPATH_ORGANIZATION_ID` | the organization ID |
   | Variable | `SIGNPATH_PROJECT_SLUG` | e.g. `xivly` |
   | Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | `release-signing` |
   | Variable (optional) | `SIGNPATH_TEST_SIGNING_POLICY_SLUG` | `test-signing`, used for prereleases |

   Signing turns on only when the secret and the three required variables all exist.
6. Try it with a prerelease tag (`v0.3.1-rc.1`): it uses the test policy when there is one, and leaves Homebrew alone.

**Verify a signed build** on Windows:

```powershell
Get-AuthenticodeSignature .\Xivly_X.Y.Z_x64-setup.exe | Format-List Status, SignerCertificate
Get-AuthenticodeSignature .\Xivly_X.Y.Z_x64_en-US.msi | Format-List Status, SignerCertificate
Get-AuthenticodeSignature "$env:LOCALAPPDATA\Xivly\xivly.exe"   # after installing (NSIS, per-user)
signtool verify /pa /v .\Xivly_X.Y.Z_x64-setup.exe                # Windows SDK
```

`Status` should be `Valid`, the signer the SignPath Foundation. SmartScreen may still warn on the first downloads of a new certificate until it builds reputation.

### Build cache

A tag can restore caches saved on the default branch, not another tag's. `cache.yml` warms the release builds' Rust cache on `main` (same toolchain, targets and `shared-key: release-<OS>`, `tauri build --no-bundle`): when `Cargo.lock`/`Cargo.toml` change, weekly (GitHub evicts caches unused for 7 days) and by hand (`gh workflow run cache.yml`). Releases only restore it (`save-if: false`). Without a warm cache each platform compiles every crate (about 11 minutes); with it, only Xivly's own crate and the bundling remain. Before a release after a dependency bump, let `cache.yml` finish on main first. Bun's package cache is cached too (`bun.lock` key).

### Manual runs

*Actions → release → Run workflow* with an existing tag. Uncheck **publish** to stop at the draft (no publish, no cask bump), e.g. to inspect the bundles first:

```sh
gh workflow run release.yml -R julien-blanchon/xivly -f tag=v0.2.0 -f publish=false
```

Re-running a failed release (or the failed jobs) is safe: the draft is reused, assets are re-uploaded, the cask push is a no-op when unchanged. Rebuilding a **published** release needs `-f force=true` (it replaces the assets, so the cask's sha256 changes and the homebrew job updates it).

## Verify

```sh
gh run list -R julien-blanchon/xivly -w release.yml -L 1
gh release view v0.2.0 -R julien-blanchon/xivly           # not a draft; dmg, app.tar.gz, AppImage, deb, rpm, setup.exe, msi
brew update && brew upgrade --cask xivly                  # or: brew info --cask julien-blanchon/tap/xivly
spctl -a -vv /Applications/Xivly.app                      # "source=Notarized Developer ID" for signed builds
xcrun stapler validate Xivly_0.2.0_universal.dmg          # the DMG itself is notarized and stapled
spctl -a -t open --context context:primary-signature -v Xivly_0.2.0_universal.dmg
```

On Linux: `chmod +x Xivly_*.AppImage && ./Xivly_*.AppImage`, `sudo apt install ./Xivly_*_amd64.deb`, or `sudo dnf install ./Xivly-*.x86_64.rpm`. On Windows: run the setup `.exe` or the `.msi`.

## If something fails

- **Version mismatch**: delete the tag (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`), run `bun run release X.Y.Z` again (or fix the files by hand), push.
- **svelte-pdf-mini not on npm**: release it first (see above), then re-run the workflow.
- **One platform fails**: the release stays a draft. Fix, then either re-run the failed jobs or delete the draft and tag a new patch version. Delete stale drafts with `gh release delete vX.Y.Z --yes` (keeps the tag).
- **Notarization fails**: check the Apple secrets and that the certificate is a *Developer ID Application* certificate that hasn't expired. For the DMG step, `xcrun notarytool log <submission-id> --apple-id … --team-id …` shows why.
- **Already published**: the *prepare* job refuses to rebuild it; re-run manually with **force** only if replacing its assets is intended.
