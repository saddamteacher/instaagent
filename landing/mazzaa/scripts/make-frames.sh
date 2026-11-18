#!/usr/bin/env bash
# Flow (Veo) videolarini scroll uchun WebP kadrlar ketma-ketligiga aylantiradi.
#
#   scripts/make-frames.sh [-n 240] [--4k] [-q 78] sahna1.mp4 sahna2.mp4 sahna3.mp4 ...
#
# Natija: assets/frames/hd/f_0001.webp ... (1920px), --4k bilan assets/frames/4k/ (3840px)
#         va assets/frames/manifest.json. Sayt manifestni ko'rsa, avtomatik kadrlar rejimiga o'tadi.
#
# Talab: ffmpeg (libwebp bilan) va ffprobe.
set -euo pipefail

FRAMES=240
QUALITY=78
WITH_4K=0
INPUTS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -n) FRAMES="$2"; shift 2 ;;
    -q) QUALITY="$2"; shift 2 ;;
    --4k) WITH_4K=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) INPUTS+=("$1"); shift ;;
  esac
done
[[ ${#INPUTS[@]} -gt 0 ]] || { echo "Kamida bitta video bering. -h yordam."; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg topilmadi"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/frames"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1) Hamma sahnalarni bitta 4K master videoga yig'amiz (bir xil o'lcham va fps).
args=(); filt=""
for i in "${!INPUTS[@]}"; do
  args+=(-i "${INPUTS[$i]}")
  filt+="[$i:v]scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,setsar=1,fps=30,format=yuv420p[v$i];"
done
for i in "${!INPUTS[@]}"; do filt+="[v$i]"; done
filt+="concat=n=${#INPUTS[@]}:v=1:a=0[v]"
echo "→ master video yig'ilmoqda (${#INPUTS[@]} ta sahna)…"
ffmpeg -hide_banner -loglevel error -y "${args[@]}" -filter_complex "$filt" -map "[v]" -c:v libx264 -crf 14 -preset fast "$TMP/master.mp4"

DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/master.mp4")"
FPS="$(python3 -c "print(${FRAMES}/${DUR})")"
echo "→ davomiylik ${DUR}s, ${FRAMES} kadr (fps=${FPS})"

extract() { # $1=tier $2=width
  rm -rf "$OUT/$1"; mkdir -p "$OUT/$1"
  ffmpeg -hide_banner -loglevel error -y -i "$TMP/master.mp4" \
    -vf "fps=${FPS},scale=$2:-2:flags=lanczos" -frames:v "$FRAMES" \
    -c:v libwebp -quality "$QUALITY" -compression_level 4 "$OUT/$1/f_%04d.webp"
}
echo "→ HD kadrlar (1920px)…"; extract hd 1920
COUNT="$(ls "$OUT/hd" | wc -l | tr -d ' ')"
TIERS="\"hd\": { \"width\": 1920, \"path\": \"assets/frames/hd/f_%04d.webp\" }"
if [[ $WITH_4K -eq 1 ]]; then
  echo "→ 4K kadrlar (3840px)…"; extract 4k 3840
  TIERS="$TIERS, \"4k\": { \"width\": 3840, \"path\": \"assets/frames/4k/f_%04d.webp\" }"
fi

cat > "$OUT/manifest.json" <<JSON
{ "count": $COUNT, "duration": $DUR, "tiers": { $TIERS } }
JSON
echo "✓ Tayyor: $COUNT kadr → $OUT ($(du -sh "$OUT" | cut -f1))"
