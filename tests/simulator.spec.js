import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function ready(page) {
  await page.goto("/");
  await expect(page.locator("#compile-status")).toContainText("Compiled", {
    timeout: 30000,
  });
}
async function setSource(page, text) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(text);
}
async function compile(page) {
  await page.locator("#compile").click();
  await expect(page.locator("#compile")).toBeEnabled({ timeout: 30000 });
}
async function moveToY(page, y) {
  await page.locator("#viewport").focus();
  await page.keyboard.down("w");
  try {
    await expect
      .poll(() => page.evaluate(() => window.openfort.snapshot().player.y), {
        timeout: 20000,
        intervals: [100],
      })
      .toBeLessThan(y);
  } finally {
    await page.keyboard.up("w");
  }
}

test("Openfort preserves earlier saved Verse drafts and keeps newer edits on reload", async ({
  page,
}) => {
  const saved = fs
    .readFileSync("examples/switchback-island.verse", "utf8")
    .replace('World("Switchback Island")', 'World("My saved island")');
  await page.addInitScript((source) => {
    localStorage.setItem("overfort:selected", "island");
    localStorage.setItem("overfort:source:island", source);
  }, saved);
  await ready(page);
  await expect(page).toHaveTitle("Openfort Sim — Step inside your Verse");
  await expect(
    page.getByRole("link", { name: "Openfort Sim home" }),
  ).toBeVisible();
  await expect(page.locator("#map-name")).toHaveText("My saved island");
  expect(await page.evaluate(() => openfort.source())).toBe(saved);
  expect(
    await page.evaluate(() => localStorage.getItem("openfort:source:island")),
  ).toBe(saved);

  const edited = saved.replace("Reward:int = 100", "Reward:int = 200");
  await setSource(page, edited);
  await page.reload();
  await expect(page.locator("#compile-status")).toContainText("Compiled", {
    timeout: 30000,
  });
  // The earlier storage entry must not overwrite the newer Openfort draft.
  expect(await page.evaluate(() => openfort.source())).toBe(edited);
  expect(
    await page.evaluate(() => localStorage.getItem("openfort:source:island")),
  ).toBe(edited);
});

test("real WASM artifact embeds edited Verse, executes independently, and keyboard actions run its stateful handler", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  const source = await page.evaluate(() => window.openfort.source());
  await setSource(page, source.replace("Reward:int = 100", "Reward:int = 175"));
  await compile(page);
  await expect(page.locator("#compile-status")).toContainText("Compiled");
  const wasm = Uint8Array.from(
    await page.evaluate(() => Array.from(window.openfort.artifact())),
  );
  expect(WebAssembly.validate(wasm)).toBe(true);
  const module = new WebAssembly.Module(wasm);
  expect(
    WebAssembly.Module.exports(module).some((e) => e.name === "map_run"),
  ).toBe(true);
  expect(
    new TextDecoder().decode(
      WebAssembly.Module.customSections(module, "openfort.source")[0],
    ),
  ).toContain("Reward:int = 175");
  // Execute the actual downloadable map.wasm with its companion Emscripten host.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "openfort-runtime-"));
  const companion = path.join(temp, "map-runtime.cjs");
  fs.copyFileSync("public/wasm/map-runtime.js", companion);
  const runtimeFactory = require(companion);
  let output = [];
  const vm = await runtimeFactory({
    wasmBinary: wasm,
    print: (s) => output.push(s),
    printErr: () => {},
  });
  expect(
    vm.cwrap("map_run", "number", ["string", "number"])(
      "interact:switch\ninteract:switch",
      3000000,
    ),
  ).toBe(0);
  expect(output.filter((s) => s === "@of\tscore\t175")).toHaveLength(1);
  expect(output.join("\n")).toContain("already open");
  fs.rmSync(temp, { recursive: true, force: true });
  await moveToY(page, 6.8);
  await expect(page.locator("#interaction")).toBeVisible();
  await page.keyboard.press("e");
  await expect(page.locator("#score")).toHaveText("175");
  await expect
    .poll(() =>
      page.evaluate(
        () => window.openfort.snapshot().objects.find((o) => o.id === "gate").z,
      ),
    )
    .toBeGreaterThan(4.2);
  await page.keyboard.press("e");
  await expect(page.locator("#message")).toContainText("already open");
  await expect(page.locator("#score")).toHaveText("175");
  await moveToY(page, -7.2);
  await expect(page.locator("#trace")).toContainText("enter:garden");
  await moveToY(page, -11.5);
  await expect(page.locator("#victory")).toBeVisible();
  await expect(page.locator("#score")).toHaveText("225");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.openfort.snapshot().objects.find((o) => o.id === "crystal")
            .visible,
      ),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});

