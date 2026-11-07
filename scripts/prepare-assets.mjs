import { mkdir, copyFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const sums = JSON.parse(
  await readFile(new URL("vendor/checksums.json", root), "utf8"),
);
await mkdir(new URL("public/wasm/", root), { recursive: true });
for (const [path, sha] of Object.entries(sums)) {
  const file = new URL(path, root);
  const bytes = await readFile(file);
  if (createHash("sha256").update(bytes).digest("hex") !== sha)
    throw new Error(
      `Checksum mismatch: ${path}. Rebuild the compiler/runtime and refresh checksums intentionally.`,
    );
  await copyFile(file, new URL("public/wasm/" + path.split("/").at(-1), root));
}
