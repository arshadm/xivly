#!/bin/sh
# Write the winget manifests of a release (JulienBlanchon.Xivly, schema 1.12.0)
# into <dir>: the version, default locale and installer manifests.
# Used for the package's first submission to microsoft/winget-pkgs; once it is
# there, the release workflow adds versions with `komac update`, which carries
# these fields forward. To change a field later, edit it here AND in the latest
# manifests in winget-pkgs (or pass it to komac).
# Installer: the NSIS setup only (Tauri's default per-user install, no UAC
# prompt; it also installs WebView2 when missing). winget's nullsoft type
# already runs it with /S, so it needs no switches.
# Usage: scripts/winget.sh <version> <setup.exe sha256> <dir>
set -eu
VERSION=$1 SHA=$2 DIR=$3
ID=JulienBlanchon.Xivly
REPO=https://github.com/julien-blanchon/xivly
SCHEMA=1.12.0
# winget writes hashes in upper case.
SHA=$(printf '%s' "$SHA" | tr '[:lower:]' '[:upper:]')

mkdir -p "$DIR"

cat > "$DIR/$ID.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.$SCHEMA.schema.json

PackageIdentifier: $ID
PackageVersion: $VERSION
DefaultLocale: en-US
ManifestType: version
ManifestVersion: $SCHEMA
YAML

cat > "$DIR/$ID.locale.en-US.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.defaultLocale.$SCHEMA.schema.json

PackageIdentifier: $ID
PackageVersion: $VERSION
PackageLocale: en-US
Publisher: Julien Blanchon
PublisherUrl: https://github.com/julien-blanchon
PublisherSupportUrl: $REPO/issues
PrivacyUrl: $REPO/blob/main/CODE_SIGNING.md#privacy
Author: Julien Blanchon
PackageName: Xivly
PackageUrl: $REPO
License: MIT
LicenseUrl: $REPO/blob/main/LICENSE
Copyright: Copyright (c) 2026 Julien Blanchon
CopyrightUrl: $REPO/blob/main/LICENSE
ShortDescription: Read, annotate and organize research papers, without distraction.
Description: |-
  Xivly is a reader, annotator and library for research papers.
  Your library is a plain folder: each paper is its PDF (annotations are saved inside it, as standard PDF annotations) and a paper.json with its metadata, readable by you, your scripts and coding agents.
  Add papers from arXiv links or PDF files; Xivly fills in titles, authors, links to code, models and citations, and runs your own hook scripts on library events.
Moniker: xivly
Tags:
- annotation
- arxiv
- library
- papers
- pdf
- pdf-reader
- reference-manager
- research
ReleaseNotesUrl: $REPO/releases/tag/v$VERSION
ManifestType: defaultLocale
ManifestVersion: $SCHEMA
YAML

# AppsAndFeaturesEntries: what the installer registers in "Installed apps"
# (Tauri derives the publisher "blanchon" from the identifier cc.blanchon.xivly).
cat > "$DIR/$ID.installer.yaml" <<YAML
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.$SCHEMA.schema.json

PackageIdentifier: $ID
PackageVersion: $VERSION
InstallerLocale: en-US
InstallerType: nullsoft
Scope: user
UpgradeBehavior: install
ProductCode: Xivly
AppsAndFeaturesEntries:
- DisplayName: Xivly
  Publisher: blanchon
  ProductCode: Xivly
InstallationMetadata:
  DefaultInstallLocation: '%LocalAppData%\\Xivly'
Installers:
- Architecture: x64
  InstallerUrl: $REPO/releases/download/v$VERSION/Xivly_${VERSION}_x64-setup.exe
  InstallerSha256: $SHA
ManifestType: installer
ManifestVersion: $SCHEMA
YAML
