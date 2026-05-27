// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getSummaryToolbarState,
  readEditorSnapshot,
  runSummaryEditorCommand,
  SummaryEditor,
  summaryEditorExtensions,
  type SummarySnapshot,
} from "@/components/reports/summary-editor";
import {
  summaryActivityReferenceHref,
  type SummaryActivityReferenceMap,
} from "@/lib/summary-format";

afterEach(() => {
  cleanup();
  testEditors.splice(0).forEach((editor) => editor.destroy());
});

const testEditors: Editor[] = [];

function createEditor(content = "<p>combo</p>") {
  const editor = new Editor({
    extensions: summaryEditorExtensions,
    content,
  });
  testEditors.push(editor);
  return editor;
}

function selectAll(editor: Editor) {
  editor.commands.focus();
  editor.commands.selectAll();
}

function setCursorAfterText(editor: Editor, value: string) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    const index = node.text?.indexOf(value) ?? -1;

    if (index === -1) {
      return true;
    }

    position = pos + index + value.length;
    return false;
  });

  if (position === null) {
    throw new Error(`Unable to find text: ${value}`);
  }

  editor.commands.setTextSelection(position);
}

function setSelectionForText(editor: Editor, value: string) {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    const index = node.text?.indexOf(value) ?? -1;

    if (index === -1) {
      return true;
    }

    position = pos + index;
    return false;
  });

  if (position === null) {
    throw new Error(`Unable to find text: ${value}`);
  }

  editor.commands.setTextSelection({
    from: position,
    to: position + value.length,
  });
}

function pressEditorKey(
  editor: Editor,
  key: string,
  options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    shiftKey: options.shiftKey,
  });

  editor.view.someProp("handleKeyDown", (handler) =>
    handler(editor.view, event),
  );
}

function renderSummaryEditor() {
  return render(
    React.createElement(SummaryEditor, {
      initialSummary: "",
      initialBlockers: "",
      resetKey: "test",
      onChange: vi.fn(),
    }),
  );
}

function renderSummaryEditorWithSummary(
  initialSummary: string,
  onChange = vi.fn<(snapshot: SummarySnapshot) => void>(),
  activityReferences?: SummaryActivityReferenceMap,
) {
  return {
    onChange,
    ...render(
      React.createElement(SummaryEditor, {
        initialSummary,
        initialBlockers: "",
        resetKey: "test",
        activityReferences,
        onChange,
      }),
    ),
  };
}

