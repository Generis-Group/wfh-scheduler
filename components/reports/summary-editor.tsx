"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { mergeAttributes, Node as TiptapNode } from "@tiptap/core";
import LinkExtension from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, List, ListOrdered } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  markdownToSummaryHtml,
  normalizeSummaryActivitySource,
  normalizeSummaryLinkHref,
  summaryActivityReferenceHref,
  summaryActivityReferenceMarkdown,
  summaryActivityReferenceSource,
  type SummaryActivityReferenceMap,
  type SummaryActivitySource,
} from "@/lib/summary-format";
import {
  summaryActivityReferenceDragType,
  type SummaryActivityReferenceDragPayload,
} from "@/lib/summary-drag";
import { cn } from "@/lib/utils";

export type SummarySnapshot = {
  summary: string;
};

export type SummaryEditorHandle = {
  getSnapshot: () => SummarySnapshot;
  setSnapshot: (snapshot: SummarySnapshot) => void;
};

export type SummaryEditorProps = {
  initialSummary: string;
  resetKey: string;
  activityReferences?: SummaryActivityReferenceMap;
  onChange: (snapshot: SummarySnapshot) => void;
  onActivityReferenceDrop?: (
    payload: SummaryActivityReferenceDragPayload,
  ) => void;
};

type SummaryToolbarState = {
  heading: boolean;
  bold: boolean;
  italic: boolean;
  bullet: boolean;
  numbered: boolean;
};

type ActivityReferenceInsertionTarget = {
  pos: number;
};

type ActivityReferenceAttributes = {
  label: string;
  href: string | null;
  source: SummaryActivitySource;
  activityId: string | null;
};

export type SummaryEditorCommand =
  | "heading"
  | "bold"
  | "italic"
  | "bulletList"
  | "orderedList";

const inactiveToolbarState: SummaryToolbarState = {
  heading: false,
  bold: false,
  italic: false,
  bullet: false,
  numbered: false,
};

const preservedInlineMarkTypes = ["bold", "italic"] as const;

function activityReferenceLabel(value?: string | null) {
  return (
    value
      ?.replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Untitled activity"
  );
}

function activityReferenceAttributes(
  attrs?: Record<string, unknown> | null,
): ActivityReferenceAttributes {
  const label = typeof attrs?.label === "string" ? attrs.label : "";
  const href = typeof attrs?.href === "string" ? attrs.href.trim() : "";
  const activityId =
    typeof attrs?.activityId === "string" ? attrs.activityId.trim() : "";
  const source =
    typeof attrs?.source === "string"
      ? normalizeSummaryActivitySource(attrs.source)
      : summaryActivityReferenceSource(href, label);

  return {
    label: activityReferenceLabel(label),
    href: href || null,
    source,
    activityId: activityId || null,
  };
}

function activityReferenceHtmlAttributes(attrs: ActivityReferenceAttributes) {
  const htmlAttributes: Record<string, string> = {
    "data-summary-activity-reference": "true",
    "data-source": attrs.source,
    class: "summary-activity-reference-node",
  };

  if (attrs.href) {
    htmlAttributes["data-href"] = attrs.href;
  }

  if (attrs.activityId) {
    htmlAttributes["data-activity-id"] = attrs.activityId;
  }

  return htmlAttributes;
}

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

function nodeMark(node: JSONContent, markType: string) {
  return node.marks?.find((mark) => mark.type === markType) ?? null;
}

