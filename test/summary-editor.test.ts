// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  getSummaryToolbarState,
  readEditorSnapshot,
  runSummaryEditorCommand,
  runSummaryEditorStructuralCommand,
  SummaryEditor,
  summaryEditorExtensions,
  type SummaryEditorCommand
} from "@/components/reports/summary-editor";

afterEach(() => {
  cleanup();
  testEditors.splice(0).forEach((editor) => editor.destroy());
});

const testEditors: Editor[] = [];

const inlineCommands = ["bold", "italic", "blocker"] as const satisfies readonly SummaryEditorCommand[];

type InlineCommand = (typeof inlineCommands)[number];

const blockCases = [
  { name: "paragraph", format: (content: string) => content },
  { name: "heading", command: "heading" as const, format: (content: string) => `## ${content}` },
  { name: "bulleted list", command: "bulletList" as const, format: (content: string) => `- ${content}` },
  { name: "numbered list", command: "orderedList" as const, format: (content: string) => `1. ${content}` },
  { name: "quote", command: "blockquote" as const, format: (content: string) => `> ${content}` }
];

function createEditor(content = "<p>combo</p>") {
  const editor = new Editor({
    extensions: summaryEditorExtensions,
    content
  });
  testEditors.push(editor);
  return editor;
}

function selectAll(editor: Editor) {
  editor.commands.focus();
  editor.commands.selectAll();
}

function inlineSubsets(): InlineCommand[][] {
  return inlineCommands.reduce<InlineCommand[][]>(
    (sets, command) => [...sets, ...sets.map((set) => [...set, command])],
    [[]]
  );
}

function expectedInlineContent(commands: InlineCommand[], value = "combo") {
  let content = value;

  if (commands.includes("italic")) {
    content = `_${content}_`;
  }

  if (commands.includes("bold")) {
    content = `**${content}**`;
  }

  return content;
}

function expectedBlockers(commands: InlineCommand[], ...values: string[]) {
  return commands.includes("blocker") ? values.join("\n") : "";
}

function inlineHtml(commands: InlineCommand[], value = "combo") {
  let html = value;

  if (commands.includes("blocker")) {
    html = `<mark>${html}</mark>`;
  }

  if (commands.includes("italic")) {
    html = `<em>${html}</em>`;
  }

  if (commands.includes("bold")) {
    html = `<strong>${html}</strong>`;
  }

  return html;
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

function pressEditorKey(editor: Editor, key: string, options: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ctrlKey: options.ctrlKey,
    metaKey: options.metaKey,
    shiftKey: options.shiftKey
  });

  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
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

  editor.commands.setTextSelection({ from: position, to: position + value.length });
}

function applyCommands(editor: Editor, commands: readonly SummaryEditorCommand[]) {
  commands.forEach((command) => {
    runSummaryEditorCommand(editor, command);
  });
}

function renderSummaryEditor() {
  return render(
    React.createElement(SummaryEditor, {
      initialSummary: "",
      initialBlockers: "",
      resetKey: "test",
      onChange: vi.fn()
    })
  );
}