describe("SummaryEditor", () => {
  test("uses a loading skeleton while the editor initializes", async () => {
    renderSummaryEditor();

    const loadingState = screen.queryByRole("status", {
      name: "Loading summary editor",
    });
    if (loadingState) {
      expect(loadingState.querySelector(".animate-pulse")).not.toBeNull();
    }

    await screen.findByRole("textbox", { name: "Summary" });
  });

  test("renders the simplified toolbar only", async () => {
    renderSummaryEditor();

    await screen.findByRole("textbox", { name: "Summary" });

    expect(screen.getByRole("button", { name: "Heading" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Italic" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bulleted list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Numbered list" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark blocker" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Quote" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Blocker highlight" })).toBeNull();
  });

  test("updates toolbar state after toolbar commands", async () => {
    renderSummaryEditor();

    await screen.findByRole("textbox", { name: "Summary" });
    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });
    const heading = screen.getByRole("button", { name: "Heading" });
    const bullet = screen.getByRole("button", { name: "Bulleted list" });
    const numbered = screen.getByRole("button", { name: "Numbered list" });
    const blocker = screen.getByRole("button", { name: "Mark blocker" });

    expect(bold.getAttribute("aria-pressed")).toBe("false");
    expect(italic.getAttribute("aria-pressed")).toBe("false");
    expect(heading.getAttribute("aria-pressed")).toBe("false");
    expect(bullet.getAttribute("aria-pressed")).toBe("false");
    expect(numbered.getAttribute("aria-pressed")).toBe("false");
    expect(blocker.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(bold);

    await waitFor(() => {
      expect(bold.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(italic);

    await waitFor(() => {
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(heading);

    await waitFor(() => {
      expect(heading.getAttribute("aria-pressed")).toBe("true");
      expect(bold.getAttribute("aria-pressed")).toBe("true");
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(bullet);

    await waitFor(() => {
      expect(bullet.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(numbered);

    await waitFor(() => {
      expect(numbered.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(blocker);

    await waitFor(() => {
      expect(blocker.getAttribute("aria-pressed")).toBe("true");
    });
  });

  test("serializes links as markdown", () => {
    const editor = createEditor(
      '<p><a href="https://example.com/tasks/123">Imported task</a></p>',
    );

    expect(readEditorSnapshot(editor).summary).toBe(
      "[Imported task](https://example.com/tasks/123)",
    );
  });

  test("serializes activity reference nodes as markdown", () => {
    const editor = createEditor(
      '<p><span data-summary-activity-reference="true" data-source="JIRA" data-href="https://example.com/tasks/123">Imported task</span></p>',
    );

    expect(readEditorSnapshot(editor).summary).toBe(
      "[Imported task](https://example.com/tasks/123)",
    );
  });

  test("serializes activity reference nodes with ids as internal markdown", () => {
    const href = summaryActivityReferenceHref("activity-1", "JIRA");
    const editor = createEditor(
      '<p><span data-summary-activity-reference="true" data-activity-id="activity-1" data-source="JIRA" data-href="https://example.com/tasks/123">Imported task</span></p>',
    );

    expect(readEditorSnapshot(editor).summary).toBe(
      `[Imported task](${href})`,
    );
  });

  test("renders activity references as static editor atoms", async () => {
    const href = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");
    renderSummaryEditorWithSummary(`[Imported task](${href})`);

    const label = await screen.findByText("Imported task");
    const referenceNode = label.closest(".summary-activity-reference-node");

    expect(referenceNode?.getAttribute("data-source")).toBe("GOOGLE_TASKS");
    expect(referenceNode?.getAttribute("data-href")).toBe(href);
    expect(screen.queryByRole("button", { name: "Imported task" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Reference title" })).toBeNull();
  });

  test("uses current activity titles for internal references", async () => {
    const href = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");

    renderSummaryEditorWithSummary(
      `[Old task title](${href})`,
      undefined,
      {
        "activity-1": {
          href: "https://tasks.google.com/task/1",
          source: "GOOGLE_TASKS",
          title: "Renamed task title",
        },
      },
    );

    const label = await screen.findByText("Renamed task title");

    expect(label.closest(".summary-activity-reference-node")).not.toBeNull();
    expect(screen.queryByText("Old task title")).toBeNull();
  });

  test("prevents dragging inserted activity references out of the editor", async () => {
    const href = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");
    renderSummaryEditorWithSummary(`[Imported task](${href})`);

    const label = await screen.findByText("Imported task");
    const referenceNode = label.closest(".summary-activity-reference-node");

    expect(referenceNode).not.toBeNull();
    const dragStart = createEvent.dragStart(referenceNode as Element);

    fireEvent(referenceNode as Element, dragStart);

    expect(dragStart.defaultPrevented).toBe(true);
  });

  test("renders adjacent activity references without paragraph layout classes", async () => {
    const firstHref = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");
    const secondHref = summaryActivityReferenceHref("activity-2", "JIRA");
    renderSummaryEditorWithSummary(
      `[Imported task](${firstHref}) [Jira task](${secondHref})`,
    );

    await screen.findByText("Imported task");
    await screen.findByText("Jira task");

    expect(document.querySelector(".summary-reference-stack")).toBeNull();
    expect(document.querySelectorAll(".summary-activity-reference-node")).toHaveLength(2);
  });

  test("keeps activity references inline when mixed with typed text", async () => {
    const href = summaryActivityReferenceHref("activity-1", "GOOGLE_TASKS");
    renderSummaryEditorWithSummary(`Worked on [Imported task](${href}) today`);

    const label = await screen.findByText("Imported task");
    const paragraph = label.closest("p");

    expect(paragraph?.textContent).toBe("Worked on Imported task today");
    expect(document.querySelector(".summary-reference-stack")).toBeNull();
  });

  test("serializes the supported formatting", () => {
    const inlineEditor = createEditor("<p>combo</p>");
    selectAll(inlineEditor);
    runSummaryEditorCommand(inlineEditor, "bold");
    runSummaryEditorCommand(inlineEditor, "italic");
    expect(readEditorSnapshot(inlineEditor).summary).toBe("**_combo_**");

    const headingEditor = createEditor("<p>combo</p>");
    selectAll(headingEditor);
    runSummaryEditorCommand(headingEditor, "heading");
    expect(readEditorSnapshot(headingEditor).summary).toBe("## combo");

    const numberedEditor = createEditor("<p>combo</p>");
    selectAll(numberedEditor);
    runSummaryEditorCommand(numberedEditor, "orderedList");
    expect(readEditorSnapshot(numberedEditor).summary).toBe("1. combo");

    const bulletEditor = createEditor("<p>combo</p>");
    selectAll(bulletEditor);
    runSummaryEditorCommand(bulletEditor, "bulletList");
    expect(readEditorSnapshot(bulletEditor).summary).toBe("- combo");
  });

  test("hydrates saved markdown as editor formatting", async () => {
    renderSummaryEditorWithSummary(
      "## **_Header_**\n- **_Bullet_**\n1. _Numbered_",
    );

    await screen.findByRole("textbox", { name: "Summary" });

    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Header");
    expect(heading.querySelector("strong em")?.textContent).toBe("Header");
    expect(document.querySelector("ul strong")?.textContent).toBe("Bullet");
    expect(document.querySelector("ol em")?.textContent).toBe("Numbered");
  });

  test("block commands preserve active inline tools for new text", () => {
    const headingEditor = createEditor("<p></p>");
    runSummaryEditorCommand(headingEditor, "bold");
    runSummaryEditorCommand(headingEditor, "italic");
    runSummaryEditorCommand(headingEditor, "heading");

    expect(getSummaryToolbarState(headingEditor)).toMatchObject({
      bold: true,
      italic: true,
      heading: true,
    });

    headingEditor.commands.insertContent("combo");
    expect(readEditorSnapshot(headingEditor).summary).toBe("## **_combo_**");

    const listEditor = createEditor("<p></p>");
    runSummaryEditorCommand(listEditor, "bold");
    runSummaryEditorCommand(listEditor, "italic");
    runSummaryEditorCommand(listEditor, "orderedList");

    expect(getSummaryToolbarState(listEditor)).toMatchObject({
      bold: true,
      italic: true,
      numbered: true,
    });

    listEditor.commands.insertContent("combo");
    expect(readEditorSnapshot(listEditor).summary).toBe("1. **_combo_**");

    const bulletEditor = createEditor("<p></p>");
    runSummaryEditorCommand(bulletEditor, "bold");
    runSummaryEditorCommand(bulletEditor, "italic");
    runSummaryEditorCommand(bulletEditor, "bulletList");

    expect(getSummaryToolbarState(bulletEditor)).toMatchObject({
      bold: true,
      italic: true,
      bullet: true,
    });

    bulletEditor.commands.insertContent("combo");
    expect(readEditorSnapshot(bulletEditor).summary).toBe("- **_combo_**");
  });

  test("uses TipTap standard shortcuts for inline marks", () => {
    const editor = createEditor("<p>combo</p>");

    setCursorAfterText(editor, "combo");
    pressEditorKey(editor, "b", { ctrlKey: true });
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: true });

    pressEditorKey(editor, "i", { ctrlKey: true });
    expect(getSummaryToolbarState(editor)).toMatchObject({
      bold: true,
      italic: true,
    });
  });

  test("derives blockers from explicit blocker lines", () => {
    const editor = createEditor("<p>Blocker: waiting on approval</p>");

    expect(readEditorSnapshot(editor)).toEqual({
      summary: "Blocker: waiting on approval",
      blockers: "waiting on approval",
    });
  });

  test("derives blockers from marked text", () => {
    const editor = createEditor(
      '<p>Waiting on <mark class="summary-blocker-mark">approval</mark></p>',
    );

    expect(readEditorSnapshot(editor)).toEqual({
      summary: "Waiting on approval",
      blockers: "approval",
    });
  });

  test("derives blockers from legacy marked text", () => {
    const editor = createEditor(
      '<p>Waiting on <mark class="summary-blocker-highlight">approval</mark></p>',
    );

    expect(readEditorSnapshot(editor)).toEqual({
      summary: "Waiting on approval",
      blockers: "approval",
    });
  });

  test("blocker can be selected as a tool for new text", () => {
    const editor = createEditor("<p></p>");

    runSummaryEditorCommand(editor, "blocker");
    expect(getSummaryToolbarState(editor)).toMatchObject({ blocker: true });

    editor.commands.insertContent("waiting on design");

    expect(readEditorSnapshot(editor)).toEqual({
      summary: "waiting on design",
      blockers: "waiting on design",
    });
  });

  test("blocker applies to selected text", () => {
    const editor = createEditor("<p>Waiting on approval</p>");

    setSelectionForText(editor, "approval");
    runSummaryEditorCommand(editor, "blocker");

    expect(getSummaryToolbarState(editor)).toMatchObject({ blocker: true });
    expect(readEditorSnapshot(editor)).toEqual({
      summary: "Waiting on approval",
      blockers: "approval",
    });
  });
});