function inlineNodeToMarkdown(node: JSONContent): string {
  if (node.type === "activityReference") {
    const attrs = activityReferenceAttributes(node.attrs);
    const href =
      summaryActivityReferenceHref(attrs.activityId, attrs.source) ??
      attrs.href;

    return summaryActivityReferenceMarkdown(attrs.label, href);
  }

  if (node.type === "text") {
    let content = node.text ?? "";

    if (nodeHasMark(node, "italic")) {
      content = formattedInlineMarkdown(content, "_");
    }

    if (nodeHasMark(node, "bold")) {
      content = formattedInlineMarkdown(content, "**");
    }

    const linkMark = nodeMark(node, "link");
    const href =
      typeof linkMark?.attrs?.href === "string"
        ? normalizeSummaryLinkHref(linkMark.attrs.href)
        : null;

    if (href) {
      content = summaryActivityReferenceMarkdown(content, href);
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
  return (node.content ?? [])
    .filter(
      (child) => child.type !== "bulletList" && child.type !== "orderedList",
    )
    .map((child) => {
      if (child.type === "heading" || child.type === "paragraph") {
        return inlineContentToMarkdown(child).trim();
      }

      return blockNodeToMarkdown(child, 0).join(" ").trim();
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

    lines.push(
      `${indent}${ordered ? `${index + 1}.` : "-"} ${listItemTextToMarkdown(item)}`,
    );

    (item.content ?? [])
      .filter(
        (child) => child.type === "bulletList" || child.type === "orderedList",
      )
      .forEach((nested) => {
        lines.push(...listNodeToMarkdown(nested, depth + 1));
      });
  });

  return lines;
}

function blockNodeToMarkdown(node: JSONContent, depth = 0): string[] {
  if (node.type === "doc") {
    return (node.content ?? []).flatMap((child) =>
      blockNodeToMarkdown(child, depth),
    );
  }

  if (node.type === "heading") {
    const text = inlineContentToMarkdown(node).trim();
    return text ? [`## ${text}`] : [""];
  }

  if (node.type === "paragraph") {
    return [inlineContentToMarkdown(node).replace(/\n$/g, "")];
  }

  if (node.type === "bulletList" || node.type === "orderedList") {
    return listNodeToMarkdown(node, depth);
  }

  return (node.content ?? []).flatMap((child) =>
    blockNodeToMarkdown(child, depth),
  );
}

function editorToMarkdown(editor: Editor) {
  return blockNodeToMarkdown(editor.getJSON())
    .join("\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function readEditorSnapshot(editor: Editor): SummarySnapshot {
  return { summary: editorToMarkdown(editor) };
}

function summaryHtml(
  snapshot: SummarySnapshot,
  activityReferences?: SummaryActivityReferenceMap,
) {
  return markdownToSummaryHtml(snapshot.summary, activityReferences);
}

function summaryToolbarStatesEqual(
  first: SummaryToolbarState,
  second: SummaryToolbarState,
) {
  return (
    first.heading === second.heading &&
    first.bold === second.bold &&
    first.italic === second.italic &&
    first.bullet === second.bullet &&
    first.numbered === second.numbered
  );
}

function hasActivityReferenceDrag(dataTransfer: DataTransfer | null) {
  return Array.from(dataTransfer?.types ?? []).includes(
    summaryActivityReferenceDragType,
  );
}

function parseActivityReferencePayload(
  dataTransfer: DataTransfer | null,
): SummaryActivityReferenceDragPayload | null {
  const rawPayload = dataTransfer?.getData(summaryActivityReferenceDragType);

  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      rawPayload,
    ) as Partial<SummaryActivityReferenceDragPayload>;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";

    if (!title) {
      return null;
    }

    return {
      activityId:
        typeof parsed.activityId === "string" ? parsed.activityId : undefined,
      source: typeof parsed.source === "string" ? parsed.source : null,
      title,
      url: typeof parsed.url === "string" ? parsed.url : null,
    };
  } catch {
    return null;
  }
}

function activityReferenceInsertionTarget(
  view: Editor["view"],
  event: DragEvent,
): ActivityReferenceInsertionTarget | null {
  const rect = view.dom.getBoundingClientRect();

  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  ) {
    return null;
  }

  const position = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });

  if (position) {
    return { pos: position.pos };
  }

  return { pos: Math.max(1, view.state.doc.content.size - 1) };
}

function eventTargetIsActivityReference(event: DragEvent) {
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest("[data-summary-activity-reference]"))
  );
}

function insertionAdjacentCharacter(
  view: Editor["view"],
  pos: number,
  direction: "before" | "after",
) {
  const doc = view.state.doc;

  if (direction === "before") {
    if (pos <= 0) {
      return "";
    }

    return doc.textBetween(Math.max(0, pos - 1), pos, "\n", "\uFFFC");
  }

  if (pos >= doc.content.size) {
    return "";
  }

  return doc.textBetween(
    pos,
    Math.min(doc.content.size, pos + 1),
    "\n",
    "\uFFFC",
  );
}

