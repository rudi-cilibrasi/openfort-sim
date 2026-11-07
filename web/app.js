import "./style.css";
import { World } from "./world.js";
import { examples } from "./examples.js";
import { createEditor } from "./editor.js";
import api from "./sim-api.verse?raw";
const $ = (s) => document.querySelector(s);
// Read earlier browser drafts without losing edits when the app name changes.
// All current storage writes use the Openfort namespace below.
const LEGACY_STORAGE_PREFIX = "overfort:";
const stored = (key) => {
  try {
    const current = localStorage.getItem("openfort:" + key);
    if (current !== null) return current;
    const previous = localStorage.getItem(LEGACY_STORAGE_PREFIX + key);
    if (previous !== null) save(key, previous);
    return previous;
  } catch {
    return null;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem("openfort:" + key, value);
  } catch {}
};
let selected = stored("selected") in examples ? stored("selected") : "island";
let worker,
  sequence = 0,
  pending = new Map(),
  compiling = false,
  lastApplyFailed = false,
  lastCompileStatus = "Starting compiler…",
  compiledSource = "",
  wasm = null,
  applied = 0,
  traceCount = 0;
let editor, world;
const escape = (s) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function hasPendingEdits() {
  return editor && editor.get() !== compiledSource;
}
function setText(selector, text) {
  const element = $(selector);
  if (element.textContent !== text) element.textContent = text;
}
function syncEditStatus() {
  const dirty = hasPendingEdits();
  $("#dirty").hidden = !dirty;
  $("#pending-edits").hidden = !world?.ready || !(dirty || lastApplyFailed);
  $("#pending-edits").dataset.state = lastApplyFailed ? "error" : "pending";
  setText(
    "#pending-message",
    compiling
      ? "Applying your edits and restarting the island…"
      : lastApplyFailed
        ? "Edits weren't applied. The previous map is still running; check the error above the editor."
        : "Your edits aren't running yet. Apply them to change the map.",
  );
  setText("#compile-label", compiling ? "Applying…" : "Apply edits & restart");
  $("#apply-edits").disabled = compiling;
  $("#restart").disabled = compiling;
  $("#restart").title = dirty
    ? "Apply pending edits and restart the map"
    : "Restart the current map";
  $("#restart").setAttribute(
    "aria-label",
    dirty ? "Apply edits and restart map" : "Restart map",
  );
  if (!compiling)
    setText(
      "#compile-status",
      lastApplyFailed
        ? world?.ready
          ? "Apply failed · previous map running"
          : "Could not apply edits"
        : dirty
          ? "Edits not applied"
          : lastCompileStatus,
    );
}
function addTrace(text, kind = "reaction", line) {
  if (!traceCount) $("#trace").textContent = "";
  traceCount++;
  const row = document.createElement("div");
  row.className = "trace-row";
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], { hour12: false });
  const el = document.createElement(line ? "button" : "span");
  el.className = kind;
  el.textContent = text;
  if (line) el.onclick = () => editor.reveal(line);
  row.append(time, el);
  $("#trace").append(row);
  while ($("#trace").children.length > 150) $("#trace").firstChild.remove();
  $("#trace").scrollTop = $("#trace").scrollHeight;
}
function showError(text) {
  $("#diagnostic").hidden = false;
  $("#diagnostic").textContent = text;
  $("#compile-status").textContent = "Check your source";
  addTrace(text.split("\n")[0], "error");
  const m = text.match(/(?:^|:)(\d+):\d+:/);
  if (m) editor.reveal(Number(m[1]));
}
function request(type, extra = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(
        new Error(
          "The WASM worker exceeded 30 seconds and was stopped. Compile again to restart it.",
        ),
      );
      worker.terminate();
      worker = null;
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Worker restarted. Compile your map again."));
      }
      pending.clear();
      world.active = false;
    }, 30000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, ...extra });
  });
}
function startWorker() {
  if (worker) return;
  worker = new Worker(`${import.meta.env.BASE_URL}runner-worker.js`);
  worker.onmessage = ({ data }) => {
    if (data.type === "phase") {
      $("#compile-status").textContent = data.text;
      $("#loading-phase").textContent = data.text;
      return;
    }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    clearTimeout(p.timer);
    if (data.type === "error") p.reject(new Error(data.text));
    else p.resolve(data);
  };
  worker.onerror = (e) => {
    const error = new Error(
      `WASM worker unavailable: ${e.message}. Run npm run build:runtime and reload.`,
    );
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
    worker.terminate();
    worker = null;
  };
}
const counts = {
  world: 1,
  spawn: 3,
  prop: 9,
  button: 5,
  trigger: 5,
  pickup: 4,
  bot: 5,
  hide: 1,
  show: 1,
  move: 5,
  color: 2,
  score: 1,
  message: 1,
  teleport: 3,
  launch: 1,
  finish: 1,
  trace: 2,
};
const numeric = {
  spawn: [0, 1, 2],
  prop: [2, 3, 4, 5, 6, 7],
  button: [1, 2, 3],
  trigger: [1, 2, 3, 4],
  pickup: [1, 2, 3],
  bot: [1, 2, 3],
  move: [1, 2, 3, 4],
  score: [0],
  teleport: [0, 1, 2],
  launch: [0],
  trace: [0],
};
function parseOutput(lines) {
  const batches = [[]];
  let created = 0;
  const ids = new Set();
  for (const text of lines) {
    if (!text.startsWith("@of\t")) {
      batches.at(-1).push(["print", text]);
      continue;
    }
    const [op, ...args] = text.slice(4).split("\t");
    if (op === "boundary") {
      batches.push([]);
      continue;
    }
    if (!(op in counts) || args.length !== counts[op])
      throw new Error(
        "Malformed simulator command. Text and IDs must stay on one line, without tabs.",
      );
    for (const i of numeric[op] ?? [])
      if (!/^-?\d+$/.test(args[i]) || Math.abs(Number(args[i])) > 1000000)
        throw new Error(
          `Invalid ${op} number: ${args[i]}. Use integer centimeters within ±1,000,000.`,
        );
    if (["prop", "button", "trigger", "pickup", "bot"].includes(op)) {
      if (++created > 400)
        throw new Error(
          "This toy supports up to 400 map objects. Reduce your loop range.",
        );
      if (!/^[\w -]{1,48}$/.test(args[0]))
        throw new Error(
          "Object IDs need 1–48 letters, numbers, spaces, underscores or hyphens.",
        );
      if (ids.has(args[0])) throw new Error(`Duplicate object ID: ${args[0]}`);
      ids.add(args[0]);
    }
    if (
      op === "prop" &&
      (![
        "floor",
        "wall",
        "crate",
        "tree",
        "rock",
        "house",
        "tower",
        "target",
        "ramp",
      ].includes(args[1]) ||
        [5, 6, 7].some((i) => Number(args[i]) <= 0 || Number(args[i]) > 10000))
    )
      throw new Error(
        "Prop needs a supported kind and positive dimensions up to 10,000 cm.",
      );
    if (op === "trigger" && (Number(args[4]) <= 0 || Number(args[4]) > 10000))
      throw new Error("Trigger radius must be 1–10,000 cm.");
    if (op === "bot" && !["patrol", "wander", "idle"].includes(args[4]))
      throw new Error("Bot behavior must be patrol, wander or idle.");
    if (op === "move" && Number(args[4]) < 0)
      throw new Error("MoveTo duration must be zero or positive.");
    batches.at(-1).push([op, ...args]);
  }
  if (!batches.at(-1).length) batches.pop();
  return batches;
}
function applyBatch(batch) {
  for (const command of batch) {
    const [op, ...v] = command;
    if (op === "trace") {
      editor.reveal(Number(v[0]));
      addTrace(v[1] + " · line " + v[0], "reaction", Number(v[0]));
    } else if (op === "print") addTrace("Print: " + v[0]);
    else {
      world.apply(command);
      if (
        [
          "move",
          "score",
          "hide",
          "show",
          "launch",
          "finish",
          "teleport",
        ].includes(op)
      )
        addTrace(`${op}(${v.join(", ")})`);
    }
  }
}
async function compile() {
  if (compiling) return;
  compiling = true;
  lastApplyFailed = false;
  world.active = false;
  $("#compile").disabled = true;
  $("#diagnostic").hidden = true;
  $("#victory").hidden = true;
  const source = editor.get();
  const start = performance.now();
  syncEditStatus();
  if (!world.ready) $("#loading").hidden = false;
  try {
    startWorker();
    const result = await request("compile", { source, api });
    const batches = parseOutput(result.output);
    await request("commit");
    world.clear();
    world.callbacks.score(0);
    applied = 0;
    for (const batch of batches) {
      applyBatch(batch);
      applied++;
    }
    wasm = result.wasm;
    compiledSource = source;
    $("#wasm-download").disabled = false;
    lastCompileStatus = `Compiled · ${((performance.now() - start) / 1000).toFixed(2)}s`;
    $("#artifact-info").textContent =
      `map.wasm · ${(wasm.length / 1024).toFixed(1)} KB`;
    addTrace(
      `island.verse → map.wasm · ${result.bytecodeSize.toLocaleString()} bytes of checked OVBC`,
    );
    world.active = true;
  } catch (err) {
    lastApplyFailed = true;
    showError(err.message);
    world.active = world.ready;
  } finally {
    compiling = false;
    $("#compile").disabled = false;
    $("#loading").hidden = true;
    syncEditStatus();
  }
}
let eventChain = Promise.resolve();
function dispatch(event) {
  eventChain = eventChain.then(async () => {
    if (compiling || !worker) return;
    const line =
      editor
        .get()
        .split("\n")
        .findIndex((s) => s.includes("OnEvent<override>")) + 1;
    addTrace(event, "event", line || undefined);
    try {
      const result = await request("event", { event });
      const batches = parseOutput(result.output);
      await request("accept-event");
      for (const batch of batches.slice(applied)) applyBatch(batch);
      applied = batches.length;
    } catch (err) {
      showError(err.message);
    }
  });
}
function sourceFor(key) {
  return stored("source:" + key) ?? examples[key].source;
}
function renderTabs() {
  const tabs = $(".map-tabs");
  tabs.textContent = "";
  for (const [key, item] of Object.entries(examples)) {
    const btn = document.createElement("button");
    btn.className = "map-tab" + (key === selected ? " active" : "");
    btn.dataset.map = key;
    btn.setAttribute("aria-pressed", key === selected ? "true" : "false");
    btn.innerHTML = `<span class="map-thumb">${{ island: "⌂", parkour: "▰", range: "◎" }[key]}</span><span><strong>${item.title}</strong><small>${item.tag}</small></span>`;
    btn.onclick = async () => {
      if (compiling) return;
      selected = key;
      save("selected", key);
      editor.set(sourceFor(key));
      $("#lesson-text").textContent = examples[key].lesson;
      renderTabs();
      await compile();
    };
    tabs.append(btn);
  }
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function downloadSource() {
  download(new Blob([editor.get()], { type: "text/plain" }), "island.verse");
}
function modal(html) {
  $("#modal-content").innerHTML = html;
  $("#modal").showModal();
  world.keys.clear();
}
const scope = `<h2>A small world for learning Verse.</h2><p>Openfort Sim is an independent, single-player learning toy with original low-poly visuals inspired by creative island games. Only local bots appear. No Epic assets, accounts, network players, or Fortnite installation are used.</p><h3>What actually compiles</h3><p>The pinned OpenVerse compiler runs in WebAssembly. It parses and type-checks your complete map plus the simulator API to OVBC. The browser then links that bytecode into a WebAssembly build of the OpenVerse C VM. The resulting <code>map.wasm</code> embeds your program and exports <code>map_run</code>. This is a VM-based executable WASM artifact; it does not compile each Verse operation into a native WASM instruction.</p><h3>Simulator API and language coverage</h3><p>This is OpenVerse's integer-based Verse subset, with classes, mutable state, loops, conditions, and transactional failure. It does not run arbitrary UEFN projects or Epic's device SDK. Floats, <code>@editable</code>, <code>Subscribe</code> callbacks, <code>spawn</code>, <code>Sleep</code>, and concurrency are not implemented. Use <code>OnEvent</code> for this toy's input events. Bot movement and physics are local JavaScript/Three.js simulation; map construction and reaction logic execute inside WASM.</p><p>To keep Verse state deterministic, each input replays the event history in WASM. Only new world commands are applied. Sessions allow 256 events, 400 objects, 64 KiB of source, and a bounded evaluator budget. Restart clears the event history.</p><h3>Research behind the design</h3><p>Epic places Verse-authored <a href="https://dev.epicgames.com/documentation/fortnite/verse-api/fortnitedotcom/devices/creative_device" target="_blank" rel="noreferrer">creative devices</a> in an island and starts them with <code>OnBegin</code>. <a href="https://dev.epicgames.com/documentation/en-us/fortnite/coding-device-interactions-in-verse" target="_blank" rel="noreferrer">Device interactions</a> connect events to Verse handlers; <a href="https://dev.epicgames.com/documentation/en-us/fortnite/editable-properties-in-verse" target="_blank" rel="noreferrer">editable properties</a> configure the devices. Here, explicit simulator functions and OnEvent routing let you explore the same cause-and-effect pattern in a browser.</p>`;
function apiModal() {
  const rows = [
    [
      "World(Name), PlayerSpawn(X,Y,Z)",
      "Name the map and choose a start point.",
    ],
    [
      "Prop(Id,Kind,X,Y,Z,W,D,H,Color)",
      "Kinds: floor, wall, crate, tree, rock, house, tower, target, ramp. Coordinates mark the bottom center.",
    ],
    ["Button(Id,X,Y,Z,Label)", "Press E nearby → interact:Id"],
    ["Trigger(Id,X,Y,Z,Radius)", "Walk in/out → enter:Id, exit:Id"],
    ["Pickup(Id,X,Y,Z)", "Touch → collect:Id. Hide it in the handler."],
    ["Bot(Id,X,Y,Z,Behavior)", "patrol, wander, idle. Click to hit → hit:Id"],
    [
      "Hide(Id), Show(Id), SetColor(Id,Color)",
      "Change object visibility or color. Hidden objects have no collision.",
    ],
    ["MoveTo(Id,X,Y,Z,Milliseconds)", "Animate an object to a new location."],
    [
      "Score(Points), Message(Text), Finish(Text)",
      "Change score, show a message, or celebrate success.",
    ],
    [
      "TeleportPlayer(X,Y,Z), LaunchPlayer(Strength)",
      "Move the player or set vertical speed (cm/s).",
    ],
    [
      "Trace(Line,Label), Print(Text)",
      "Reveal a source line in the trace, or print a value.",
    ],
  ];
  modal(
    `<h2>The simulator API</h2><p>Define <code>island := class(creative_device)</code> with <code>OnBegin&lt;override&gt;():void</code> and <code>OnEvent&lt;override&gt;(Event:string):void</code>. The host calls these automatically. These functions are supplied as real Verse source to the WASM compiler.</p><p>All coordinates, sizes and speeds are <strong>integer centimeters</strong>. X goes right, Y goes across the map, Z goes up. IDs must be unique. Text and IDs must not contain tabs or newlines.</p><table><thead><tr><th>Function</th><th>Behavior</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td><code>${escape(a)}</code></td><td>${b}</td></tr>`).join("")}</tbody></table><p>Colors: <code>grass, sand, stone, cyan, coral, wood, violet, white</code> or a hex color such as <code>"#ff8844"</code>. A ramp rises toward negative Y. Geometry, characters and world decoration are original procedural meshes.</p><p><button id="download-api" class="inspect-button">Download simulator API source ↓</button></p>`,
  );
  $("#download-api").onclick = () =>
    download(new Blob([api], { type: "text/plain" }), "sim-api.verse");
}
try {
  world = new World($("#viewport"), {
    name: (text) => ($("#map-name").textContent = text),
    score: (n) => ($("#score").textContent = String(n).padStart(3, "0")),
    message: (text) => ($("#message").textContent = text),
    finish: (text) => {
      $("#victory strong").textContent = text;
      $("#victory").hidden = false;
    },
    interaction: (text) => {
      $("#interaction").hidden = !text;
      $("#interaction span").textContent = text ?? "";
    },
    event: dispatch,
    focus: () => ($("#play-hint").style.opacity = "0"),
    inspect: (id, kind) => {
      const lines = editor.get().split("\n");
      let index = lines.findIndex((line) => line.includes(`"${id}"`));
      if (index < 0)
        index = lines.findIndex((line) => line.includes(`"${kind}"`));
      if (index >= 0) editor.reveal(index + 1);
      addTrace(
        `${id} · ${kind} · (${index >= 0 ? "line " + (index + 1) : "generated object"})`,
        "reaction",
        index >= 0 ? index + 1 : undefined,
      );
      $("#message").textContent = `${id} · ${kind} · see its Verse declaration`;
    },
  });
  editor = createEditor(
    $("#editor"),
    sourceFor(selected),
    (source) => {
      save("source:" + selected, source);
      if (source === compiledSource) {
        lastApplyFailed = false;
        $("#diagnostic").hidden = true;
      }
      syncEditStatus();
    },
    compile,
  );
  renderTabs();
  $("#lesson-text").textContent = examples[selected].lesson;
  $("#compile").onclick = compile;
  $("#apply-edits").onclick = compile;
  $("#compile").disabled = false;
  $("#restart").onclick = async () => {
    if (compiling) return;
    if (hasPendingEdits() || !worker) {
      await compile();
      return;
    }
    try {
      const result = await request("reset");
      const batches = parseOutput(result.output);
      world.clear();
      world.callbacks.score(0);
      applied = 0;
      $("#victory").hidden = true;
      for (const batch of batches) {
        applyBatch(batch);
        applied++;
      }
      addTrace("Session restarted");
      lastApplyFailed = false;
      $("#diagnostic").hidden = true;
      world.active = true;
      syncEditStatus();
    } catch (err) {
      showError(err.message);
    }
  };
  $("#source-import").onclick = () => $("#source-file").click();
  $("#source-file").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 65536) {
      showError("Map source must be at most 64 KiB.");
      return;
    }
    editor.set(await file.text());
    $("#compile-status").textContent = "Imported · apply edits to play";
    addTrace(`Imported ${file.name}`);
    e.target.value = "";
  };
  $("#restore-example").onclick = () => {
    if (compiling) return;
    editor.set(examples[selected].source);
    compile();
  };
  $("#source-download").onclick = downloadSource;
  $("#download-nav").onclick = downloadSource;
  $("#wasm-download").onclick = () => {
    if (wasm)
      download(new Blob([wasm], { type: "application/wasm" }), "map.wasm");
  };
  $("#help").onclick = () =>
    modal(
      `<h2>Step inside your code.</h2><p>Choose an island, edit its Verse source, and click <strong>Apply edits &amp; restart</strong> above the editor (Ctrl/⌘ + Enter). Your program compiles and runs locally in WebAssembly.</p><ol><li>Click the world to focus it. Use <strong>WASD</strong> or arrow keys to move, <strong>Space</strong> to jump, and <strong>Shift</strong> to sprint.</li><li>Drag the world to turn the camera. Scroll to zoom. Click a target or bot to fire.</li><li>Walk close to an amber button and press <strong>E</strong>. Purple rings fire trigger events when you enter or leave. Green crystals fire collection events.</li><li>Watch the event trace. Select an entry with a line number to reveal its handler. Enable <strong>Inspect objects</strong>, then click an object to find its declaration.</li><li>After editing, the notice above the map tells you the edits are not running yet. Apply them there or above the editor. The restart circle also applies pending edits. If applying fails, the error stays visible and the previous map continues to run.</li></ol><p>Source edits save automatically on this browser. On a touch screen, drag to look and use the on-screen movement buttons. Downloads let you save your Verse and executable <code>map.wasm</code>.</p>`,
    );
  $("#limitations").onclick = () => modal(scope);
  $("#api-nav").onclick = apiModal;
  $("#islands-nav").onclick = () =>
    $(".map-tabs").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#close-modal").onclick = () => $("#modal").close();
  $("#modal").addEventListener("click", (e) => {
    if (e.target === $("#modal")) $("#modal").close();
  });
  $("#keep-playing").onclick = () => ($("#victory").hidden = true);
  $("#inspect-toggle").onclick = () => {
    world.inspect = !world.inspect;
    $("#inspect-toggle").classList.toggle("active", world.inspect);
    document.body.classList.toggle("inspect", world.inspect);
  };
  $("#clear-trace").onclick = () => {
    $("#trace").textContent = "";
    traceCount = 0;
  };
  $("#fullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await $(".game-panel").requestFullscreen();
    } catch (err) {
      addTrace(err.message, "error");
    }
  };
  for (const btn of document.querySelectorAll(".touch-controls button")) {
    btn.onpointerdown = (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      if (btn.dataset.key) world.keys.add(btn.dataset.key);
      else if (btn.dataset.action === "interact") world.interact();
      else if (btn.dataset.action === "shoot") {
        const r = $("#viewport").getBoundingClientRect();
        world.shoot({
          clientX: r.x + r.width / 2,
          clientY: r.y + r.height / 2,
        });
      }
    };
    const release = () => world.keys.delete(btn.dataset.key);
    btn.onpointerup = release;
    btn.onpointercancel = release;
  }
  // Read-only diagnostics for browser verification and local debugging.
  window.openfort = {
    snapshot: () => ({
      ...world.snapshot(),
      compiledSource,
      wasmSize: wasm?.length ?? 0,
    }),
    source: () => editor.get(),
    artifact: () => wasm?.slice(),
    project: (id) => {
      const o = world.objects.get(id);
      if (!o) return null;
      const p = o.group.position.clone();
      p.y += o.kind === "bot" ? 1.2 : o.h * 0.75;
      p.project(world.camera);
      const r = $("#viewport").getBoundingClientRect();
      return {
        x: r.x + ((p.x + 1) * r.width) / 2,
        y: r.y + ((1 - p.y) * r.height) / 2,
      };
    },
  };
  await compile();
} catch (err) {
  $("#loading").hidden = true;
  $("#compile-status").textContent = "Startup error";
  $("#diagnostic").hidden = false;
  $("#diagnostic").textContent = err.message;
}
