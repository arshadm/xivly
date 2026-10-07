#!/bin/sh
# Install or update Xivly on Linux (x86_64):
#   curl -fsSL https://raw.githubusercontent.com/julien-blanchon/xivly/main/install.sh | sh
#
# Debian, Ubuntu and derivatives: the .deb, with apt (it pulls in WebKitGTK).
# Fedora, RHEL, openSUSE: the .rpm, with dnf or zypper.
# Anything else: the AppImage in ~/.local/bin, with a menu entry (no sudo).
# Every download is checked against the sha256 GitHub publishes for it.
#
# Environment:
#   XIVLY_VERSION=0.4.0   install that version instead of the latest release
#   XIVLY_APPIMAGE=1      install the AppImage even where apt, dnf or zypper exist
set -eu

REPO=julien-blanchon/xivly
API=https://api.github.com/repos/$REPO

say() { printf '%s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}
has() { command -v "$1" >/dev/null 2>&1; }

# download <url> <file>
download() {
  if has curl; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif has wget; then
    wget -q -O "$2" "$1"
  else
    die "curl or wget is needed to download Xivly."
  fi
}

sha256() {
  if has sha256sum; then
    sha256sum "$1" | cut -d' ' -f1
  elif has shasum; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    die "sha256sum (coreutils) is needed to check the download."
  fi
}

# Run as root: directly, or through sudo.
as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif has sudo; then
    sudo "$@"
  else
    die "sudo is needed to install the package. Run as root, or install the AppImage for your user: XIVLY_APPIMAGE=1"
  fi
}

# glibc_older A B: glibc version A (major.minor) is older than B.
glibc_older() {
  [ "${1%%.*}" -lt "${2%%.*}" ] || { [ "${1%%.*}" -eq "${2%%.*}" ] && [ "${1#*.}" -lt "${2#*.}" ]; }
}

# Everything runs from here, once the whole script has been read: with
# `curl | sh`, the rest of the script is still in the pipe meanwhile.
main() {
# ── Platform ────────────────────────────────────────────────────────────────
[ "$(uname -s)" = Linux ] || die "this installer is for Linux. On macOS: brew install --cask julien-blanchon/tap/xivly. Other systems: https://github.com/$REPO/releases"
case "$(uname -m)" in
  x86_64 | amd64) ;;
  *) die "Xivly is built for x86_64 (amd64) only, and this machine is $(uname -m)." ;;
esac

# The builds need glibc 2.39 or newer (Ubuntu 24.04, Debian 13, Fedora 40 or newer).
LIBC=$(ldd --version 2>&1 | head -n 1 || true)
case "$LIBC" in
  *musl*) warn "this system uses musl libc; Xivly needs glibc 2.39 or newer and will not run here." ;;
  *)
    GLIBC=$(printf '%s\n' "$LIBC" | grep -oE '[0-9]+\.[0-9]+$' || true)
    if [ -z "$GLIBC" ]; then
      warn "could not find the glibc version; Xivly needs glibc 2.39 or newer."
    elif glibc_older "$GLIBC" 2.39; then
      warn "this system has glibc $GLIBC; Xivly needs 2.39 or newer (Ubuntu 24.04, Debian 13, Fedora 40 or newer) and will likely not start."
    fi
    ;;
esac

if [ "${XIVLY_APPIMAGE:-}" = 1 ]; then
  KIND=appimage
elif has apt-get && has dpkg; then
  KIND=deb
elif has dnf; then
  KIND=rpm PM=dnf
elif has zypper; then
  KIND=rpm PM=zypper
else
  KIND=appimage
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM
# apt reads the package as its own unprivileged user.
chmod 755 "$TMP"

# ── Release ─────────────────────────────────────────────────────────────────
if [ -n "${XIVLY_VERSION:-}" ]; then
  RELEASE_URL=$API/releases/tags/v${XIVLY_VERSION#v}
else
  RELEASE_URL=$API/releases/latest # the newest stable release
fi
download "$RELEASE_URL" "$TMP/release.json" 2>/dev/null ||
  die "could not get the release from GitHub ($RELEASE_URL)."
# The fields used here, one per line and in order, whatever the formatting.
grep -oE '"(tag_name|name|digest)":[[:space:]]*"[^"]*"' "$TMP/release.json" |
  sed 's/^"\([a-z_]*\)":[[:space:]]*"\(.*\)"$/\1 \2/' >"$TMP/fields" || true
TAG=$(sed -n 's/^tag_name //p' "$TMP/fields" | head -n 1)
[ -n "$TAG" ] || die "no release found at $RELEASE_URL."
VERSION=${TAG#v}

case "$KIND" in
  deb) ASSET=Xivly_${VERSION}_amd64.deb ;;
  rpm) ASSET=Xivly-${VERSION}-1.x86_64.rpm ;;
  appimage) ASSET=Xivly_${VERSION}_amd64.AppImage ;;