test("edits are visibly pending and the restart circle applies a changed gate handler", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  const action = await page.locator("#compile").boundingBox();
  const code = await page.locator("#editor").boundingBox();
  expect(action.y + action.height).toBeLessThan(720);
  expect(action.y).toBeLessThan(code.y);

  const source = await page.evaluate(() => window.openfort.source());
  await moveToY(page, 6.8);
  await page.keyboard.press("e");
  await expect
    .poll(() =>
      page.evaluate(
        () => openfort.snapshot().objects.find((o) => o.id === "gate").z,
      ),
    )
    .toBeGreaterThan(4.2);

  const closed = source
    .replace(
      'MoveTo("gate", 0, -350, GateHeight + 40, 1200)',
      '# MoveTo("gate", 0, -350, GateHeight + 40, 1200)',
    )
    .replace("Gate open! Step into the garden.", "The gate stays closed.");
  await setSource(page, closed);
  await expect(page.locator("#pending-edits")).toBeVisible();
  await expect(page.locator("#compile-status")).toHaveText("Edits not applied");
  await expect(page.locator("#dirty")).toBeVisible();

  // This is the control the user tried: it must apply the draft, not reset the old VM.
  await page.locator("#restart").click();
  await expect(page.locator("#compile")).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("#pending-edits")).toBeHidden();
  await expect(page.locator("#dirty")).toBeHidden();
  expect(await page.evaluate(() => openfort.snapshot().compiledSource)).toBe(
    closed,
  );
  await moveToY(page, 6.8);
  await page.keyboard.press("e");
  await expect(page.locator("#message")).toHaveText("The gate stays closed.");
  expect(
    await page.evaluate(
      () => openfort.snapshot().objects.find((o) => o.id === "gate").z,
    ),
  ).toBe(0);

  await setSource(
    page,
    closed.replace("GateHeight:int = 420", "GateHeight:int = UnknownHeight"),
  );
  await page.locator("#apply-edits").click();
  await expect(page.locator("#compile")).toBeEnabled({ timeout: 30000 });
  await expect(page.locator("#diagnostic")).toContainText("UnknownHeight");
  await expect(page.locator("#pending-edits")).toContainText(
    "previous map is still running",
  );
  expect(await page.evaluate(() => openfort.snapshot().compiledSource)).toBe(
    closed,
  );

  // Applying a second valid edit changes the handler back again.
  await setSource(page, source);
  await compile(page);
  await expect(page.locator("#pending-edits")).toBeHidden();
  await expect(page.locator("#diagnostic")).toBeHidden();
  await moveToY(page, 6.8);
  await page.keyboard.press("e");
  await expect
    .poll(() =>
      page.evaluate(
        () => openfort.snapshot().objects.find((o) => o.id === "gate").z,
      ),
    )
    .toBeGreaterThan(4.2);
});

test("all starter maps compile, loop creates course, jump/launch and real aiming run in the browser", async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-map="parkour"]').click();
  await expect(page.locator("#compile")).toBeEnabled();
  await expect(page.locator("#map-name")).toHaveText("Skyline Sprint");
  expect(
    await page.evaluate(
      () =>
        window.openfort
          .snapshot()
          .objects.filter((o) => o.id.startsWith("step")).length,
    ),
  ).toBe(6);
  await moveToY(page, -6.2);
  await expect(page.locator("#trace")).toContainText("enter:launch");
  await expect(page.locator("#victory")).toBeVisible();
  await expect(page.locator("#score")).toHaveText("100");
  await page.locator('[data-map="range"]').click();
  await expect(page.locator("#compile")).toBeEnabled();
  await expect(page.locator("#map-name")).toHaveText("Bot Yard");
  const point = await page.evaluate(() => window.openfort.project("target2"));
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#score")).toHaveText("025");
  await expect(page.locator("#trace")).toContainText("hit:target2");
  for (let i = 2; i <= 4; i++) {
    const next = await page.evaluate(() => window.openfort.project("target3"));
    await page.mouse.click(next.x, next.y);
    await expect(page.locator("#score")).toHaveText(
      String(i * 25).padStart(3, "0"),
    );
  }
  await expect(page.locator("#victory")).toBeVisible();
  await expect(page.locator("#score")).toHaveText("100");
  await page.locator("#keep-playing").click();
  await page.locator("#restart").click();
  await expect(page.locator("#score")).toHaveText("000");
});

