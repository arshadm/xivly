#!/bin/sh
# Cargo runner for `tauri dev` on macOS (src-tauri/.cargo/config.toml).
# A bare `target/debug/xivly` has no bundle identifier as far as macOS is
# concerned, and clipboard managers (Paste…) drop copies from an app without
# one. So run it from a minimal `Xivly Dev.app` next to it: the binary's own
# Info.plist plus an identifier (`<identifier>.dev`, apart from the installed
# app) and the icon. Anything else cargo runs (tests…) runs as is.
set -eu
bin=$1
shift
[ "$(basename "$bin")" = xivly ] || exec "$bin" "$@"

root=$(cd "$(dirname "$0")/.." && pwd)
dir=$(cd "$(dirname "$bin")" && pwd)
id="$(plutil -extract identifier raw -o - "$root/src-tauri/tauri.conf.json").dev"
app="$dir/Xivly Dev.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
plist="$app/Contents/Info.plist"
rm -f "$plist"
segedit "$dir/xivly" -extract __TEXT __info_plist "$plist" 2>/dev/null || plutil -create xml1 "$plist"
plutil -replace CFBundleIdentifier -string "$id" "$plist"
plutil -replace CFBundleExecutable -string xivly "$plist"
plutil -replace CFBundlePackageType -string APPL "$plist"
plutil -replace CFBundleIconFile -string icon "$plist"
cp -f "$root/src-tauri/icons/icon.icns" "$app/Contents/Resources/icon.icns"
ln -sf "$dir/xivly" "$app/Contents/MacOS/xivly"

# WebKit keeps its data under the bundle identifier (before: the process name).
for d in "$HOME/Library/WebKit" "$HOME/Library/Caches"; do
	[ -d "$d/xivly" ] && [ ! -e "$d/$id" ] && mv "$d/xivly" "$d/$id"
done
exec "$app/Contents/MacOS/xivly" "$@"
