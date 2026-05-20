"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Extension } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Ban, Bold, Heading2, Italic, List, ListOrdered, Quote } from "lucide-react";

import { markdownToSummaryHtml, lineItems, uniqueLines } from "@/lib/summary-format";
import { cn } from "@/lib/utils";

export type SummarySnapshot = {
  summary: string;
  blockers: string;
};

export type SummaryEditorHandle = {
  getSnapshot: () => SummarySnapshot;
  setSnapshot: (snapshot: SummarySnapshot) => void;
};

type SummaryEditorProps = {
  initialSummary: string;
  initialBlockers: string;
  resetKey: string;
  onChange: (snapshot: SummarySnapshot) => void;
};

type SummaryToolbarState = {
  heading: boolean;
  bold: boolean;
  italic: boolean;
  bullet: boolean;
  numbered: boolean;
  quote: boolean;
  blocker: boolean;
  canToggleBlocker: boolean;
};

export type SummaryEditorCommand = "heading" | "bold" | "italic" | "bulletList" | "orderedList" | "blockquote" | "blocker";
export type SummaryEditorStructuralCommand = "enter" | "indent" | "outdent";

type InlineMarks = {
  bold: boolean;
  italic: boolean;
  blocker: boolean;
};

const inactiveToolbarState: SummaryToolbarState = {
  heading: false,
  bold: false,
  italic: false,
  bullet: false,
  numbered: false,
  quote: false,
  blocker: false,
  canToggleBlocker: false
};

function formattedInlineMarkdown(content: string, marker: "**" | "_") {
  if (!content.trim()) {
    return content;
  }

  const leading = content.match(/^\s*/)?.[0] ?? "";
  const trailing = content.match(/\s*$/)?.[0] ?? "";
  const body = content.slice(leading.length, content.length - trailing.length);

  return body ? `${leading}${marker}${body}${marker}${trailing}` : content;
}

function nodeHasMark(node: JSONContent, markType: string) {
  return Boolean(node.marks?.some((mark) => mark.type === markType));
}

