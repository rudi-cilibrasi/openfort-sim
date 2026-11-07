# Simulator API

Define `island := class(creative_device)` and override `OnBegin():void` and
`OnEvent(Event:string):void` with `<override>`. A generated `Main` constructs
one island, calls OnBegin, then dispatches the current event history in order.
The API is provided as [Verse source](../web/sim-api.verse).

All coordinates, dimensions, radii and velocities are integer centimeters
(or cm/s for LaunchPlayer). X is right, Y is depth, Z is up. A prop's position
is its bottom center. The playable flat island extends approximately 3,800 cm
from the origin in each horizontal direction; leaving it respawns the explorer. OnBegin must place all initial map objects.

| Function                                               | Result                                                                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `World(Name:string)`                                   | Set the world title.                                                              |
| `PlayerSpawn(X:int,Y:int,Z:int)`                       | Set the initial player position.                                                  |
| `Prop(Id,Kind,X,Y,Z,W,D,H,Color)`                      | Create a map prop. Id, Kind, Color are strings; all remaining arguments are ints. |
| `Button(Id:string,X:int,Y:int,Z:int,Label:string)`     | A nearby E interaction emits `interact:Id`.                                       |
| `Trigger(Id:string,X:int,Y:int,Z:int,Radius:int)`      | Emits `enter:Id` / `exit:Id` on a boundary crossing. Height tolerance is 210 cm.  |
| `Pickup(Id:string,X:int,Y:int,Z:int)`                  | Touch emits `collect:Id` once per session. Call Hide in its handler.              |
| `Bot(Id:string,X:int,Y:int,Z:int,Behavior:string)`     | Behavior: `patrol`, `wander`, `idle`. Clicking it emits `hit:Id`.                 |
| `Hide(Id:string)` / `Show(Id:string)`                  | Change visibility and collision.                                                  |
| `MoveTo(Id:string,X:int,Y:int,Z:int,Milliseconds:int)` | Animate from current position to destination.                                     |
| `SetColor(Id:string,Color:string)`                     | Recolor an object's meshes.                                                       |
| `Score(Points:int)`                                    | Add (or subtract) points.                                                         |
| `Message(Text:string)`                                 | Display an in-world message.                                                      |
| `Finish(Text:string)`                                  | Show a completion overlay; the player can keep exploring.                         |
| `TeleportPlayer(X:int,Y:int,Z:int)`                    | Move the player immediately.                                                      |
| `LaunchPlayer(Strength:int)`                           | Set upward velocity in cm/s.                                                      |
| `Trace(Line:int,Label:string)`                         | Highlight a line and create a clickable trace entry.                              |
| `Print(Text:string)`                                   | Write to the event trace, using OpenVerse's transactional output.                 |

Kinds: `floor`, `wall`, `crate`, `tree`, `rock`, `house`, `tower`, `target`,
`ramp`. Floors, walls, crates, houses, towers and ramps are solid. Targets
emit `hit:Id` when clicked. Ramps rise toward negative Y. Decorative tree and
rock dimensions are approximate. All map object IDs must be unique strings
of 1–48 letters, digits, spaces, underscores or hyphens.

Colors: `grass`, `sand`, `stone`, `cyan`, `coral`, `wood`, `violet`, `white`, or
`"#rrggbb"`. Unrecognized color names use stone. Labels, messages and IDs must
stay on one line without tab characters because WASM output uses a tab-delimited
command protocol. The renderer inserts text safely with textContent or canvas.

## Executing an exported artifact

`map.wasm` embeds the program and VM. Use the matching `map-runtime.js` companion
from `dist/wasm/` to supply its Emscripten imports and initialize the runtime.
For Node, save the companion as `.cjs` (the project uses ES modules):

```js
const createRuntime = require("./map-runtime.cjs");
const fs = require("node:fs");
const vm = await createRuntime({
  wasmBinary: fs.readFileSync("map.wasm"),
  print: console.log,
  printErr: console.error,
});
const run = vm.cwrap("map_run", "number", ["string", "number"]);
const code = run("interact:switch\nenter:garden", 3000000);
```

Use an empty history to run OnBegin alone. Each invocation has fresh Verse
state and executes the supplied history. Output contains `@of` commands and
`@of\tboundary` separators. Exit 0 means success; nonzero results are errors
and suppress partial world output. Read the source with
`WebAssembly.Module.customSections(module, 'openfort.source')`.