test("compiler diagnostics and bounded loops preserve the previous world, edits persist, and recompilation recovers", async ({
  page,
}) => {
  await ready(page);
  const source = await page.evaluate(() => window.openfort.source());
  await setSource(
    page,
    source.replace("GateHeight:int = 420", "GateHeight:int = UnknownHeight"),
  );
  await compile(page);
  await expect(page.locator("#diagnostic")).toContainText("UnknownHeight");
  await expect(page.locator("#diagnostic")).toContainText("island.verse:4:");
  expect(
    await page.evaluate(() => window.openfort.snapshot().objects.length),
  ).toBe(10);
  await setSource(
    page,
    `island := class(creative_device):\n    OnBegin<override>():void =\n        loop:\n            Print("still looping")\n`,
  );
  await compile(page);
  await expect(page.locator("#diagnostic")).toContainText("limit");
  await setSource(
    page,
    source
      .replace('World("Switchback Island")', 'World("My edited island")')
      .replace("GateHeight:int = 420", "GateHeight:int = 800"),
  );
  await compile(page);
  await expect(page.locator("#map-name")).toHaveText("My edited island");
  await expect(page.locator("#diagnostic")).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        window.openfort.snapshot().objects.find((o) => o.id === "gate").height,
    ),
  ).toBe(8);
  await page.reload();
  await expect(page.locator("#compile-status")).toContainText("Compiled");
  await expect(page.locator("#map-name")).toHaveText("My edited island");
});

test("mobile layout, touch movement, help, API and downloads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const before = await page.evaluate(() => window.openfort.snapshot().player.y);
  const button = page.locator('[data-key="KeyW"]');
  const rect = await button.boundingBox();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect(
    await page.evaluate(() => window.openfort.snapshot().player.y),
  ).toBeLessThan(before - 0.5);
  await page.locator("#help").click();
  await expect(page.locator("#modal")).toBeVisible();
  await page.locator("#close-modal").click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator("#wasm-download").click();
  const d = await downloadEvent;
  expect(d.suggestedFilename()).toBe("map.wasm");
  const content = fs.readFileSync(await d.path());
  expect(WebAssembly.validate(content)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
});

test("imported custom Verse changes geometry and failed conditions roll back WASM state and world output", async ({
  page,
}) => {
  await ready(page);
  const custom = `island := class(creative_device):
    var Count:int = 0
    OnBegin<override>():void =
        World("Imported custom map")
        PlayerSpawn(0, 300, 0)
        Prop("block", "crate", 400, 0, 0, 200, 200, 400, "violet")
        Button("test", 0, 200, 0, "Test rollback")
    OnEvent<override>(Event:string):void =
        if (Event = "interact:test"):
            if (set Count += 1, Score(999), Count > 10):
                Message("unreachable")
            else:
                Score(Count + 7)
                Message("Count after rollback: {Count}")
`;
  await page.locator("#source-file").setInputFiles({
    name: "custom.verse",
    mimeType: "text/plain",
    buffer: Buffer.from(custom),
  });
  await compile(page);
  await expect(page.locator("#map-name")).toHaveText("Imported custom map");
  expect(
    await page.evaluate(
      () => window.openfort.snapshot().objects.find((o) => o.id === "block").x,
    ),
  ).toBe(4);
  await page.locator("#viewport").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#score")).toHaveText("007");
  await expect(page.locator("#message")).toContainText(
    "Count after rollback: 0",
  );
  await page.keyboard.press("e");
  await expect(page.locator("#score")).toHaveText("014");
  // A syntactically valid map with invalid world output must not replace the working VM.
  await setSource(
    page,
    custom.replace(
      'Prop("block", "crate", 400, 0, 0, 200, 200, 400',
      'Prop("block", "crate", 400, 0, 0, -200, 200, 400',
    ),
  );
  await compile(page);
  await expect(page.locator("#diagnostic")).toContainText(
    "positive dimensions",
  );
  await page.locator("#viewport").focus();
  await page.keyboard.press("e");
  await expect(page.locator("#score")).toHaveText("021");
  await page.locator("#restore-example").click();
  await expect(page.locator("#compile")).toBeEnabled();
  await expect(page.locator("#map-name")).toHaveText("Switchback Island");
});

