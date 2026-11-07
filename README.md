# Overfort Sim

**Write Verse. Compile to WebAssembly. Step inside your code.**

A local, single-player creative-island simulator for learning Verse through
editable 3D maps, devices, movement, and reactions. Original procedural visuals
borrow the bright, low-poly creative-island feel. Other characters are local
bots. There is no multiplayer, account, cloud compiler, or external asset CDN.

Source: [rudi-cilibrasi/openfort-sim](https://github.com/rudi-cilibrasi/openfort-sim).
The application name remains **Overfort Sim**.

Play the [3D simulator](https://rudi-cilibrasi.github.io/openverse-docs/sim/),
or switch to the [text playground](https://rudi-cilibrasi.github.io/openverse-docs/demo/)
to explore the same Verse language through printed output. Both are introduced
on the [OpenVerse docs landing page](https://rudi-cilibrasi.github.io/openverse-docs/).
Each toy supplies its own examples and API.

## Run locally

Requires Node.js 20.19+ or 22.12+ and npm. In this repository:

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. The pinned WASM compiler and prebuilt WASM runtime
are included, checked by SHA-256, and copied into the served directory on start.
Emscripten and Lean are **not needed to play or edit maps**.

```sh
npm run build       # static production site in dist/
npm run preview     # serve that build on localhost:5173
npm test            # real Chromium browser tests
```

Tests use `/usr/bin/google-chrome` by default; override `CHROMIUM_PATH` for another
Chromium executable. They start their own server on port 5174. Serve the contents
of `dist/` from any static web server; `.wasm` should have MIME type
`application/wasm`. Use HTTP, not `file://`. No COOP/COEP or service worker required.
Nothing is published by these commands.

## Public browser hosting

The OpenVerse docs site pins this repository as its `sim/` submodule and publishes
the built simulator at https://rudi-cilibrasi.github.io/openverse-docs/sim/ beside
the text playground. Its deployment checks both toys before publishing.

This repository's GitHub Actions workflow also builds and tests every push to `main`. When GitHub
Pages is enabled with **GitHub Actions** as its publishing source, it also
deploys the verified build to https://rudi-cilibrasi.github.io/openfort-sim/.
Enable that source in **Settings → Pages**, then run the **Build, test, and
publish** workflow or push a new commit. If Pages is not configured, the
workflow reports the setup link and still validates the source build.

## Play and edit

- **WASD / arrows:** move. **Space:** jump. **Shift:** sprint.
- **Drag:** turn the camera. **Scroll:** zoom. **Click:** fire at a bot or target.
- **E:** interact with the nearest button. Purple circles are trigger zones;
  green crystals are collectibles. Touch controls appear on small screens.
- Import a custom `.verse` file with the ↑ button, or edit `island.verse`, then **Compile & play** or Ctrl/⌘+Enter. The map restarts
  from your new code. Invalid source leaves the previous map playable.
- **Inspect objects** and click a world object to reveal its Verse declaration.
  Event-trace entries reveal handler lines when `Trace` is used.
- **Restart** clears score and event history. Source edits save separately for
  each example in this browser. Export source or the compiled `map.wasm`.

The [examples/](examples/) directory contains the actual `.verse` source files for all three starter maps:

| Island            | Experiment                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Switchback Island | Change gate dimensions and rewards; interact to open a gate, enter a trigger, collect a crystal. |
| Skyline Sprint    | A Verse loop builds raised platforms; a trigger launches the player toward the finish.           |
| Bot Yard          | Moving bots and target hit events update Verse state and check a victory condition.              |

## What compiles to WASM

The compiler and execution VM are adapted from the sibling
[openverse-online-demo](https://github.com/rudi-cilibrasi/openverse-online-demo). The actual flow is:

```text
edited Verse + simulator API + generated Main
                ↓
OpenVerse lexer, parser, elaborator and type checker (Lean compiled to WASM)
                ↓
checked OVBC bytecode
                ↓
browser linker embeds bytecode into a WASM build of the OpenVerse C VM
                ↓
map.wasm exports map_run(history, fuel)
                ↓
WASM executes Verse → validated world commands → Three.js scene
```

**Each map is an executable WebAssembly module containing its compiled program.**
This is a VM-based WASM target, not direct ahead-of-time lowering of every Verse
operation to WASM instructions. The downloaded file has a WASM header, executable
runtime code, embedded OVBC, and an `overfort.source` custom section containing
its source. Its `map_run` export actually runs that embedded program. The tests
instantiate the downloaded artifact independently and execute its stateful
handler, as well as exercising the normal browser controls.

The browser's dedicated worker compiles and runs Verse. JavaScript never parses
or evaluates Verse expressions. JavaScript provides the renderer, physics,
local bot locomotion, command validation, and UI. No source goes to a server.
The worker has a 30-second watchdog and can be terminated. Runtime work is
bounded to 3,000,000 evaluation steps per input.

For deterministic Verse state, `map_run` replays the bounded event history with a
fresh object heap, then the browser applies only commands after the newest
boundary. State changes and transactional rollback therefore use OpenVerse's
actual VM semantics. Inputs are injected into the typed `OFEvents():[]string`
host stub by `wasm/map-runtime.c`; other compiled functions are not rewritten.
A successful compile or event is committed only after command validation.

## Author a map

The [simulator API](web/sim-api.verse) is real Verse source supplied to the
compiler. The entry class is named `island`; the host generates `Main()`.

```verse
Reward:int = 50

island := class(creative_device):
    var Opened:logic = false

    OnBegin<override>():void =
        World("My first island")
        PlayerSpawn(0, 700, 0)
        Prop("wall", "wall", 0, -200, 0, 600, 50, 300, "cyan")
        Button("switch", 0, 300, 0, "Open the wall")

    OnEvent<override>(Event:string):void =
        if (Event = "interact:switch", not Opened?):
            set Opened = true
            Hide("wall")
            Score(Reward)
            Message("That reaction ran in WebAssembly!")
```

All coordinates and dimensions are **integer centimeters**. X goes right, Y
across the map, Z up. Props are positioned at their bottom center. The API
button in the app describes every call. Function and event details are in
[docs/API.md](docs/API.md).

## Scope

This is an independent educational simulator, **not a Fortnite client or UEFN**.
It runs custom maps written against this toy's API and the pinned OpenVerse
subset. It cannot import arbitrary Epic maps, assets, or UEFN device SDK code.

The subset supports integers, strings, arrays, classes, mutable fields, loops,
conditions, failure contexts, and transactional rollback. It does not support
floats, Epic's `@editable` attributes, `Subscribe` callbacks, `spawn`, `Sleep`,
concurrency, or the Fortnite device SDK. `OnEvent(Event:string)` is this toy's
explicit event-routing API, not a claim of Epic API compatibility.

Physics use simple collisions and ramps on a flat island. Bots support local
patrol, wander, and idle behaviors; hit detection is a ray cast, with no
networking or competitive AI. The island's background terrain, trees, sky,
water, and the explorer are renderer decorations; objects placed by the map
are produced by Verse commands.

Limits: 64 KiB source, 512 KiB compiled OVBC, 400 map objects, 256 events per
session, 32 KiB serialized event history, integer command arguments within
±1,000,000, positive prop sizes up to 10,000 cm. Restart resets history.
These limits and unsupported language features produce visible errors.

## Research

The design follows Epic's documented pattern: place a Verse-authored creative
device, configure it, run `OnBegin`, bind input events to handlers, and change
world state in those handlers. See the dated source notes in
[docs/RESEARCH.md](docs/RESEARCH.md) for the difference between Epic's real APIs
and the teaching bridge here.

## Rebuild the toolchain

Normal builds use checked-in binaries so this repository works independently.
The [vendor provenance](vendor/README.md) records the exact upstream pins and
compiler checksums.

With Emscripten installed:

```sh
npm run build:runtime  # rebuild C VM + adapter and refresh binary checksums
npm run build
```

The Lean compiler binary is the unmodified output of the pinned
`openverse-online-demo` build. To regenerate it from source, with that sibling
checkout available and its own build dependencies installed:

```sh
./scripts/rebuild-compiler.sh
```

Fortnite, Unreal Engine, and Verse are trademarks of Epic Games. This project
is not affiliated with or endorsed by Epic Games.