describe("SummaryEditor", () => {
  test("updates toolbar state immediately after formatting shortcuts", async () => {
    renderSummaryEditor();

    await screen.findByRole("textbox", { name: "Summary" });
    const editor = document.querySelector<HTMLElement>(".ProseMirror");
    expect(editor).not.toBeNull();
    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });

    expect(bold.getAttribute("aria-pressed")).toBe("false");
    expect(italic.getAttribute("aria-pressed")).toBe("false");

    fireEvent.focus(editor!);
    fireEvent.keyDown(editor!, { key: "b", code: "KeyB", ctrlKey: true });

    await waitFor(() => {
      expect(bold.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.keyDown(editor!, { key: "i", code: "KeyI", ctrlKey: true });

    await waitFor(() => {
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });
  });

  test("toolbar buttons compose without canceling compatible formatting", async () => {
    renderSummaryEditor();

    await screen.findByRole("textbox", { name: "Summary" });
    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });
    const heading = screen.getByRole("button", { name: "Heading" });
    const bullet = screen.getByRole("button", { name: "Bulleted list" });

    fireEvent.click(bold);

    await waitFor(() => {
      expect(bold.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(italic);

    await waitFor(() => {
      expect(bold.getAttribute("aria-pressed")).toBe("true");
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(heading);

    await waitFor(() => {
      expect(heading.getAttribute("aria-pressed")).toBe("true");
      expect(bold.getAttribute("aria-pressed")).toBe("true");
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(bold);

    await waitFor(() => {
      expect(heading.getAttribute("aria-pressed")).toBe("true");
      expect(bold.getAttribute("aria-pressed")).toBe("false");
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(bullet);

    await waitFor(() => {
      expect(bullet.getAttribute("aria-pressed")).toBe("true");
      expect(italic.getAttribute("aria-pressed")).toBe("true");
    });

    fireEvent.click(italic);

    await waitFor(() => {
      expect(bullet.getAttribute("aria-pressed")).toBe("true");
      expect(italic.getAttribute("aria-pressed")).toBe("false");
    });
  });

  test("cursor formatting applies to typed text and survives block changes", () => {
    const editor = createEditor("<p></p>");

    runSummaryEditorCommand(editor, "bold");
    runSummaryEditorCommand(editor, "italic");
    runSummaryEditorCommand(editor, "heading");
    editor.commands.insertContent("combo");

    expect(readEditorSnapshot(editor).summary).toBe("## **_combo_**");

    editor.commands.setTextSelection({ from: 1, to: 6 });
    runSummaryEditorCommand(editor, "bulletList");

    expect(readEditorSnapshot(editor).summary).toBe("- **_combo_**");
  });

  test("cursor-aware inline toggles can turn off formatting inherited from text to the left", () => {
    const editor = createEditor("<p><strong><em>combo</em></strong></p>");

    setCursorAfterText(editor, "combo");
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: true, italic: true });

    runSummaryEditorCommand(editor, "bold");
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: false, italic: true });
    expect(editor.isActive("bold")).toBe(false);
    expect(editor.isActive("italic")).toBe(true);

    editor.commands.insertContent(" after-bold");
    expect(readEditorSnapshot(editor).summary).toBe("**_combo_** _after-bold_");

    runSummaryEditorCommand(editor, "italic");
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: false, italic: false });
    expect(editor.isActive("bold")).toBe(false);
    expect(editor.isActive("italic")).toBe(false);

    editor.commands.insertContent(" after-italic");
    expect(readEditorSnapshot(editor).summary).toBe("**_combo_** _after-bold_ after-italic");
  });

  test("formatting shortcuts use cursor-aware inline toggles", () => {
    const editor = createEditor("<p><strong><em>combo</em></strong></p>");

    setCursorAfterText(editor, "combo");
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: true, italic: true });

    pressEditorKey(editor, "b", { ctrlKey: true });
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: false, italic: true });

    editor.commands.insertContent(" after-bold");
    expect(readEditorSnapshot(editor).summary).toBe("**_combo_** _after-bold_");

    pressEditorKey(editor, "i", { ctrlKey: true });
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: false, italic: false });

    editor.commands.insertContent(" after-italic");
    expect(readEditorSnapshot(editor).summary).toBe("**_combo_** _after-bold_ after-italic");
  });

  test("formatting shortcuts ignore whitespace-only selections", () => {
    const editor = createEditor("<p>left right</p>");

    setSelectionForText(editor, " ");
    pressEditorKey(editor, "b", { ctrlKey: true });
    pressEditorKey(editor, "i", { ctrlKey: true });

    expect(readEditorSnapshot(editor).summary).toBe("left right");
    expect(getSummaryToolbarState(editor)).toMatchObject({ bold: false, italic: false });
  });

  test("cursor-aware blocker toggle can turn off blocker marking inherited from text to the left", () => {
    const editor = createEditor('<p><mark class="summary-blocker-highlight">blocked</mark></p>');

    setCursorAfterText(editor, "blocked");
    expect(getSummaryToolbarState(editor)).toMatchObject({ blocker: true });

    runSummaryEditorCommand(editor, "blocker");
    expect(getSummaryToolbarState(editor)).toMatchObject({ blocker: false });
    expect(editor.isActive("highlight")).toBe(false);

    editor.commands.insertContent(" plain");
    expect(readEditorSnapshot(editor)).toEqual({
      summary: "blocked plain",
      blockers: "blocked"
    });
  });

  test.each(inlineSubsets().map((commands) => [commands]))("keeps active inline formatting after splitting a list item with Enter: %s", (commands) => {
    const editor = createEditor(`<ul><li><p>${inlineHtml(commands, "combo")}</p></li></ul>`);

    setCursorAfterText(editor, "combo");
    pressEditorKey(editor, "Enter");

    expect(editor.isActive("bulletList")).toBe(true);
    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));

    editor.commands.insertContent("next");

    expect(readEditorSnapshot(editor)).toEqual({
      summary: `- ${expectedInlineContent(commands, "combo")}\n- ${expectedInlineContent(commands, "next")}`,
      blockers: expectedBlockers(commands, "combo", "next")
    });
  });

  test.each(inlineSubsets().map((commands) => [commands]))("keeps active inline formatting after exiting an empty list item with Enter: %s", (commands) => {
    const editor = createEditor(`<ul><li><p>${inlineHtml(commands, "combo")}</p></li></ul>`);

    setCursorAfterText(editor, "combo");
    pressEditorKey(editor, "Enter");
    pressEditorKey(editor, "Enter");

    expect(editor.isActive("bulletList")).toBe(false);
    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));

    editor.commands.insertContent("after");

    expect(readEditorSnapshot(editor)).toEqual({
      summary: `- ${expectedInlineContent(commands, "combo")}\n${expectedInlineContent(commands, "after")}`,
      blockers: expectedBlockers(commands, "combo", "after")
    });
  });

  test.each(inlineSubsets().map((commands) => [commands]))("keeps active inline formatting after indenting and outdenting list items: %s", (commands) => {
    const editor = createEditor(`<ul><li><p>first</p></li><li><p>${inlineHtml(commands, "combo")}</p></li></ul>`);

    setCursorAfterText(editor, "combo");
    pressEditorKey(editor, "Tab");

    expect(editor.isActive("bulletList")).toBe(true);
    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));
    expect(readEditorSnapshot(editor)).toEqual({
      summary: `- first\n  - ${expectedInlineContent(commands, "combo")}`,
      blockers: expectedBlockers(commands, "combo")
    });

    pressEditorKey(editor, "Tab", { shiftKey: true });

    expect(editor.isActive("bulletList")).toBe(true);
    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));
    expect(readEditorSnapshot(editor)).toEqual({
      summary: `- first\n- ${expectedInlineContent(commands, "combo")}`,
      blockers: expectedBlockers(commands, "combo")
    });
  });

  test.each(inlineSubsets().map((commands) => [commands]))("preserves inline formatting through direct structural commands: %s", (commands) => {
    const editor = createEditor(`<ul><li><p>first</p></li><li><p>${inlineHtml(commands, "combo")}</p></li></ul>`);

    setCursorAfterText(editor, "combo");
    runSummaryEditorStructuralCommand(editor, "indent");

    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));

    runSummaryEditorStructuralCommand(editor, "outdent");

    expect(editor.isActive("bold")).toBe(commands.includes("bold"));
    expect(editor.isActive("italic")).toBe(commands.includes("italic"));
    expect(editor.isActive("highlight")).toBe(commands.includes("blocker"));
  });

  test.each([
    ["block first", "block-first"],
    ["inline first", "inline-first"]
  ] as const)("preserves every compatible formatting combination when applying %s", (_label, order) => {
    for (const blockCase of blockCases) {
      for (const commands of inlineSubsets()) {
        const editor = createEditor();
        const blockCommands = blockCase.command ? [blockCase.command] : [];

        selectAll(editor);

        if (order === "block-first") {
          applyCommands(editor, blockCommands);
          selectAll(editor);
          applyCommands(editor, commands);
        } else {
          applyCommands(editor, commands);
          selectAll(editor);
          applyCommands(editor, blockCommands);
        }

        const snapshot = readEditorSnapshot(editor);
        const expectedSummary = blockCase.format(expectedInlineContent(commands));
        const expectedBlockers = commands.includes("blocker") ? "combo" : "";

        expect(snapshot.summary, `${order}: ${blockCase.name} with ${commands.join("+") || "plain"}`).toBe(expectedSummary);
        expect(snapshot.blockers, `${order}: ${blockCase.name} blockers with ${commands.join("+") || "plain"}`).toBe(expectedBlockers);
      }
    }
  });
});