test("maps compute with floats and pass rounded results to the integer API", async ({
  page,
}) => {
  await ready(page);
  await setSource(
    page,
    `island := class(creative_device):
    OnBegin<override>():void =
        World("Float island")
        PlayerSpawn(0, 300, 0)
        Side:float = Sqrt(2.0) * 300.0
        if (W := Round[Side]):
            Prop("block", "crate", 400, 0, 0, W, 200, 200, "cyan")
            Message("{Side} rounds to {W}")
`,
  );
  await compile(page);
  await expect(page.locator("#map-name")).toHaveText("Float island");
  await expect(page.locator("#message")).toContainText(
    "424.26406871192853 rounds to 424",
  );
  expect(
    await page.evaluate(
      () =>
        window.openfort.snapshot().objects.find((o) => o.id === "block").width,
    ),
  ).toBeCloseTo(4.24, 6);
});

test("only edited maps are saved: opening a map or restoring its starter saves nothing", async ({
  page,
}) => {
  await ready(page);
  const saved = (map) =>
    page.evaluate((m) => localStorage.getItem("openfort:source:" + m), map);
  await page.locator('[data-map="parkour"]').click();
  await expect(page.locator("#compile")).toBeEnabled();
  await expect(page.locator("#map-name")).toHaveText("Skyline Sprint");
  expect(await saved("parkour")).toBeNull();
  const starter = fs.readFileSync("examples/skyline-sprint.verse", "utf8");
  const edited = starter.replace("Steps:int = 6", "Steps:int = 8");
  await setSource(page, edited);
  expect(await saved("parkour")).toBe(edited);
  await page.locator("#restore-example").click();
  await expect(page.locator("#compile")).toBeEnabled();
  expect(await page.evaluate(() => openfort.source())).toBe(starter);
  expect(await saved("parkour")).toBeNull();
});

test("saved copies of the starter maps before #10 give way to the current maps", async ({
  page,
}) => {
  // Earlier versions saved an unedited starter whenever its tab was opened.
  const bot = fs.readFileSync("examples/bot-yard.verse", "utf8");
  const sprint = fs.readFileSync("examples/skyline-sprint.verse", "utf8");
  const oldBot = bot
    .replace('click to fire.")', 'click to fire. Every hit runs Verse.")')
    .replace(
      'Hit {Hits}/{HitsToWin}.")',
      'Hit {Hits}/{HitsToWin}. This counter lives in Verse.")',
    );
  const oldSprint = sprint.replace(
    "You made it to the high platform!",
    "You landed on a Verse-generated platform.",
  );
  expect(oldBot).not.toBe(bot);
  expect(oldSprint).not.toBe(sprint);
  await page.addInitScript(
    ([oldBot, oldSprint]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("openfort:selected", "range");
      localStorage.setItem("openfort:source:range", oldBot);
      localStorage.setItem("overfort:source:parkour", oldSprint);
    },
    [oldBot, oldSprint],
  );
  await ready(page);
  await expect(page.locator("#map-name")).toHaveText("Bot Yard");
  expect(await page.evaluate(() => openfort.source())).toBe(bot);
  await page.locator('[data-map="parkour"]').click();
  await expect(page.locator("#compile")).toBeEnabled();
  expect(await page.evaluate(() => openfort.source())).toBe(sprint);
  expect(
    await page.evaluate(() =>
      [
        "openfort:source:range",
        "openfort:source:parkour",
        "overfort:source:parkour",
      ].map((k) => localStorage.getItem(k)),
    ),
  ).toEqual([null, null, null]);
});
