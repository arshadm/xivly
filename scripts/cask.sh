#!/bin/sh
# Print the Homebrew cask for a release.
# Usage: scripts/cask.sh <version> <sha256> <asset name with #{version}> <signed: true|false>
set -eu
VERSION=$1 SHA=$2 ASSET=$3 SIGNED=${4:-true}

cat <<CASK
cask "xivly" do
  version "$VERSION"
  sha256 "$SHA"

  url "https://github.com/julien-blanchon/xivly/releases/download/v#{version}/$ASSET"
  name "Xivly"
  desc "Research paper reader, annotator and library, without distraction"
  homepage "https://github.com/julien-blanchon/xivly"

  depends_on macos: ">= :tahoe"

  app "Xivly.app"
CASK

if [ "$SIGNED" != "true" ]; then
cat <<'CASK'

  # Ad-hoc signed build: clear the quarantine flag so Gatekeeper lets it open.
  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Xivly.app"]
  end
CASK
fi

cat <<'CASK'

  # App state only; your library folder is never touched.
  zap trash: [
    "~/Library/Application Support/cc.blanchon.xivly",
    "~/Library/Caches/cc.blanchon.xivly",
    "~/Library/Saved Application State/cc.blanchon.xivly.savedState",
    "~/Library/WebKit/cc.blanchon.xivly",
  ]
end
CASK
