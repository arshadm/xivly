#!/bin/sh
# Download the starter papers (starter/papers.json) into starter/pdfs/, smaller.
# Each PDF is recompressed with Ghostscript, and the smaller copy is kept only
# if every page still renders the same (Ghostscript can drop vector figures).
# PDFs still over MAX_MB are skipped. Needs: gs, pdftoppm (poppler), python3 + Pillow.
set -eu
cd "$(dirname "$0")/.."
MAX_MB=${MAX_MB:-15}
out=starter/pdfs
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

ids=$(python3 -c "import json; print(' '.join(p['arxiv'] for p in json.load(open('starter/papers.json'))))")
for id in $ids; do
	[ -f "$out/$id.pdf" ] && { echo "= $id (cached)"; continue; }
	curl -sfL -o "$tmp/orig.pdf" "https://arxiv.org/pdf/$id"
	gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dCompatibilityLevel=1.7 -dPDFSETTINGS=/ebook \
		-dDetectDuplicateImages=true -sOutputFile="$tmp/small.pdf" "$tmp/orig.pdf" 2>/dev/null || cp "$tmp/orig.pdf" "$tmp/small.pdf"
	rm -f "$tmp"/o-*.png "$tmp"/s-*.png
	pdftoppm -r 30 -gray -png "$tmp/orig.pdf" "$tmp/o" 2>/dev/null
	pdftoppm -r 30 -gray -png "$tmp/small.pdf" "$tmp/s" 2>/dev/null
	# Share of pixels that changed on the worst page.
	diff=$(python3 - "$tmp" <<'EOF'
import sys, glob
from PIL import Image, ImageChops, ImageStat
t = sys.argv[1]
o, s = sorted(glob.glob(f'{t}/o-*.png')), sorted(glob.glob(f'{t}/s-*.png'))
if len(o) != len(s): print(100); sys.exit()
worst = 0
for a, b in zip(o, s):
    A = Image.open(a).convert('L'); B = Image.open(b).convert('L').resize(A.size)
    worst = max(worst, ImageStat.Stat(ImageChops.difference(A, B).point(lambda v: 255 if v > 60 else 0)).mean[0] / 2.55)
print(round(worst, 2))
EOF
)
	o=$(stat -f%z "$tmp/orig.pdf" 2>/dev/null || stat -c%s "$tmp/orig.pdf")
	s=$(stat -f%z "$tmp/small.pdf" 2>/dev/null || stat -c%s "$tmp/small.pdf")
	if python3 -c "import sys; sys.exit(0 if $diff < 1 and $s < $o else 1)"; then pick=small; size=$s; else pick=orig; size=$o; fi
	if [ "$size" -gt $((MAX_MB * 1000000)) ]; then
		echo "✗ $id skipped: $((size / 1000000)) MB"
		continue
	fi
	cp "$tmp/$pick.pdf" "$out/$id.pdf"
	echo "✓ $id $pick $((size / 1000)) KB (worst page diff $diff%)"
done
