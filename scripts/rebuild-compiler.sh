#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
DEMO_PATH="${OVERFORT_DEMO_PATH:-../openverse-online-demo}"
python3 - "$DEMO_PATH" <<'PY'
import json
import sys
from pathlib import Path
expected = json.loads(Path('vendor/sources.json').read_text())
actual = json.loads((Path(sys.argv[1]) / 'sources.json').read_text())
if expected != actual:
    sys.exit('Compiler source pins differ. Review and update provenance before rebuilding.')
PY
(cd "$DEMO_PATH" && ./scripts/build.sh)
cp "$DEMO_PATH/dist/wasm/compiler.js" "$DEMO_PATH/dist/wasm/compiler.wasm" vendor/compiler/
python3 scripts/checksums.py
node scripts/prepare-assets.mjs
