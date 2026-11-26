#!/usr/bin/env bash
# GTA 6 Clipper setup for Linux (Claude Code cloud sessions, Debian/Ubuntu).
# Builds whisper.cpp from source, makes the Python venv, downloads the models.
# Safe to re-run any time (it skips what's already there and updates yt-dlp).
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$SKILL_DIR/.venv"
MODELS="$SKILL_DIR/models"
BIN="$SKILL_DIR/bin"
mkdir -p "$MODELS" "$BIN"
ok()   { printf "  [ok]      %s\n" "$1"; }
inst() { printf "  [install] %s\n" "$1"; }
fail() { printf "  [MISSING] %s\n" "$1"; FAILED=1; }
FAILED=0
echo "GTA 6 Clipper setup (Linux)"

# 1. System tools: ffmpeg, a C++ toolchain for whisper.cpp, git, curl
NEED=()
for pair in "ffmpeg:ffmpeg" "cmake:cmake" "g++:g++" "git:git" "curl:curl"; do
  command -v "${pair%%:*}" >/dev/null 2>&1 || NEED+=("${pair##*:}")
done
if (( ${#NEED[@]} )); then
  inst "${NEED[*]}"
  SUDO=""; [[ $EUID -ne 0 ]] && SUDO="sudo"
  ($SUDO apt-get update -qq && $SUDO apt-get install -y -qq "${NEED[@]}") >/dev/null 2>&1 || fail "apt packages: ${NEED[*]}"
fi
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg" || fail "ffmpeg"

# 2. whisper.cpp (local speech -> text), built once into $BIN
WHISPER_CLI="$BIN/whisper-cli"
if [[ ! -x "$WHISPER_CLI" ]]; then
  inst "whisper.cpp (building from source, a few minutes)"
  SRC="$(mktemp -d)"
  if git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp "$SRC/whisper.cpp" \
     && cmake -S "$SRC/whisper.cpp" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
          -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF >/dev/null \
     && cmake --build "$SRC/build" -j"$(nproc)" --target whisper-cli >/dev/null; then
    cp "$SRC/build/bin/whisper-cli" "$WHISPER_CLI"
  fi
  rm -rf "$SRC"
fi
[[ -x "$WHISPER_CLI" ]] && ok "whisper-cli" || fail "whisper.cpp build"

# 3. uv + Python environment: yt-dlp (always latest), OpenCV, Pillow, numpy
if ! command -v uv >/dev/null 2>&1 && [[ ! -x "$HOME/.local/bin/uv" ]]; then
  inst "uv"; python3 -m pip install -q --user uv >/dev/null 2>&1 || fail "uv"
fi
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"
if [[ ! -x "$VENV/bin/python" ]]; then inst "Python 3.12 environment"; "$UV" venv -q --python 3.12 "$VENV" >/dev/null 2>&1 || "$UV" venv -q "$VENV" >/dev/null 2>&1; fi
"$UV" pip install --python "$VENV/bin/python" -q -U "yt-dlp[default]" opencv-python-headless pillow numpy >/dev/null 2>&1 \
  && ok "Python packages (yt-dlp, opencv, pillow, numpy)" || fail "Python packages"

# 4. Whisper small.en model (~465 MB)
WHISPER_MODEL="$MODELS/ggml-small.en.bin"
if [[ ! -s "$WHISPER_MODEL" ]]; then
  inst "Whisper small.en model (~465 MB)"
  curl -fL -s -o "$WHISPER_MODEL" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin || { rm -f "$WHISPER_MODEL"; fail "whisper model"; }
fi
[[ -s "$WHISPER_MODEL" ]] && ok "Whisper model"

# 5. YuNet face detector (~230 KB) used to find the facecam box
YUNET="$MODELS/face_detection_yunet_2023mar.onnx"
# (a tiny file is a Git LFS pointer, not the model)
[[ -f "$YUNET" && $(stat -c%s "$YUNET") -lt 100000 ]] && rm -f "$YUNET"
if [[ ! -s "$YUNET" ]]; then
  inst "YuNet face detector"
  curl -fL -s -o "$YUNET" https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx || { rm -f "$YUNET"; fail "YuNet model"; }
fi
[[ -s "$YUNET" ]] && ok "Face detector" || fail "Face detector"

# 6. A heavy caption font (any of these works)
FONT=""
for f in /usr/share/fonts/opentype/inter/Inter-Black.otf /usr/share/fonts/opentype/inter/Inter-ExtraBold.otf \
         /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf /usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf \
         /usr/share/fonts/truetype/freefont/FreeSansBold.ttf; do
  [[ -f "$f" ]] && FONT="$f" && break; done
[[ -n "$FONT" ]] && ok "Caption font ($(basename "$FONT"))" || echo "  [warn]    No bold font found, captions use a tiny default font (apt-get install fonts-dejavu-core)"

# 7. Disk space
FREE_GB=$(df -BG --output=avail "$SKILL_DIR" | tail -1 | tr -dc 0-9)
(( FREE_GB < 3 )) && echo "  [warn]    Only ${FREE_GB} GB free. Each stream needs ~0.5-1 GB while it runs." || ok "Disk space (${FREE_GB} GB free)"

cat > "$SKILL_DIR/config.json" <<EOF
{"whisper_model": "$WHISPER_MODEL", "yunet_model": "$YUNET", "whisper_cli": "$WHISPER_CLI", "font": "$FONT"}
EOF

if [[ $FAILED -eq 0 ]]; then
  date > "$SKILL_DIR/.ready"
  echo; echo "READY. Say: clip this stream <link>"
else
  rm -f "$SKILL_DIR/.ready"; echo; echo "NOT READY: fix the [MISSING] items above and re-run setup."; exit 1
fi