esac

# The asset's "digest" ("sha256:…") follows its "name" in the release JSON.
EXPECTED=$(grep -A 1 -xF "name $ASSET" "$TMP/fields" | sed -n 's/^digest sha256://p' | head -n 1)
[ -n "$EXPECTED" ] || die "release $TAG has no $ASSET with a published sha256."

say "Xivly $VERSION for Linux x86_64: $ASSET"
download "https://github.com/$REPO/releases/download/$TAG/$ASSET" "$TMP/$ASSET" ||
  die "the download failed."
ACTUAL=$(sha256 "$TMP/$ASSET")
[ "$ACTUAL" = "$EXPECTED" ] ||
  die "the download's sha256 is $ACTUAL, but GitHub published $EXPECTED. Nothing was installed."
say "Checksum verified (sha256)."
chmod 644 "$TMP/$ASSET"

# ── Install ─────────────────────────────────────────────────────────────────
case "$KIND" in
  deb)
    say "Installing the package with apt-get, which also installs WebKitGTK and the other libraries it needs (needs root):"
    say "  sudo apt-get install ./$ASSET"
    as_root apt-get install -y "$TMP/$ASSET" </dev/null
    UNINSTALL="sudo apt remove xivly"
    ;;
  rpm)
    say "Installing the package with $PM, which also installs WebKitGTK and the other libraries it needs (needs root):"
    if [ "$PM" = dnf ]; then
      say "  sudo dnf install ./$ASSET"
      as_root dnf install -y "$TMP/$ASSET" </dev/null
    else
      # Release packages are checked by the sha256 above, not signed.
      say "  sudo zypper install --allow-unsigned-rpm ./$ASSET"
      as_root zypper --non-interactive install --allow-unsigned-rpm "$TMP/$ASSET" </dev/null
    fi
    UNINSTALL="sudo $PM remove xivly"
    ;;
  appimage)
    BIN=${XDG_BIN_HOME:-$HOME/.local/bin}
    DATA=${XDG_DATA_HOME:-$HOME/.local/share}
    say "Installing the AppImage for your user (no root needed):"
    say "  $BIN/xivly, with a menu entry in $DATA/applications"
    mkdir -p "$BIN" "$DATA/applications"
    chmod 755 "$TMP/$ASSET"
    # Icons from the AppImage itself (extracting needs no FUSE).
    (cd "$TMP" && "./$ASSET" --appimage-extract 'usr/share/icons/hicolor/*/apps/xivly.png' </dev/null >/dev/null 2>&1) ||
      warn "could not extract the icon; the menu entry will have none."
    for SIZE in 32x32 128x128; do
      ICON=$TMP/squashfs-root/usr/share/icons/hicolor/$SIZE/apps/xivly.png
      [ -f "$ICON" ] && mkdir -p "$DATA/icons/hicolor/$SIZE/apps" && cp "$ICON" "$DATA/icons/hicolor/$SIZE/apps/xivly.png"
    done
    # Tauri's 256 px icon sits in 256x256@2.
    ICON=$TMP/squashfs-root/usr/share/icons/hicolor/256x256@2/apps/xivly.png
    [ -f "$ICON" ] && mkdir -p "$DATA/icons/hicolor/256x256/apps" && cp "$ICON" "$DATA/icons/hicolor/256x256/apps/xivly.png"
    mv -f "$TMP/$ASSET" "$BIN/xivly"
    cat >"$DATA/applications/xivly.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Xivly
Comment=Papers without distraction
Exec="$BIN/xivly"
Icon=xivly
Categories=Education;
StartupWMClass=xivly
Terminal=false
DESKTOP
    has update-desktop-database && update-desktop-database "$DATA/applications" >/dev/null 2>&1 || true
    UNINSTALL="rm -f \"$BIN/xivly\" \"$DATA/applications/xivly.desktop\" \"$DATA\"/icons/hicolor/*/apps/xivly.png"
    # AppImages run through FUSE 2 (libfuse.so.2).
    if ! { has ldconfig && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; } && ! ls /usr/lib*/libfuse.so.2 /usr/lib/*/libfuse.so.2 >/dev/null 2>&1; then
      warn "FUSE 2 (libfuse.so.2) seems to be missing, and AppImages need it to start: install fuse2 (Arch), libfuse2t64 (Ubuntu, Debian) or fuse-libs (Fedora)."
    fi
    case ":$PATH:" in
      *":$BIN:"*) ;;
      *)
        warn "$BIN is not in your PATH."
        RUN=$BIN/xivly
        ;;
    esac
    ;;
esac

say ""
say "Xivly $VERSION is installed. Open it from your app menu, or run: ${RUN:-xivly}"
say "Update:    run the same command again"
say "Uninstall: $UNINSTALL"
}

main "$@"
