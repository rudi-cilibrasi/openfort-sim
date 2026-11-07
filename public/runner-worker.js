// Classic worker so the pinned Emscripten compiler can use importScripts.
importScripts("wasm/compiler.js", "wasm/map-runtime.js");
let compiler,
  runtimeBytes,
  linked,
  vm,
  lines = [],
  errors = [],
  history = [],
  candidate,
  candidateHistory;
let chain = Promise.resolve();
const phase = (text) => postMessage({ type: "phase", text });
async function bytes(name) {
  const r = await fetch(`wasm/${name}`);
  if (!r.ok)
    throw new Error(
      `Cannot load ${name} (HTTP ${r.status}). Run npm run build:runtime and reload.`,
    );
  return new Uint8Array(await r.arrayBuffer());
}
async function execute() {
  lines = [];
  errors = [];
  const code = vm.cwrap("map_run", "number", ["string", "number"])(
    history.join("\n"),
    3000000,
  );
  if (code)
    throw new Error(
      errors.join("\n") || `Map runtime exited with code ${code}.`,
    );
  return lines;
}
onmessage = (e) => {
  chain = chain.then(async () => {
    const { id, type, source, api, event } = e.data;
    try {
      if (type === "compile") {
        if (new TextEncoder().encode(source).length > 65536)
          throw new Error("Map source must be at most 64 KiB.");
        phase("Loading WASM compiler");
        if (!compiler)
          compiler = await VerseCompiler({
            wasmBinary: await bytes("compiler.wasm"),
            print: () => {},
            printErr: () => {},
          });
        runtimeBytes ||= await bytes("map-runtime.wasm");
        // Definitions precede the API to keep source error locations exact.
        const full =
          source +
          "\n" +
          api +
          '\nMain():void =\n    OFMap := island{}\n    OFMap.OnBegin()\n    Print("@of\\tboundary")\n    for (OFEvent : OFEvents()):\n        OFMap.OnEvent(OFEvent)\n        Print("@of\\tboundary")\n';
        phase("Compiling Verse");
        const status = compiler.cwrap("compile_verse", "number", [
          "string",
          "string",
        ])(full, "");
        const size = compiler._compiled_size();
        const ptr = compiler._compiled_data();
        const bytecode = compiler.HEAPU8.slice(ptr, ptr + size);
        if (status) {
          const { formatDiagnostic } = await import("./diagnostics.js");
          throw new Error(
            formatDiagnostic(source, new TextDecoder().decode(bytecode)),
          );
        }
        if (size > 512 * 1024) throw new Error("Compiled map exceeds 512 KiB.");
        phase("Linking map.wasm");
        const base = await OverfortRuntime({
          wasmBinary: runtimeBytes,
          print: () => {},
          printErr: () => {},
        });
        const { linkMap } = await import("./linker.js");
        const next = linkMap(
          runtimeBytes,
          base._map_program_ptr(),
          bytecode,
          source,
        );
        const nextVm = await OverfortRuntime({
          wasmBinary: next,
          print: (t) => lines.push(t),
          printErr: (t) => errors.push(t),
        });
        const previous = { vm, history };
        vm = nextVm;
        history = [];
        let output;
        try {
          output = await execute();
        } catch (err) {
          vm = previous.vm;
          history = previous.history;
          throw err;
        }
        candidate = { vm: nextVm, linked: next };
        vm = previous.vm;
        history = previous.history;
        postMessage({
          id,
          type: "compiled",
          output,
          wasm: next,
          bytecodeSize: size,
        });
      } else if (type === "commit") {
        if (!candidate) throw new Error("No compiled map to commit.");
        vm = candidate.vm;
        linked = candidate.linked;
        history = [];
        candidate = null;
        postMessage({ id, type: "committed" });
      } else if (type === "accept-event") {
        if (candidateHistory) history = candidateHistory;
        candidateHistory = null;
        postMessage({ id, type: "committed" });
      } else if (type === "event") {
        if (!vm) throw new Error("Compile a map first.");
        if (history.length >= 256)
          throw new Error(
            "Session reached 256 events. Restart the map to keep exploring.",
          );
        if (
          typeof event !== "string" ||
          event.length > 100 ||
          /[\r\n\t]/.test(event)
        )
          throw new Error("Invalid map event.");
        const previous = history;
        history = [...history, event];
        try {
          const output = await execute();
          candidateHistory = history;
          postMessage({ id, type: "executed", output, event });
        } finally {
          history = previous;
        }
      } else if (type === "reset") {
        history = [];
        postMessage({
          id,
          type: "executed",
          output: await execute(),
          reset: true,
        });
      }
    } catch (error) {
      postMessage({ id, type: "error", text: error.message || String(error) });
    }
  });
};
