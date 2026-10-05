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

`GITHUB_TOKEN` (automatic, `contents: write`) creates the release and uploads assets.

## Version bump and tag

The version lives in four places that must agree: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and the `xivly` entry of `src-tauri/Cargo.lock`.

```sh
git switch main && git pull           # clean tree, CI green
bun run release 0.2.0                 # bumps all four, verifies, commits "release v0.2.0", tags v0.2.0 (annotated)
git push --follow-tags                # pushes the commit and the tag -> release.yml
```

Check versions at any time with `node scripts/check-version.js [vX.Y.Z]`.

Prereleases: `bun run release 0.2.0-rc.1` → tag `v0.2.0-rc.1`. The GitHub release is marked as a prerelease, Windows ships only the NSIS installer (WiX `.msi` needs a numeric version) and the Homebrew cask is **not** updated. A release candidate is the safest way to try the Linux/Windows builds before a stable release.

## What `release.yml` does

1. **prepare** (ubuntu)
   - `node scripts/check-version.js vX.Y.Z`: tag vs `package.json` vs `tauri.conf.json` vs `Cargo.toml` vs `Cargo.lock`.
   - The `svelte-pdf-mini` version from `bun.lock` is on npm.
   - `bun install --frozen-lockfile`, `bun run check`.
   - Creates a **draft** release `vX.Y.Z` (title *Xivly vX.Y.Z*, install instructions + GitHub-generated notes), or reuses an existing one for that tag on re-runs.
2. **build** (matrix, `fail-fast: false`), each with `tauri-apps/tauri-action@v1` uploading to the draft (`releaseId`):
   - **macOS** (`macos-latest`): `--target universal-apple-darwin`, bundles from `tauri.conf.json` (`app`, `dmg`). Imports the Developer ID certificate into a temporary keychain; `tauri build` signs, notarizes and staples. Assets: `Xivly_X.Y.Z_universal.dmg`, `Xivly_X.Y.Z_universal.app.tar.gz`.
   - **Linux** (`ubuntu-24.04`, for a WebKitGTK recent enough to run pdf.js): installs `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev libssl-dev patchelf`, `--bundles appimage,deb`. Assets: `Xivly_X.Y.Z_amd64.AppImage`, `Xivly_X.Y.Z_amd64.deb`.
   - **Windows** (`windows-latest`): `--bundles nsis,msi`. Assets: `Xivly_X.Y.Z_x64-setup.exe`, `Xivly_X.Y.Z_x64_en-US.msi`.
3. **publish** (after all builds): fails if any expected asset is missing, otherwise turns the draft into the published (`--latest`) release. A failed build leaves the release as a draft, invisible to users and to Homebrew.
4. **homebrew** (stable versions only, after publish): downloads the published `*_universal.dmg`, computes its sha256, renders `Casks/xivly.rb` with `scripts/cask.sh` and pushes it to `julien-blanchon/homebrew-tap` (no-op if unchanged).

### Manual runs

*Actions → release → Run workflow* with an existing tag. Uncheck **publish** to stop at the draft (no publish, no cask bump), e.g. to inspect the bundles first:

```sh
gh workflow run release.yml -R julien-blanchon/xivly -f tag=v0.2.0 -f publish=false
```

Re-running a failed release (or the failed jobs) is safe: the draft is reused, assets are re-uploaded, the cask push is a no-op when unchanged.

## Verify

```sh
gh run list -R julien-blanchon/xivly -w release.yml -L 1
gh release view v0.2.0 -R julien-blanchon/xivly           # not a draft; dmg, app.tar.gz, AppImage, deb, setup.exe, msi
brew update && brew upgrade --cask xivly                  # or: brew info --cask julien-blanchon/tap/xivly
spctl -a -vv /Applications/Xivly.app                      # "source=Notarized Developer ID" for signed builds
xcrun stapler validate Xivly_0.2.0_universal.dmg
```

On Linux: `chmod +x Xivly_*.AppImage && ./Xivly_*.AppImage`, or `sudo apt install ./Xivly_*_amd64.deb`. On Windows: run the setup `.exe` or the `.msi`.

## If something fails

- **Version mismatch**: delete the tag (`git push --delete origin vX.Y.Z && git tag -d vX.Y.Z`), run `bun run release X.Y.Z` again (or fix the files by hand), push.
- **svelte-pdf-mini not on npm**: release it first (see above), then re-run the workflow.
- **One platform fails**: the release stays a draft. Fix, then either re-run the failed jobs or delete the draft and tag a new patch version. Delete stale drafts with `gh release delete vX.Y.Z --yes` (keeps the tag).
- **Notarization fails**: check the Apple secrets and that the certificate is a *Developer ID Application* certificate that hasn't expired.
