// Link checked OVBC into the reserved linear-memory segment of the WASM VM.
// The result is executable WASM with map_run, not a renamed bytecode file.
export function uleb(value) {
  const out = [];
  do {
    let b = value & 127;
    value >>>= 7;
    if (value) b |= 128;
    out.push(b);
  } while (value);
  return out;
}
function sleb(value) {
  const out = [];
  let more = true;
  while (more) {
    let b = value & 127;
    value >>= 7;
    more = !((value === 0 && !(b & 64)) || (value === -1 && b & 64));
    if (more) b |= 128;
    out.push(b);
  }
  return out;
}
export function linkMap(runtime, address, bytecode, source) {
  const read = (bytes, at) => {
    let v = 0,
      shift = 0,
      b;
    do {
      b = bytes[at++];
      v |= (b & 127) << shift;
      shift += 7;
    } while (b & 128);
    return [v >>> 0, at];
  };
  const section = (id, data) =>
    new Uint8Array([id, ...uleb(data.length), ...data]);
  const payload = new Uint8Array(bytecode.length + 4);
  new DataView(payload.buffer).setUint32(0, bytecode.length, true);
  payload.set(bytecode, 4);
  const segmentHeader = [
    0,
    0x41,
    ...sleb(address),
    0x0b,
    ...uleb(payload.length),
  ];
  const segment = new Uint8Array(segmentHeader.length + payload.length);
  segment.set(segmentHeader);
  segment.set(payload, segmentHeader.length);
  const chunks = [runtime.slice(0, 8)];
  let hasData = false;
  for (let offset = 8; offset < runtime.length; ) {
    const id = runtime[offset++];
    const [size, body] = read(runtime, offset);
    let data = runtime.slice(body, body + size);
    offset = body + size;
    if (id === 11) {
      const [count, start] = read(data, 0);
      const prefix = uleb(count + 1);
      const next = new Uint8Array(
        prefix.length + data.length - start + segment.length,
      );
      next.set(prefix);
      next.set(data.subarray(start), prefix.length);
      next.set(segment, prefix.length + data.length - start);
      data = next;
      hasData = true;
    } else if (id === 12) {
      const [count] = read(data, 0);
      data = new Uint8Array(uleb(count + 1));
    }
    chunks.push(section(id, data));
  }
  if (!hasData) chunks.push(section(11, new Uint8Array([1, ...segment])));
  const name = new TextEncoder().encode("overfort.source");
  const text = new TextEncoder().encode(source);
  const meta = new Uint8Array(
    uleb(name.length).length + name.length + text.length,
  );
  meta.set(uleb(name.length));
  meta.set(name, uleb(name.length).length);
  meta.set(text, meta.length - text.length);
  chunks.push(section(0, meta));
  const result = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  if (!WebAssembly.validate(result))
    throw new Error("The map linker produced invalid WebAssembly.");
  return result;
}
