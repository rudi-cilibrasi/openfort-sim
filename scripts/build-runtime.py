#!/usr/bin/env python3
"""Build the map VM for WASM; copy the pinned, prebuilt Lean WASM compiler."""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/wasm'
OUT.mkdir(parents=True, exist_ok=True)
for name in ('compiler.js', 'compiler.wasm'):
    shutil.copyfile(ROOT / 'vendor/compiler' / name, OUT / name)
VM = ROOT / 'vendor/openverse/runtime'
sources = [VM / 'src' / (name + '.c') for name in ('arith', 'store', 'load', 'value', 'objects', 'prims', 'interp')]
cmd = ['emcc', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-I' + str(VM / 'include'), *map(str, sources), str(ROOT / 'wasm/map-runtime.c'),
       '-sMODULARIZE=1', '-sEXPORT_NAME=OpenfortRuntime', '-sENVIRONMENT=web,worker,node',
       '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=268435456',
       '-sTOTAL_STACK=16777216', '-sEXPORTED_RUNTIME_METHODS=["cwrap"]',
       '-sEXPORTED_FUNCTIONS=["_map_run","_map_program_ptr","_map_program_capacity","_malloc","_free"]',
       '-o', str(OUT / 'map-runtime.js')]
subprocess.run(cmd, check=True)
(ROOT / 'vendor/runtime').mkdir(exist_ok=True)
for name in ('map-runtime.js', 'map-runtime.wasm'):
    shutil.copyfile(OUT / name, ROOT / 'vendor/runtime' / name)
print('Built WASM map runtime + pinned WASM Verse compiler.')
