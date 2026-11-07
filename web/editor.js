import { EditorView, keymap, Decoration } from "@codemirror/view";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
const verseColors = HighlightStyle.define([
  { tag: tags.comment, color: "#7688a1" },
  { tag: tags.keyword, color: "#c8a2f0" },
  { tag: tags.string, color: "#b5d892" },
  { tag: tags.number, color: "#e1b57a" },
  { tag: tags.typeName, color: "#76cfcc" },
  { tag: tags.meta, color: "#8aabc8" },
  { tag: tags.function(tags.variableName), color: "#89bfff" },
]);
const markLine = StateEffect.define();
const highlight = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    value = value.map(tr.changes);
    for (const effect of tr.effects)
      if (effect.is(markLine))
        value = Decoration.set([
          Decoration.line({ attributes: { class: "executed-line" } }).range(
            tr.state.doc.line(effect.value).from,
          ),
        ]);
    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});
const verse = StreamLanguage.define({
  startState: () => ({ block: 0 }),
  token(stream, state) {
    if (state.block) {
      if (stream.match(/.*?#>/)) state.block--;
      else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("<#")) {
      state.block++;
      return "comment";
    }
    if (stream.match(/#.*/)) return "comment";
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return "string";
    if (
      stream.match(
        /\b(?:class|if|else|for|loop|return|break|set|var|not|and|or|true|false|array|option|logic|using)\b/,
      )
    )
      return "keyword";
    if (stream.match(/\b(?:int|string|void|creative_device)\b/))
      return "typeName";
    if (stream.match(/<[^>]*>/)) return "meta";
    if (stream.match(/\b\d+\b/)) return "number";
    if (stream.match(/[A-Za-z_][A-Za-z_0-9]*/))
      return stream.match(/^\s*\(/, false)
        ? "variableName.function"
        : "variableName";
    stream.next();
    return null;
  },
});
export function createEditor(parent, source, onChange, onRun) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: source,
      extensions: [
        basicSetup,
        verse,
        highlight,
        syntaxHighlighting(verseColors),
        keymap.of([
          indentWithTab,
          {
            key: "Mod-Enter",
            run: () => {
              onRun();
              return true;
            },
          },
        ]),
        EditorState.tabSize.of(4),
        EditorView.contentAttributes.of({
          "aria-label": "Verse source code",
          "aria-describedby": "edit-state",
          spellcheck: "false",
          // already focusable (contenteditable); explicit for axe and assistive tech
          tabindex: "0",
        }),
        EditorView.theme(
          {
            "&": { backgroundColor: "#151b28", color: "#c1ccde" },
            ".cm-cursor": { borderLeftColor: "#cafa4c" },
            ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
              background: "#445a3c80",
            },
            ".cm-gutters": { backgroundColor: "#151b28", color: "#4b5c75" },
            ".executed-line": {
              backgroundColor: "#cafa4c16",
              borderLeft: "2px solid #cafa4c",
            },
            "&.cm-focused": { outline: "none" },
          },
          { dark: true },
        ),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });
  return {
    view,
    get: () => view.state.doc.toString(),
    set: (text) =>
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
      }),
    reveal: (line) => {
      line = Math.max(1, Math.min(line, view.state.doc.lines));
      const pos = view.state.doc.line(line).from;
      view.dispatch({
        effects: [
          markLine.of(line),
          EditorView.scrollIntoView(pos, { y: "center" }),
        ],
        selection: { anchor: pos },
      });
    },
  };
}