function inlineNodeToMarkdown(node: JSONContent): string {
  if (node.type === "text") {
    let content = node.text ?? "";

    if (nodeHasMark(node, "italic")) {
      content = formattedInlineMarkdown(content, "_");
    }

    if (nodeHasMark(node, "bold")) {
      content = formattedInlineMarkdown(content, "**");
    }

    return content;
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return (node.content ?? []).map(inlineNodeToMarkdown).join("");
}

function inlineContentToMarkdown(node: JSONContent) {
  return (node.content ?? []).map(inlineNodeToMarkdown).join("");
}

function listItemTextToMarkdown(node: JSONContent) {
  const textBlocks = (node.content ?? []).filter((child) => child.type !== "bulletList" && child.type !== "orderedList");
  return textBlocks
    .map((child) => {
      if (child.type === "heading" || child.type === "paragraph") {
        return inlineContentToMarkdown(child).trim();
      }

      return blockNodeToMarkdown(child, 0)
        .map((line) => line.replace(/^>\s?/, ""))
        .join(" ")
        .trim();
    })
    .filter(Boolean)
    .join(" ");
}

function listNodeToMarkdown(node: JSONContent, depth: number) {
  const ordered = node.type === "orderedList";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  (node.content ?? []).forEach((item, index) => {
    if (item.type !== "listItem") {
      return;
    }

    lines.push(`${indent}${ordered ? `${index + 1}.` : "-"} ${listItemTextToMarkdown(item)}`);

    (item.content ?? [])
      .filter((child) => child.type === "bulletList" || child.type === "orderedList")
      .forEach((nested) => {
        lines.push(...listNodeToMarkdown(nested, depth + 1));
      });
  });

  return lines;
}

function blockNodeToMarkdown(node: JSONContent, depth = 0): string[] {
  if (node.type === "doc") {
    return (node.content ?? []).flatMap((child) => blockNodeToMarkdown(child, depth));
  }

  if (node.type === "heading") {
    const text = inlineContentToMarkdown(node).trim();
    return text ? [`## ${text}`] : [""];
  }

  if (node.type === "paragraph") {
    return [inlineContentToMarkdown(node).replace(/\n$/g, "")];
  }

  if (node.type === "blockquote") {
    const lines = (node.content ?? []).flatMap((child) => blockNodeToMarkdown(child, depth));
    return lines.map((line) => (line ? `> ${line}` : ""));
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    return listNodeToMarkdown(node, depth);
  }

  return (node.content ?? []).flatMap((child) => blockNodeToMarkdown(child, depth));
}

function editorToMarkdown(editor: Editor) {
  return blockNodeToMarkdown(editor.getJSON())
    .join("\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function blockerMarksFromEditor(editor: Editor) {
  return uniqueLines(
    Array.from(editor.view.dom.querySelectorAll<HTMLElement>("mark.summary-blocker-highlight"))
      .map((mark) => mark.textContent?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
  );
}

export function readEditorSnapshot(editor: Editor): SummarySnapshot {
  return {
    summary: editorToMarkdown(editor),
    blockers: blockerMarksFromEditor(editor)
  };
}

function summaryHtml(snapshot: SummarySnapshot) {
  return markdownToSummaryHtml(snapshot.summary, lineItems(snapshot.blockers));
}

export function getSummaryToolbarState(editor: Editor): SummaryToolbarState {
  const hasSelection = !editor.state.selection.empty;
  const selectedText = hasSelection
    ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n", " ")
    : "";
  const inlineMarks = activeInlineMarks(editor);

  return {
    heading: editor.isActive("heading", { level: 2 }),
    bold: inlineMarks.bold,
    italic: inlineMarks.italic,
    bullet: editor.isActive("bulletList"),
    numbered: editor.isActive("orderedList"),
    quote: editor.isActive("blockquote"),
    blocker: inlineMarks.blocker,
    canToggleBlocker: Boolean(selectedText.trim()) || inlineMarks.blocker
  };
}

function selectionIsWhitespaceOnly(editor: Editor) {
  if (editor.state.selection.empty) {
    return false;
  }

  return !editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n", " ").trim();
}

function markIsActiveAtCursor(editor: Editor, markType: string) {
  if (!editor.state.selection.empty || editor.isActive(markType)) {
    return editor.isActive(markType);
  }

  if (editor.state.storedMarks !== null) {
    return editor.state.storedMarks.some((mark) => mark.type.name === markType);
  }

  const nodeBefore = editor.state.selection.$from.nodeBefore;

  return Boolean(nodeBefore?.isText && nodeBefore.marks.some((mark) => mark.type.name === markType));
}

function activeInlineMarks(editor: Editor): InlineMarks {
  return {
    bold: markIsActiveAtCursor(editor, "bold"),
    italic: markIsActiveAtCursor(editor, "italic"),
    blocker: markIsActiveAtCursor(editor, "highlight")
  };
}

function preserveInlineMarks(editor: Editor, command: () => boolean) {
  const marks = activeInlineMarks(editor);
  const selectionWasEmpty = editor.state.selection.empty;
  const ran = command();

  if (!ran) {
    return false;
  }

  if (!selectionWasEmpty) {
    return true;
  }

  if (marks.bold) {
    editor.chain().focus().setMark("bold").run();
  }

  if (marks.italic) {
    editor.chain().focus().setMark("italic").run();
  }

  if (marks.blocker) {
    editor.chain().focus().setMark("highlight").run();
  }

  return true;
}

function toggleInlineMark(editor: Editor, markType: "bold" | "italic" | "highlight") {
  const markIsActive = markIsActiveAtCursor(editor, markType);

  if (markIsActive) {
    return editor.chain().focus().unsetMark(markType).run();
  }

  return editor.chain().focus().setMark(markType).run();
}

export function runSummaryEditorStructuralCommand(editor: Editor, command: SummaryEditorStructuralCommand) {
  switch (command) {
    case "enter":
      return preserveInlineMarks(editor, () =>
        editor.commands.first(({ commands }) => [
          () => commands.splitListItem("listItem"),
          () => commands.newlineInCode(),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock({ keepMarks: true })
        ])
      );
    case "indent":
      return preserveInlineMarks(editor, () => editor.chain().focus().sinkListItem("listItem").run());
    case "outdent":
      return preserveInlineMarks(editor, () => editor.chain().focus().liftListItem("listItem").run());
    default:
      return false;
  }
}

export function runSummaryEditorCommand(editor: Editor, command: SummaryEditorCommand) {
  switch (command) {
    case "heading":
      return preserveInlineMarks(editor, () => editor.chain().focus().toggleHeading({ level: 2 }).run());
    case "bulletList":
      return preserveInlineMarks(editor, () => editor.chain().focus().toggleBulletList().run());
    case "orderedList":
      return preserveInlineMarks(editor, () => editor.chain().focus().toggleOrderedList().run());
    case "blockquote":
      return preserveInlineMarks(editor, () => editor.chain().focus().toggleBlockquote().run());
    case "bold":
      return toggleInlineMark(editor, "bold");
    case "italic":
      return toggleInlineMark(editor, "italic");
    case "blocker":
      return toggleInlineMark(editor, "highlight");
    default:
      return false;
  }
}

function runSummaryEditorInputCommand(editor: Editor, command: SummaryEditorCommand) {
  if (selectionIsWhitespaceOnly(editor)) {
    return true;
  }

  return runSummaryEditorCommand(editor, command);
}

const SummaryStructuralShortcuts = Extension.create({
  name: "summaryStructuralShortcuts",
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      "Mod-b": ({ editor }) => runSummaryEditorInputCommand(editor, "bold"),
      "Mod-i": ({ editor }) => runSummaryEditorInputCommand(editor, "italic"),
      Enter: ({ editor }) => runSummaryEditorStructuralCommand(editor, "enter"),
      Tab: ({ editor }) => {
        const handledByList = editor.isActive("bulletList") || editor.isActive("orderedList");

        if (!handledByList) {
          return false;
        }

        runSummaryEditorStructuralCommand(editor, "indent");
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        const handledByList = editor.isActive("bulletList") || editor.isActive("orderedList");

        if (!handledByList) {
          return false;
        }

        runSummaryEditorStructuralCommand(editor, "outdent");
        return true;
      }
    };
  }
});

export const summaryEditorExtensions = [
  SummaryStructuralShortcuts,
  StarterKit.configure({
    heading: { levels: [2] },
    bulletList: { keepMarks: true },
    orderedList: { keepMarks: true },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false
  }),
  Highlight.configure({
    HTMLAttributes: {
      class: "summary-blocker-highlight"
    }
  }),
  Placeholder.configure({
    placeholder: "What did you work on today?"
  })
];

function buttonTone(active: boolean, extraClassName = "") {
  return cn(
    "reference-menu-button",
    active && "bg-[#eef2ff] text-[#4338ca] ring-1 ring-[#c7d2fe] dark:bg-blue-400/15 dark:text-blue-100 dark:ring-blue-300/20",
    extraClassName
  );
}

function SummaryToolbarButton({
  active,
  disabled,
  label,
  title,
  children,
  className,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={buttonTone(active, className)}
      title={title ?? label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export const SummaryEditor = forwardRef<SummaryEditorHandle, SummaryEditorProps>(function SummaryEditor(
  { initialSummary, initialBlockers, resetKey, onChange },
  ref
) {
  const onChangeRef = useRef(onChange);
  const fallbackSnapshotRef = useRef<SummarySnapshot>({ summary: initialSummary, blockers: initialBlockers });
  const [toolbarState, setToolbarState] = useState<SummaryToolbarState>(inactiveToolbarState);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  function publishSnapshot(editor: Editor) {
    const snapshot = readEditorSnapshot(editor);
    fallbackSnapshotRef.current = snapshot;
    onChangeRef.current(snapshot);
  }

  const updateToolbarState = useCallback((editor: Editor | null) => {
    setToolbarState(editor ? getSummaryToolbarState(editor) : inactiveToolbarState);
  }, []);

  const editor = useEditor({
    extensions: summaryEditorExtensions,
    content: summaryHtml({ summary: initialSummary, blockers: initialBlockers }),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "summary-tiptap-prosemirror"
      }
    },
    onUpdate: ({ editor }) => {
      publishSnapshot(editor);
      updateToolbarState(editor);
    },
    onTransaction: ({ editor }) => updateToolbarState(editor),
    onSelectionUpdate: ({ editor }) => updateToolbarState(editor),
    onFocus: ({ editor }) => updateToolbarState(editor),
    onBlur: ({ editor }) => updateToolbarState(editor)
  });

  const setEditorSnapshot = useCallback((nextEditor: Editor, snapshot: SummarySnapshot) => {
    nextEditor.commands.setContent(summaryHtml(snapshot), { emitUpdate: false });
    const nextSnapshot = readEditorSnapshot(nextEditor);
    fallbackSnapshotRef.current = nextSnapshot;
    onChangeRef.current(nextSnapshot);
    updateToolbarState(nextEditor);
  }, [updateToolbarState]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    setEditorSnapshot(editor, { summary: initialSummary, blockers: initialBlockers });
  }, [editor, initialSummary, initialBlockers, resetKey, setEditorSnapshot]);

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot: () => (editor ? readEditorSnapshot(editor) : fallbackSnapshotRef.current),
      setSnapshot: (snapshot) => {
        if (!editor) {
          fallbackSnapshotRef.current = snapshot;
          onChangeRef.current(snapshot);
          return;
        }

        setEditorSnapshot(editor, snapshot);
      }
    }),
    [editor, setEditorSnapshot]
  );

  function runCommand(command: SummaryEditorCommand, options: { ignoreWhitespaceSelection?: boolean } = {}) {
    if (!editor) {
      return;
    }

    if (options.ignoreWhitespaceSelection !== false && selectionIsWhitespaceOnly(editor)) {
      updateToolbarState(editor);
      return;
    }

    runSummaryEditorInputCommand(editor, command);
    updateToolbarState(editor);
  }

  return (
    <div className="mt-4 rounded-[10px] bg-[#f7f9fc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <SummaryToolbarButton
          active={toolbarState.heading}
          label="Heading"
          onClick={() => runCommand("heading")}
        >
          <Heading2 className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.bold}
          label="Bold"
          onClick={() => runCommand("bold")}
        >
          <Bold className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.italic}
          label="Italic"
          onClick={() => runCommand("italic")}
        >
          <Italic className="h-4 w-4" />
        </SummaryToolbarButton>
        <span className="mx-1 h-5 w-px bg-[#d8dee8] dark:bg-[#263a55]" />
        <SummaryToolbarButton
          active={toolbarState.bullet}
          label="Bulleted list"
          onClick={() => runCommand("bulletList")}
        >
          <List className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.numbered}
          label="Numbered list"
          onClick={() => runCommand("orderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.quote}
          label="Quote"
          onClick={() => runCommand("blockquote")}
        >
          <Quote className="h-4 w-4" />
        </SummaryToolbarButton>
        <span className="mx-1 h-5 w-px bg-[#d8dee8] dark:bg-[#263a55]" />
        <SummaryToolbarButton
          active={toolbarState.blocker}
          disabled={!toolbarState.canToggleBlocker}
          label="Mark as blocker"
          className="w-auto gap-2 px-2.5 text-[#b42318] hover:bg-[#fff1f0] hover:text-[#b42318] disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-400/10"
          onClick={() => runCommand("blocker")}
        >
          <Ban className="h-4 w-4" />
          <span className="text-xs font-medium">Mark as blocker</span>
        </SummaryToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        className="summary-tiptap-editor"
        role="textbox"
        aria-label="Summary"
      />
    </div>
  );
});
