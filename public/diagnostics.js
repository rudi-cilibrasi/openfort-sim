/* OpenVerse reports one-based lines and zero-based Unicode character columns.
   Present conventional editor coordinates and the line that caused the error. */
export function formatDiagnostic(source, message) {
  const match = /^(\d+):(\d+):\s*([\s\S]*)$/.exec(message);
  if (!match) return `Compile error: ${message}`;
  const line = Number(match[1]);
  const column = Number(match[2]);
  const text = source.split(/\r\n|\r|\n/)[line - 1];
  if (text === undefined) return `Compile error: ${message}`;
  // Expand tabs to match the editor's four-column tab stops in one pass.
  let display = "";
  let width = 0;
  let caret = 0;
  let index = 0;
  for (const char of text) {
    if (index === column) caret = width;
    const size = char === "\t" ? 4 - (width % 4) : 1;
    display += char === "\t" ? " ".repeat(size) : char;
    width += size;
    index++;
  }
  if (column >= index) caret = width;
  const gutter = " ".repeat(String(line).length);
  return `island.verse:${line}:${column + 1}: ${match[3]}\n\n${line} | ${display}\n${gutter} | ${" ".repeat(caret)}^`;
}