function insertionNeedsSpace(
  view: Editor["view"],
  pos: number,
  direction: "before" | "after",
) {
  const character = insertionAdjacentCharacter(view, pos, direction);

  return Boolean(character && !/\s/.test(character));
}

function insertActivityReference(
  view: Editor["view"],
  target: ActivityReferenceInsertionTarget,
  payload: SummaryActivityReferenceDragPayload,
) {
  const title = payload.title.trim() || "Untitled activity";
  const source = normalizeSummaryActivitySource(payload.source);
  const href =
    summaryActivityReferenceHref(payload.activityId, source) ??
    normalizeSummaryLinkHref(payload.url);
  const schema = view.state.schema;
  const activityReferenceNode = schema.nodes.activityReference?.create({
    activityId: payload.activityId ?? null,
    href,
    label: title,
    source,
  });

  if (!activityReferenceNode) {
    return false;
  }

  const needsLeadingSpace = insertionNeedsSpace(view, target.pos, "before");
  const needsTrailingSpace = insertionNeedsSpace(view, target.pos, "after");
  const transaction = view.state.tr;
  let insertPos = target.pos;

  if (needsLeadingSpace) {
    transaction.insertText(" ", insertPos);
    insertPos += 1;
  }

  transaction.insert(insertPos, activityReferenceNode);

  if (needsTrailingSpace) {
    transaction.insertText(" ", insertPos + activityReferenceNode.nodeSize);
  }

  transaction.scrollIntoView();

  view.dispatch(transaction);
  view.focus();

  return true;
}

export function getSummaryToolbarState(editor: Editor): SummaryToolbarState {
  return {
    heading: editor.isActive("heading", { level: 2 }),
    bold: markIsActiveAtCursor(editor, "bold"),
    italic: markIsActiveAtCursor(editor, "italic"),
    bullet: editor.isActive("bulletList"),
    numbered: editor.isActive("orderedList"),
  };
}

function markIsActiveAtCursor(editor: Editor, markType: string) {
  if (!editor.state.selection.empty || editor.isActive(markType)) {
    return editor.isActive(markType);
  }

  if (editor.state.storedMarks !== null) {
    return editor.state.storedMarks.some((mark) => mark.type.name === markType);
  }

  const nodeBefore = editor.state.selection.$from.nodeBefore;

  return Boolean(
    nodeBefore?.isText &&
    nodeBefore.marks.some((mark) => mark.type.name === markType),
  );
}

function preserveStoredInlineMarks(editor: Editor, command: () => boolean) {
  const selectionWasEmpty = editor.state.selection.empty;
  const activeMarks = selectionWasEmpty
    ? preservedInlineMarkTypes.filter((markType) =>
        markIsActiveAtCursor(editor, markType),
      )
    : [];
  const ran = command();

  if (!ran || !selectionWasEmpty || activeMarks.length === 0) {
    return ran;
  }

  activeMarks.forEach((markType) => {
    editor.chain().focus().setMark(markType).run();
  });

  return ran;
}

export function runSummaryEditorCommand(
  editor: Editor,
  command: SummaryEditorCommand,
) {
  switch (command) {
    case "heading":
      return preserveStoredInlineMarks(editor, () =>
        editor.chain().focus().toggleHeading({ level: 2 }).run(),
      );
    case "bulletList":
      return preserveStoredInlineMarks(editor, () =>
        editor.chain().focus().toggleBulletList().run(),
      );
    case "orderedList":
      return preserveStoredInlineMarks(editor, () =>
        editor.chain().focus().toggleOrderedList().run(),
      );
    case "bold":
      return editor.chain().focus().toggleBold().run();
    case "italic":
      return editor.chain().focus().toggleItalic().run();
    default:
      return false;
  }
}

const ActivityReferenceExtension = TiptapNode.create({
  name: "activityReference",
  group: "inline",
  inline: true,
  atom: true,
  marks: "",
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      label: {
        default: "Untitled activity",
        parseHTML: (element) =>
          activityReferenceLabel(
            element.getAttribute("data-label") ?? element.textContent,
          ),
      },
      href: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-href") ||
          element.getAttribute("href") ||
          null,
      },
      source: {
        default: "UNKNOWN",
        parseHTML: (element) =>
          normalizeSummaryActivitySource(
            element.getAttribute("data-source") ??
              summaryActivityReferenceSource(
                element.getAttribute("data-href") ||
                  element.getAttribute("href"),
                element.textContent,
              ),
          ),
      },
      activityId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-activity-id") || null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-summary-activity-reference]",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = activityReferenceAttributes(node.attrs);

    return [
      "span",
      mergeAttributes(HTMLAttributes, activityReferenceHtmlAttributes(attrs)),
      [
        "span",
        { class: "summary-activity-reference-icon", "aria-hidden": "true" },
        ["span", { class: "summary-activity-reference-symbol" }],
      ],
      ["span", { class: "summary-activity-reference-label" }, attrs.label],
    ];
  },
});

