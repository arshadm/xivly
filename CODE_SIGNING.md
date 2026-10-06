# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

> **Status:** the application to the SignPath Foundation is pending. Until it is approved, Windows builds are published unsigned (Windows SmartScreen asks once before the first launch). This page describes how signing works once it is enabled.

## What is signed

- **Windows:** the Xivly program (`xivly.exe`) and both installers built around it: the NSIS setup (`Xivly_X.Y.Z_x64-setup.exe`) and the MSI package (`Xivly_X.Y.Z_x64_en-US.msi`).
- Only builds made by the GitHub Actions release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml)), on GitHub-hosted runners, from a tagged commit of this repository ([github.com/julien-blanchon/xivly](https://github.com/julien-blanchon/xivly)). SignPath verifies this origin before signing: nothing built elsewhere, and no third-party binary, is signed with this certificate.
- The macOS app and DMG are signed with the maintainer's own Apple Developer ID and notarized by Apple; Linux packages are not signed.

## Team roles

| Role | Member |
| --- | --- |
| Author (writes the code) | [Julien Blanchon](https://github.com/julien-blanchon) |
| Committer (merges changes) | [Julien Blanchon](https://github.com/julien-blanchon) |
| Reviewer (reviews external contributions) | [Julien Blanchon](https://github.com/julien-blanchon) |
| Approver (approves each signing request) | [Julien Blanchon](https://github.com/julien-blanchon) |

Every release is approved by hand in SignPath before it is signed. Contributions from other people are reviewed before they are merged.

## Privacy

Xivly does not collect or send any data about you or your usage: no telemetry, no analytics, no accounts, no crash reports. Your library is a folder of plain files on your disk.

The app only connects to the network when you ask it to, or to enrich a paper you added:

- arXiv (adding a paper from an arXiv link, paper metadata), Hugging Face (paper pages, models and spaces citing a paper), Semantic Scholar, OpenAlex, Crossref and doi.org (references and citations);
- GitHub Pages (`julien-blanchon.github.io`), to download the optional example library on first start;
- links you open, in your browser.

These requests carry only what they need (a paper identifier or title); see each service's own privacy policy. Hook scripts you add to your library run on your machine with your rights and may do anything you write in them.

## Reporting

Report a problem with a signed binary, or a security issue, privately through [GitHub security advisories](https://github.com/julien-blanchon/xivly/security/advisories/new).
