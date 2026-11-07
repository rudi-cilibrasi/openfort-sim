# Toolchain provenance

`sources.json` records the exact OpenVerse and Lean revisions used by the
sibling openverse-online-demo toolchain. `checksums.json` pins the binary files
we serve. The application verifies them before every dev/production build.

- `compiler/compiler.{js,wasm}`: unmodified Emscripten output copied from the
  local openverse-online-demo/dist/wasm. Its Lean entry point is
  openverse-online-demo/wasm/Compiler.lean; its build script uses OpenVerse's
  parser, Front.compileTops, and OVBC encoding. See that project's compiler
  build adapter and its Lean runtime patch. `scripts/rebuild-compiler.sh` regenerates
  and checks the pinned source identity before copying these outputs.
- `openverse/runtime/{src,include}`: the VM sources of the pinned OpenVerse
  commit, copied without modifications. OpenVerse builds for wasm32 unpatched
  since openverse#124.
  Upstream: https://github.com/rudi-cilibrasi/openverse
- `runtime/map-runtime.{js,wasm}`: Emscripten output generated from the above VM
  sources and this repository's `wasm/map-runtime.c`. Regenerate with
  `npm run build:runtime`.

The pinned OpenVerse checkout did not include a LICENSE file. No license text
has been invented or attributed to it here. Preserve upstream attribution.