export const summaryEditorExtensions = [
  ActivityReferenceExtension,
  StarterKit.configure({
    heading: { levels: [2] },
    orderedList: { keepMarks: true },
    bulletList: { keepMarks: true },
    blockquote: false,
    code: false,
    codeBlock: false,
    dropcursor: {
      class: "summary-tiptap-dropcursor",
      color: "#2563eb",
      width: 2,
    },
    gapcursor: false,
    horizontalRule: false,
    link: false,
    strike: false,
    underline: false,
  }),
  LinkExtension.configure({
    autolink: false,
    linkOnPaste: false,
    openOnClick: false,
    HTMLAttributes: {
      class: "summary-activity-reference",
      rel: "noreferrer",
      target: "_blank",
    },
  }),
  Placeholder.configure({
    placeholder: "What did you work on today?",
  }),
];

function buttonTone(active: boolean, className = "", activeClassName = "") {
  return cn(
    "reference-menu-button",
    "disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-transparent disabled:hover:text-[#64748b] dark:disabled:hover:bg-transparent dark:disabled:hover:text-muted-foreground",
    active &&
      (activeClassName ||
        "bg-[#eef2ff] text-[#4338ca] ring-1 ring-[#c7d2fe] dark:bg-blue-400/15 dark:text-blue-100 dark:ring-blue-300/20"),
    className,
  );
}

