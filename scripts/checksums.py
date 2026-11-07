#!/usr/bin/env python3
from pathlib import Path
import hashlib
import json
ROOT = Path(__file__).resolve().parent.parent
files = sorted([*(ROOT / 'vendor/compiler').glob('*'), *(ROOT / 'vendor/runtime').glob('*')])
(ROOT / 'vendor/checksums.json').write_text(json.dumps({str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}, indent=2) + '\n')
