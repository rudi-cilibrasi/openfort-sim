# Verse / UEFN research

Inspected 7 November 2026, before implementation. Primary sources only.

1. [Epic: creative_device](https://dev.epicgames.com/documentation/fortnite/verse-api/fortnitedotcom/devices/creative_device)
   describes deriving a Verse-authored device, compiling it into the content
   browser, placing instances on an island, and running custom logic in OnBegin.
   Our `island` class mirrors the lifecycle concept; the browser supplies its
   construction and entry point.
2. [Epic: Coding Device Interactions](https://dev.epicgames.com/documentation/en-us/fortnite/coding-device-interactions-in-verse)
   shows button interactions invoking Verse functions through event subscription,
   including a button that spawns an item. Our buttons, zones, pickups, and hits
   send explicit strings to OnEvent. OpenVerse lacks first-class callbacks, so
   this simulator does not pretend to implement Subscribe.
3. [Epic: Editable Properties](https://dev.epicgames.com/documentation/en-us/fortnite/editable-properties-in-verse)
   explains @editable properties, references to placed devices/props, and
   modifying a device's behavior. This toy puts ordinary Verse constants at the
   start of its examples so learners can edit them and recompile; @editable is
   not implemented by its compiler.
4. [Epic: creative_prop](https://dev.epicgames.com/documentation/fortnite/verse-api/fortnitedotcom/devices/creative_prop?lang=en-US)
   documents hiding, showing, and moving props. Our Hide/Show/MoveTo functions
   are deliberately smaller teaching functions. Coordinates follow the cm
   convention, but duration is integer milliseconds because the OpenVerse
   compiler of that date supported neither floats nor suspending functions.
   (OpenVerse has floats now; the API keeps integers so existing maps still work.)
5. [Epic: button_device](https://dev.epicgames.com/documentation/en-us/fortnite/verse-api/fortnitedotcom/devices/button_device)
   describes the agent-bearing InteractedWithEvent. Our single-player button
   emits `interact:Id` without an agent argument.

## Existing implementation inspected

The sibling `openverse-online-demo` provides a pinned OpenVerse Lean compiler
compiled with Emscripten, and a separate C bytecode VM compiled to WASM. Its
service worker accepts a source file, produces OVBC, copies it into the VM, and
returns output. It has no graphics or game input APIs.

Openfort reuses the actual compiler and VM sources, replaces the text-only
adapter with an embedded-map runtime, adds a WASM linker, and uses a dedicated
worker so compilation can be terminated by a watchdog. Its world protocol is
implemented in Verse, preserving the real compiler's parsing, type checking,
state, loops, conditions, and rollback behavior. The renderer consumes output;
it does not infer or simulate code behavior by pattern matching Verse text.

No Fortnite assets were fetched. All visible scenery, props and characters are
procedural meshes. The scope is an educational creative-island simulator.