function SummaryToolbarButton({
  active,
  disabled,
  label,
  title,
  children,
  className,
  activeClassName,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  children: ReactNode;
  className?: string;
  activeClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={buttonTone(active, className, activeClassName)}
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

export function SummaryEditorSkeleton() {
  return (
    <div
      className="summary-tiptap-editor"
      aria-busy="true"
      aria-label="Loading summary editor"
      role="status"
    >
      <div className="h-[480px] rounded-[7px] bg-white px-3.5 py-3.5 ring-1 ring-[#dfe4ee] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
        <Skeleton className="h-4 w-11/12 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-4/5 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-9/12 rounded-[4px]" />
        <Skeleton className="mt-7 h-4 w-10/12 rounded-[4px]" />
        <Skeleton className="mt-3 h-4 w-7/12 rounded-[4px]" />
        <Skeleton className="mt-7 h-4 w-8/12 rounded-[4px]" />
      </div>
    </div>
  );
}

const SummaryEditorComponent = forwardRef<
  SummaryEditorHandle,
  SummaryEditorProps
>(function SummaryEditor(
  {
    initialSummary,
    resetKey,
    activityReferences,
    onChange,
    onActivityReferenceDrop,
  },
  ref,
) {
  const onChangeRef = useRef(onChange);
  const onActivityReferenceDropRef = useRef(onActivityReferenceDrop);
  const activityReferencesRef = useRef(activityReferences);
  const fallbackSnapshotRef = useRef<SummarySnapshot>({
    summary: initialSummary,
  });
  const [toolbarState, setToolbarState] =
    useState<SummaryToolbarState>(inactiveToolbarState);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onActivityReferenceDropRef.current = onActivityReferenceDrop;
  }, [onActivityReferenceDrop]);

  activityReferencesRef.current = activityReferences;

  const updateToolbarState = useCallback((editor: Editor | null) => {
    const nextState = editor
      ? getSummaryToolbarState(editor)
      : inactiveToolbarState;

    setToolbarState((current) =>
      summaryToolbarStatesEqual(current, nextState) ? current : nextState,
    );
  }, []);

  function publishSnapshot(editor: Editor) {
    const snapshot = readEditorSnapshot(editor);
    fallbackSnapshotRef.current = snapshot;
    onChangeRef.current(snapshot);
  }

  const editor = useEditor({
    extensions: summaryEditorExtensions,
    content: summaryHtml(
      {
        summary: initialSummary,
      },
      activityReferences,
    ),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "summary-tiptap-prosemirror",
      },
      handleDOMEvents: {
        dragstart: (_view, event) => {
          if (!eventTargetIsActivityReference(event)) {
            return false;
          }

          event.preventDefault();
          return true;
        },
        dragover: (view, event) => {
          if (!hasActivityReferenceDrag(event.dataTransfer)) {
            return false;
          }

          const target = activityReferenceInsertionTarget(view, event);

          if (!target) {
            return false;
          }

          event.preventDefault();

          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }

          return false;
        },
      },
      handleDrop: (view, event) => {
        const payload = parseActivityReferencePayload(event.dataTransfer);

        if (!payload) {
          return false;
        }

        const target = activityReferenceInsertionTarget(view, event);

        if (!target) {
          return false;
        }

        event.preventDefault();

        const inserted = insertActivityReference(view, target, payload);

        if (inserted) {
          onActivityReferenceDropRef.current?.(payload);
        }

        return true;
      },
    },
    onUpdate: ({ editor }) => {
      publishSnapshot(editor);
      updateToolbarState(editor);
    },
    onTransaction: ({ editor }) => {
      updateToolbarState(editor);
    },
    onSelectionUpdate: ({ editor }) => updateToolbarState(editor),
  });

  const setEditorSnapshot = useCallback(
    (nextEditor: Editor, snapshot: SummarySnapshot) => {
      nextEditor.commands.setContent(
        summaryHtml(snapshot, activityReferencesRef.current),
        {
          emitUpdate: false,
        },
      );
      fallbackSnapshotRef.current = snapshot;
      updateToolbarState(nextEditor);
    },
    [updateToolbarState],
  );

  useEffect(() => {
    fallbackSnapshotRef.current = {
      summary: initialSummary,
    };

    if (!editor) {
      return;
    }

    setEditorSnapshot(editor, {
      summary: initialSummary,
    });
  }, [editor, initialSummary, resetKey, setEditorSnapshot]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const snapshot = readEditorSnapshot(editor);

    editor.commands.setContent(summaryHtml(snapshot, activityReferences), {
      emitUpdate: false,
    });
    updateToolbarState(editor);
  }, [activityReferences, editor, updateToolbarState]);

  useImperativeHandle(
    ref,
    () => ({
      getSnapshot: () =>
        editor ? readEditorSnapshot(editor) : fallbackSnapshotRef.current,
      setSnapshot: (snapshot) => {
        fallbackSnapshotRef.current = snapshot;

        if (!editor) {
          return;
        }

        setEditorSnapshot(editor, snapshot);
      },
    }),
    [editor, setEditorSnapshot],
  );

  function runCommand(command: SummaryEditorCommand) {
    if (!editor) {
      return;
    }

    runSummaryEditorCommand(editor, command);
    updateToolbarState(editor);
  }

  return (
    <div className="mt-4 rounded-[10px] bg-[#f7f9fc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <SummaryToolbarButton
          active={toolbarState.heading}
          disabled={!editor}
          label="Heading"
          onClick={() => runCommand("heading")}
        >
          <Heading2 className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.bold}
          disabled={!editor}
          label="Bold"
          onClick={() => runCommand("bold")}
        >
          <Bold className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.italic}
          disabled={!editor}
          label="Italic"
          onClick={() => runCommand("italic")}
        >
          <Italic className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.bullet}
          disabled={!editor}
          label="Bulleted list"
          onClick={() => runCommand("bulletList")}
        >
          <List className="h-4 w-4" />
        </SummaryToolbarButton>
        <SummaryToolbarButton
          active={toolbarState.numbered}
          disabled={!editor}
          label="Numbered list"
          onClick={() => runCommand("orderedList")}
        >
          <ListOrdered className="h-4 w-4" />
        </SummaryToolbarButton>
      </div>
      {editor ? (
        <div className="summary-tiptap-drop-zone">
          <EditorContent
            editor={editor}
            className="summary-tiptap-editor"
            role="textbox"
            aria-label="Summary"
          />
        </div>
      ) : (
        <SummaryEditorSkeleton />
      )}
    </div>
  );
});

export const SummaryEditor = memo(SummaryEditorComponent);
