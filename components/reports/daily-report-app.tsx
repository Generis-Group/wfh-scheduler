"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";
import { signIn } from "next-auth/react";
import {
  Ban,
  Bold,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Heading2,
  Italic,
  List,
  ListOrdered,
  MoreHorizontal,
  PenLine,
  Quote,
  Save,
  Search,
  Send,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyReferenceState, ReferenceAppShell, ReferenceBadge } from "@/components/reports/reference-shell";
import { dateOnlyDisplayDate, dateOnlyString } from "@/lib/date-only";
import type { OAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import { cn } from "@/lib/utils";

type ActivitySource = "JIRA" | "GOOGLE_CALENDAR" | "GOOGLE_TASKS" | "MANUAL";

type Activity = {
  id: string;
  source: ActivitySource;
  title: string;
  description?: string | null;
  status?: string | null;
  sourceUrl?: string | null;
  startedAt?: string | Date | null;
  durationMinutes?: number | null;
  selected: boolean;
  employeeNote?: string | null;
};

type Report = {
  id: string;
  reportDate: string | Date;
  workLocation: "OFFICE" | "WFH" | "HYBRID" | "PTO" | "OUT_OF_OFFICE" | "UNKNOWN";
  summary: string;
  blockers: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  activities: Activity[];
  revisions?: Array<{ id: string; createdAt: string | Date }>;
};

type WorkLocation = Report["workLocation"];
type SummaryFormat = "heading" | "bold" | "italic" | "bullet" | "numbered" | "quote";
type SummaryFormatState = Record<SummaryFormat, boolean>;

type IntegrationStatus = {
  google: boolean;
  atlassian: boolean;
};

const sourceLabels: Record<ActivitySource, string> = {
  JIRA: "Jira",
  GOOGLE_CALENDAR: "Google Calendar",
  GOOGLE_TASKS: "Google Tasks",
  MANUAL: "Manual"
};

const sourceStyles: Record<ActivitySource, string> = {
  JIRA: "bg-[#2563eb]",
  GOOGLE_CALENDAR: "bg-[#facc15]",
  GOOGLE_TASKS: "bg-white border border-[#2563eb] dark:bg-[#0b1523]",
  MANUAL: "bg-white border border-[#2563eb] dark:bg-[#0b1523]"
};

const syncProviderLabels = {
  jira: "Jira",
  "google-calendar": "Calendar",
  "google-tasks": "Tasks"
} as const;

const workLocationOptions: Array<{ value: WorkLocation; label: string }> = [
  { value: "UNKNOWN", label: "Unspecified" },
  { value: "OFFICE", label: "Office" },
  { value: "WFH", label: "WFH" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "PTO", label: "PTO" },
  { value: "OUT_OF_OFFICE", label: "Out of office" }
];

const activityPageSize = 5;
const inactiveSummaryFormats: SummaryFormatState = {
  heading: false,
  bold: false,
  italic: false,
  bullet: false,
  numbered: false,
  quote: false
};

function toDate(value?: string | Date | null) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`);
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateInputValue(value: string | Date) {
  return dateOnlyString(value);
}

function formatReportDate(value: string | Date) {
  const date = dateOnlyDisplayDate(value);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short"
  }).formatToParts(date);
  const lookup = Object.fromEntries(formatted.map((part) => [part.type, part.value]));

  return `${lookup.month} ${lookup.day}, ${lookup.year} (${lookup.weekday})`;
}

function formatTimestamp(value?: string | Date | null) {
  const date = toDate(value);

  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return "-";
  }

  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (!hours) {
    return `${remaining}m`;
  }

  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

async function responseErrorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return body && typeof body.error === "string" ? body.error : fallback;
}

function statusTone(status?: string | null): "green" | "orange" | "blue" | "neutral" {
  const normalized = status?.toLowerCase() ?? "";

  if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("submitted")) {
    return "green";
  }

  if (normalized.includes("progress")) {
    return "blue";
  }

  if (normalized.includes("late") || normalized.includes("todo") || normalized.includes("draft")) {
    return "orange";
  }

  return "neutral";
}

function sourceIcon(source: ActivitySource) {
  if (source === "GOOGLE_CALENDAR") {
    return <CalendarDays className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "GOOGLE_TASKS") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  if (source === "MANUAL") {
    return <PenLine className="h-3.5 w-3.5 text-[#2563eb]" />;
  }

  return <div className="h-2.5 w-2.5 rotate-45 rounded-[2px] bg-white" />;
}

function sameActivityState(left: Activity[], right: Activity[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((activity, index) => {
    const other = right[index];
    return Boolean(
      other &&
        activity.id === other.id &&
        activity.selected === other.selected &&
        (activity.employeeNote ?? "") === (other.employeeNote ?? "")
    );
  });
}

function extractBlockerLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*blockers?:\s*(.*)$/i)?.[1])
    .filter((line): line is string => line !== undefined && line.trim().length > 0)
    .join("\n");
}

function stripLegacyBlockerPrefixes(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*blockers?:\s*(.*)$/i)?.[1] ?? line)
    .join("\n");
}

function uniqueLines(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    )
  ).join("\n");
}

function lineItems(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function editorSummaryForReport(report: Report) {
  return stripLegacyBlockerPrefixes(report.summary);
}

function blockersForReport(report: Report) {
  return uniqueLines([report.blockers, extractBlockerLines(report.summary)].filter(Boolean).join("\n"));
}

function splitSummaryForBlockerHighlights(value: string, blockerItems: string[]) {
  const blockers = blockerItems
    .map((item) => item.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (blockers.length === 0 || value.length === 0) {
    return [{ text: value, blocker: false }];
  }

  const lowerValue = value.toLowerCase();
  const lowerBlockers = blockers.map((blocker) => ({ value: blocker, lower: blocker.toLowerCase() }));
  const segments: Array<{ text: string; blocker: boolean }> = [];
  let index = 0;

  while (index < value.length) {
    let nextMatch: { start: number; blocker: string } | null = null;

    for (const blocker of lowerBlockers) {
      const start = lowerValue.indexOf(blocker.lower, index);

      if (start === -1) {
        continue;
      }

      if (!nextMatch || start < nextMatch.start || (start === nextMatch.start && blocker.value.length > nextMatch.blocker.length)) {
        nextMatch = { start, blocker: blocker.value };
      }
    }

    if (!nextMatch) {
      segments.push({ text: value.slice(index), blocker: false });
      break;
    }

    if (nextMatch.start > index) {
      segments.push({ text: value.slice(index, nextMatch.start), blocker: false });
    }

    segments.push({
      text: value.slice(nextMatch.start, nextMatch.start + nextMatch.blocker.length),
      blocker: true
    });
    index = nextMatch.start + nextMatch.blocker.length;
  }

  return segments.length ? segments : [{ text: value, blocker: false }];
}

function stripInlineFormatMarkers(value: string) {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/_(.*?)_/g, "$1");
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buttonTone(active: boolean, extraClassName = "") {
  return cn(
    "reference-menu-button",
    active && "bg-[#eef2ff] text-[#4338ca] ring-1 ring-[#c7d2fe] dark:bg-blue-400/15 dark:text-blue-100 dark:ring-blue-300/20",
    extraClassName
  );
}

function renderInlineSummaryHtml(text: string, blockerItems: string[]): string {
  const nodes: string[] = [];
  let index = 0;

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const close = text.indexOf("**", index + 2);

      if (close !== -1) {
        nodes.push(`<strong>${renderInlineSummaryHtml(text.slice(index + 2, close), blockerItems)}</strong>`);
        index = close + 2;
        continue;
      }
    }

    if (text[index] === "_") {
      const close = text.indexOf("_", index + 1);

      if (close !== -1) {
        nodes.push(`<em>${renderInlineSummaryHtml(text.slice(index + 1, close), blockerItems)}</em>`);
        index = close + 1;
        continue;
      }
    }

    const nextBold = text.indexOf("**", index);
    const nextItalic = text.indexOf("_", index);
    let nextMarker = [nextBold, nextItalic].filter((position) => position !== -1).sort((left, right) => left - right)[0] ?? text.length;

    if (nextMarker === index) {
      nextMarker = index + 1;
    }

    const plainText = text.slice(index, nextMarker);

    splitSummaryForBlockerHighlights(plainText, blockerItems).forEach((segment, segmentIndex) => {
      const escapedText = escapeHtml(segment.text);
      nodes.push(segment.blocker ? `<mark class="summary-blocker-highlight">${escapedText}</mark>` : escapedText);
    });
    index = nextMarker;
  }

  return nodes.join("");
}

type MarkdownListLine = {
  content: string;
  level: number;
  ordered: boolean;
};

function markdownListLevel(whitespace: string) {
  const columns = whitespace.split("").reduce((total, character) => total + (character === "\t" ? 2 : 1), 0);
  return Math.floor(columns / 2);
}

function renderMarkdownList(lines: MarkdownListLine[], startIndex: number, level: number, ordered: boolean, blockerItems: string[]) {
  const tagName = ordered ? "ol" : "ul";
  let html = `<${tagName}>`;
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];

    if (line.level < level || line.level !== level || line.ordered !== ordered) {
      break;
    }

    html += `<li>${renderInlineSummaryHtml(line.content, blockerItems)}`;
    index += 1;

    while (index < lines.length && lines[index].level > level) {
      const nested = renderMarkdownList(lines, index, lines[index].level, lines[index].ordered, blockerItems);
      html += nested.html;
      index = nested.index;
    }

    html += "</li>";
  }

  html += `</${tagName}>`;

  return { html, index };
}

function renderMarkdownListBlock(lines: string[], startIndex: number, blockerItems: string[]) {
  const listLines: MarkdownListLine[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const match = lines[index].match(/^(\s*)(-|\d+\.)\s+(.*)$/);

    if (!match) {
      break;
    }

    listLines.push({
      content: match[3],
      level: markdownListLevel(match[1]),
      ordered: /^\d+\.$/.test(match[2])
    });
    index += 1;
  }

  let html = "";
  let listIndex = 0;

  while (listIndex < listLines.length) {
    const rendered = renderMarkdownList(listLines, listIndex, listLines[listIndex].level, listLines[listIndex].ordered, blockerItems);
    html += rendered.html;
    listIndex = rendered.index;
  }

  return { html, index };
}

function markdownToEditorHtml(value: string, blockerItems: string[]) {
  if (!value) {
    return "";
  }

  const lines = value.split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*(-|\d+\.)\s+/.test(line)) {
      const rendered = renderMarkdownListBlock(lines, index, blockerItems);
      html.push(rendered.html);
      index = rendered.index;
      continue;
    }

    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      html.push(`<h2>${renderInlineSummaryHtml(heading[1], blockerItems)}</h2>`);
      index += 1;
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const nextQuote = lines[index].match(/^>\s?(.*)$/);
        if (!nextQuote) {
          break;
        }
        quoteLines.push(renderInlineSummaryHtml(nextQuote[1], blockerItems));
        index += 1;
      }
      html.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    html.push(line ? `<div>${renderInlineSummaryHtml(line, blockerItems)}</div>` : "<div><br></div>");
    index += 1;
  }

  return html.join("");
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).map(inlineNodeToMarkdown).join("");
  }

  const content = Array.from(node.childNodes).map(inlineNodeToMarkdown).join("");
  const tagName = node.tagName.toLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (tagName === "strong" || tagName === "b") {
    return formattedInlineMarkdown(content, "**");
  }

  if (tagName === "em" || tagName === "i") {
    return formattedInlineMarkdown(content, "_");
  }

  return content;
}

function listItemTextToMarkdown(item: Element) {
  return Array.from(item.childNodes)
    .filter((child) => !(child instanceof HTMLElement && (child.tagName.toLowerCase() === "ul" || child.tagName.toLowerCase() === "ol")))
    .map(inlineNodeToMarkdown)
    .join("")
    .trim();
}

function listNodeToMarkdown(node: HTMLElement, depth = 0): string[] {
  const ordered = node.tagName.toLowerCase() === "ol";
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  Array.from(node.children).forEach((child, index) => {
    if (!(child instanceof HTMLElement) || child.tagName.toLowerCase() !== "li") {
      return;
    }

    const text = listItemTextToMarkdown(child);

    if (text) {
      lines.push(`${indent}${ordered ? `${index + 1}.` : "-"} ${text}`);
    }

    Array.from(child.children)
      .filter((nested): nested is HTMLElement => nested instanceof HTMLElement && (nested.tagName.toLowerCase() === "ul" || nested.tagName.toLowerCase() === "ol"))
      .forEach((nested) => {
        lines.push(...listNodeToMarkdown(nested, depth + 1));
      });
  });

  return lines;
}

function blockNodeToMarkdown(node: Node): string[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text ? [text] : [];
  }

  if (!(node instanceof HTMLElement)) {
    return Array.from(node.childNodes).flatMap(blockNodeToMarkdown);
  }

  const tagName = node.tagName.toLowerCase();

  if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
    const text = inlineNodeToMarkdown(node).trim();
    return text ? [`## ${text}`] : [""];
  }

  if (tagName === "blockquote") {
    const lines = inlineNodeToMarkdown(node)
      .split(/\n/)
      .map((line) => line.trim());

    return lines.map((line) => (line ? `> ${line}` : ""));
  }

  if (tagName === "ul") {
    return listNodeToMarkdown(node);
  }

  if (tagName === "ol") {
    return listNodeToMarkdown(node);
  }

  if (tagName === "div" || tagName === "p") {
    return [inlineNodeToMarkdown(node).replace(/\n$/g, "")];
  }

  if (tagName === "br") {
    return [""];
  }

  return Array.from(node.childNodes).flatMap(blockNodeToMarkdown);
}

function editorElementToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes)
    .flatMap(blockNodeToMarkdown)
    .join("\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

function unwrapElement(element: HTMLElement) {
  element.replaceWith(...Array.from(element.childNodes));
}

function editorBlockerMarks(editor: HTMLElement) {
  return uniqueLines(
    Array.from(editor.querySelectorAll<HTMLElement>("mark.summary-blocker-highlight"))
      .map((mark) => mark.textContent?.trim() ?? "")
      .filter(Boolean)
      .join("\n")
  );
}

function refreshBlockerHighlights(editor: HTMLElement) {
  const normalizedBlockers = new Set(lineItems(editorBlockerMarks(editor)).map((item) => item.toLowerCase()));

  editor.querySelectorAll<HTMLElement>("mark.summary-blocker-highlight").forEach((mark) => {
    const text = mark.textContent?.trim().toLowerCase() ?? "";

    if (!normalizedBlockers.has(text)) {
      unwrapElement(mark);
    }
  });
}

export function DailyReportApp({
  initialReport,
  date,
  userName,
  userEmail,
  userRole,
  userStatus,
  timezone,
  mustChangePassword,
  integrationStatus = { google: false, atlassian: false },
  oauthConfig = { google: true, atlassian: true }
}: {
  initialReport: Report;
  date: string;
  userName?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  userStatus?: string | null;
  timezone?: string | null;
  mustChangePassword?: boolean;
  integrationStatus?: IntegrationStatus;
  oauthConfig?: OAuthProviderConfig;
}) {
  const router = useRouter();
  const [report, setReport] = useState(initialReport);
  const [summary, setSummary] = useState(() => editorSummaryForReport(initialReport));
  const [blockers, setBlockers] = useState(() => blockersForReport(initialReport));
  const [workLocation, setWorkLocation] = useState<WorkLocation>(initialReport.workLocation);
  const [activities, setActivities] = useState(initialReport.activities);
  const [deletedActivityIds, setDeletedActivityIds] = useState<string[]>([]);
  const [openActivityMenu, setOpenActivityMenu] = useState<{ id: string; top: number; left: number } | null>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activitySearch, setActivitySearch] = useState("");
  const [activeSummaryFormats, setActiveSummaryFormats] = useState<SummaryFormatState>(inactiveSummaryFormats);
  const summaryEditorRef = useRef<HTMLDivElement>(null);

  const reportDate = dateInputValue(date);

  useEffect(() => {
    setReport(initialReport);
    setSummary(editorSummaryForReport(initialReport));
    setBlockers(blockersForReport(initialReport));
    setWorkLocation(initialReport.workLocation);
    setActivities(initialReport.activities);
    setDeletedActivityIds([]);
    setOpenActivityMenu(null);
    setImportMenuOpen(false);
    setMessage(null);
    setActivityPage(1);
    setActivitySearch("");
    setActiveSummaryFormats(inactiveSummaryFormats);
  }, [initialReport, date]);

  useEffect(() => {
    const editor = summaryEditorRef.current;

    if (!editor) {
      return;
    }

    editor.innerHTML = markdownToEditorHtml(
      editorSummaryForReport(initialReport),
      blockersForReport(initialReport).split(/\n/).filter(Boolean)
    );
  }, [initialReport]);

  function setActivity(id: string, patch: Partial<Activity>) {
    setActivities((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateSummary(nextSummary: string) {
    setSummary(nextSummary);
  }

  function currentSummarySelection() {
    const editor = summaryEditorRef.current;
    const selection = document.getSelection();

    if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) {
      return null;
    }

    return { editor, selection };
  }

  function summarySelectionIsWhitespaceRange() {
    const current = currentSummarySelection();

    if (!current) {
      return false;
    }

    const selectedText = current.selection.toString();

    return !current.selection.isCollapsed && selectedText.length > 0 && !selectedText.trim();
  }

  function selectionHasExplicitInlineFormat(format: Extract<SummaryFormat, "bold" | "italic">) {
    const current = currentSummarySelection();

    if (!current) {
      return false;
    }

    function nodeHasFormat(node: Node | null) {
      let currentNode: Node | null = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;

      while (currentNode instanceof HTMLElement && currentNode !== current?.editor) {
        const tagName = currentNode.tagName.toLowerCase();

        if (format === "bold" && (tagName === "strong" || tagName === "b" || currentNode.style.fontWeight === "bold")) {
          return true;
        }

        if (format === "italic" && (tagName === "em" || tagName === "i" || currentNode.style.fontStyle === "italic")) {
          return true;
        }

        currentNode = currentNode.parentElement;
      }

      return false;
    }

    return nodeHasFormat(current.selection.anchorNode) || nodeHasFormat(current.selection.focusNode);
  }

  function inlineFormatIsActive(format: Extract<SummaryFormat, "bold" | "italic">) {
    if (selectionHasExplicitInlineFormat(format)) {
      return true;
    }

    const block = document.queryCommandValue("formatBlock").toLowerCase();
    const command = format === "bold" ? "bold" : "italic";
    const active = document.queryCommandState(command);

    if (format === "bold" && (block === "h1" || block === "h2" || block === "h3")) {
      return false;
    }

    if (format === "italic" && block === "blockquote") {
      return false;
    }

    return active;
  }

  function updateToolbarState() {
    if (summarySelectionIsWhitespaceRange()) {
      setActiveSummaryFormats(inactiveSummaryFormats);
      return;
    }

    setActiveSummaryFormats({
      bold: inlineFormatIsActive("bold"),
      italic: inlineFormatIsActive("italic"),
      bullet: document.queryCommandState("insertUnorderedList"),
      numbered: document.queryCommandState("insertOrderedList"),
      heading: document.queryCommandValue("formatBlock").toLowerCase() === "h2",
      quote: document.queryCommandValue("formatBlock").toLowerCase() === "blockquote"
    });
  }

  function syncSummaryFromEditor() {
    const snapshot = readSummaryEditorSnapshot();

    if (!snapshot) {
      return;
    }

    setSummary(snapshot.summary);
    setBlockers(snapshot.blockers);
    updateToolbarState();
  }

  function readSummaryEditorSnapshot() {
    const editor = summaryEditorRef.current;

    if (!editor) {
      return null;
    }

    refreshBlockerHighlights(editor);

    return {
      summary: editorElementToMarkdown(editor),
      blockers: editorBlockerMarks(editor)
    };
  }

  function shouldIgnoreSummaryCommand(command: string) {
    return (
      summarySelectionIsWhitespaceRange() &&
      ["bold", "italic", "formatBlock", "insertUnorderedList", "insertOrderedList"].includes(command)
    );
  }

  function runSummaryCommand(command: string, value?: string) {
    if (shouldIgnoreSummaryCommand(command)) {
      updateToolbarState();
      return;
    }

    summaryEditorRef.current?.focus();
    document.execCommand(command, false, value);
    syncSummaryFromEditor();
    window.requestAnimationFrame(() => {
      updateToolbarState();
    });
  }

  function toggleSummaryBlock(format: Extract<SummaryFormat, "heading" | "quote">) {
    const currentBlock = document.queryCommandValue("formatBlock").toLowerCase();
    const block = format === "heading" ? "h2" : "blockquote";

    runSummaryCommand("formatBlock", currentBlock === block ? "div" : block);
  }

  function placePlainSummaryCursorAtEnd() {
    const editor = summaryEditorRef.current;

    if (!editor) {
      return;
    }

    editor.focus();

    if (!editor.lastElementChild || editor.lastElementChild.textContent?.trim()) {
      editor.appendChild(document.createElement("div"));
      editor.lastElementChild?.appendChild(document.createElement("br"));
    }

    const target = editor.lastElementChild ?? editor;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);

    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    if (document.queryCommandState("bold")) {
      document.execCommand("bold");
    }

    if (document.queryCommandState("italic")) {
      document.execCommand("italic");
    }

    document.execCommand("formatBlock", false, "div");
    setActiveSummaryFormats(inactiveSummaryFormats);
  }

  function handleSummaryMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    placePlainSummaryCursorAtEnd();
    syncSummaryFromEditor();
  }

  function handleSummaryMouseUp() {
    window.requestAnimationFrame(() => {
      updateToolbarState();
    });
  }

  function handleSummaryKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") {
      return;
    }

    event.preventDefault();

    if (event.shiftKey) {
      runSummaryCommand("outdent");
      return;
    }

    if (document.queryCommandState("insertUnorderedList") || document.queryCommandState("insertOrderedList")) {
      runSummaryCommand("indent");
      return;
    }

    runSummaryCommand("insertText", "\t");
  }

  function handleSummaryKeyUp() {
    updateToolbarState();
  }

  function markSummarySelectionAsBlocker() {
    const selected = window.getSelection()?.toString() ?? "";
    const selectedBlockers = selected
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*blockers?:\s*/i, "").trim())
      .map(stripInlineFormatMarkers)
      .filter(Boolean);

    if (selectedBlockers.length === 0) {
      setMessage("Select summary text to mark as a blocker.");
      return;
    }

    const nextBlockers = uniqueLines([blockers, selectedBlockers.join("\n")].filter(Boolean).join("\n"));

    setBlockers(nextBlockers);
    window.requestAnimationFrame(() => {
      const editor = summaryEditorRef.current;

      if (editor) {
        const nextSummary = editorElementToMarkdown(editor);

        setSummary(nextSummary);
        editor.innerHTML = markdownToEditorHtml(nextSummary, lineItems(nextBlockers));
        editor.focus();
      }
    });
  }

  function removeActivity(activity: Activity) {
    if (activity.source !== "MANUAL") {
      setActivity(activity.id, { selected: false });
      setOpenActivityMenu(null);
      setMessage("Work item removed from this report. Save the draft to keep this change.");
      return;
    }

    setActivities((items) => items.filter((item) => item.id !== activity.id));
    if (!activity.id.startsWith("manual-new-")) {
      setDeletedActivityIds((current) => [...new Set([...current, activity.id])]);
    }
    setOpenActivityMenu(null);
    setMessage("Manual work item deleted. Save the draft to keep this change.");
  }

  function toggleActivityMenu(activityId: string, event: MouseEvent<HTMLButtonElement>) {
    if (openActivityMenu?.id === activityId) {
      setOpenActivityMenu(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 204;
    const gap = 8;
    const top = Math.min(window.innerHeight - menuHeight - 12, Math.max(12, rect.bottom + gap));
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth));

    setOpenActivityMenu({ id: activityId, top, left });
  }

  useEffect(() => {
    if (!openActivityMenu) {
      return;
    }

    function closeMenu() {
      setOpenActivityMenu(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [openActivityMenu]);

  async function saveReport(submit = false) {
    setIsBusy(true);
    setMessage(null);
    const editorSnapshot = readSummaryEditorSnapshot();
    const payloadSummary = editorSnapshot?.summary ?? summary;
    const payloadBlockers = editorSnapshot?.blockers ?? blockers;

    if (editorSnapshot) {
      setSummary(editorSnapshot.summary);
      setBlockers(editorSnapshot.blockers);
    }

    const manualActivities = activities
      .filter((activity) => activity.id.startsWith("manual-new-"))
      .map((activity) => ({
        title: activity.title,
        employeeNote: activity.employeeNote ?? null,
        status: activity.status,
        durationMinutes: activity.durationMinutes ?? null
      }));

    const reportPayload = {
      summary: payloadSummary,
      blockers: payloadBlockers,
      workLocation,
      activityUpdates: activities
        .map((activity) => ({
          id: activity.id,
          selected: activity.selected,
          employeeNote: activity.employeeNote ?? null
        }))
        .filter((activity) => !activity.id.startsWith("manual-new-")),
      deletedActivityIds,
      manualActivities
    };

    const response = await fetch(report.id ? `/api/reports/${report.id}` : "/api/reports", {
      method: report.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report.id ? reportPayload : { ...reportPayload, date: reportDate })
    });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to save report.");
      setIsBusy(false);
      return;
    }

    const data = await response.json();
    let nextReport = data.report as Report;

    if (submit) {
      const submitResponse = await fetch(`/api/reports/${nextReport.id}/submit`, { method: "POST" });
      if (!submitResponse.ok) {
        setMessage((await submitResponse.json()).error ?? "Unable to submit report.");
        setIsBusy(false);
        return;
      }
      nextReport = (await submitResponse.json()).report as Report;
    }

    setReport(nextReport);
    setSummary(editorSummaryForReport(nextReport));
    setBlockers(blockersForReport(nextReport));
    setActivities(nextReport.activities);
    setDeletedActivityIds([]);
    setWorkLocation(nextReport.workLocation);
    setMessage(submit ? "Submitted for review." : "Draft saved.");
    setIsBusy(false);
  }

  async function deleteDraft() {
    if (!report.id || report.status !== "DRAFT") {
      return;
    }

    if (!window.confirm("Delete this draft? This cannot be undone.")) {
      return;
    }

    setIsBusy(true);
    setMessage(null);

    const response = await fetch(`/api/reports/${report.id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage((await response.json()).error ?? "Unable to delete draft.");
      setIsBusy(false);
      return;
    }

    setReport((current) => ({
      ...current,
      id: "",
      summary: "",
      blockers: "",
      workLocation: "UNKNOWN",
      activities: [],
      updatedAt: null
    }));
    setSummary("");
    setBlockers("");
    if (summaryEditorRef.current) {
      summaryEditorRef.current.innerHTML = "";
    }
    setWorkLocation("UNKNOWN");
    setActivities([]);
    setDeletedActivityIds([]);
    setMessage("Draft deleted.");
    setIsBusy(false);
  }

  async function sync(provider: "jira" | "google-calendar" | "google-tasks") {
    setIsBusy(true);
    const providerLabel = syncProviderLabels[provider];
    setMessage(`Importing ${providerLabel.toLowerCase()}...`);

    try {
      const response = await fetch(`/api/sync/${provider}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date })
      });

      if (!response.ok) {
        setMessage(await responseErrorMessage(response, `${providerLabel} import failed.`));
        return;
      }

      const result = (await response.json()) as { importedCount: number; skippedCount: number; staleCount?: number };
      const activityResponse = await fetch(`/api/activity?date=${encodeURIComponent(reportDate)}`);

      if (activityResponse.ok) {
        const data = (await activityResponse.json()) as { activities: Activity[] };
        setActivities(data.activities);
        setReport((current) => ({ ...current, activities: data.activities }));
        setActivityPage(1);
      }

      setMessage(
        result.importedCount > 0
          ? `${providerLabel} import complete: ${result.importedCount} work item${result.importedCount === 1 ? "" : "s"} found${result.staleCount ? `, ${result.staleCount} stale item${result.staleCount === 1 ? "" : "s"} hidden` : ""}.`
          : `No ${providerLabel.toLowerCase()} work items found for this date.`
      );
    } catch {
      setMessage(`${providerLabel} import failed. Check your connection and try again.`);
    } finally {
      setIsBusy(false);
    }
  }

  function connectProvider(provider: "google" | "atlassian") {
    signIn(
      provider,
      { callbackUrl: "/" },
      provider === "google"
        ? { access_type: "offline", prompt: "consent select_account", scope: GOOGLE_OAUTH_SCOPE }
        : {
            audience: "api.atlassian.com",
            prompt: "consent",
            scope: ATLASSIAN_OAUTH_SCOPE
          }
    );
  }

  async function copyActivityTitle(activity: Activity) {
    await navigator.clipboard?.writeText(activity.title);
    setOpenActivityMenu(null);
    setMessage("Activity title copied.");
  }

  function openActivitySource(activity: Activity) {
    if (!activity.sourceUrl || activity.sourceUrl === "#") {
      setMessage("This activity does not have a source link.");
      setOpenActivityMenu(null);
      return;
    }

    window.open(activity.sourceUrl, "_blank", "noopener,noreferrer");
    setOpenActivityMenu(null);
  }

  const canSyncJira = integrationStatus.atlassian;
  const canSyncGoogle = integrationStatus.google;
  const hasPendingManual = activities.some((activity) => activity.id.startsWith("manual-new-"));
  const selectedCount = activities.filter((activity) => activity.selected).length;
  const lastSavedLabel = formatTimestamp(report.updatedAt);
  const blockerItems = blockers
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedActivitySearch = activitySearch.trim().toLowerCase();
  const filteredActivities = normalizedActivitySearch
    ? activities.filter((activity) =>
        [
          activity.title,
          activity.description,
          activity.status,
          sourceLabels[activity.source],
          formatDuration(activity.durationMinutes)
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedActivitySearch)
      )
    : activities;
  const filteredSelectedCount = filteredActivities.filter((activity) => activity.selected).length;
  const activityPageCount = Math.max(1, Math.ceil(filteredActivities.length / activityPageSize));
  const currentActivityPage = Math.min(activityPage, activityPageCount);
  const activityPageStart = filteredActivities.length === 0 ? 0 : (currentActivityPage - 1) * activityPageSize + 1;
  const activityPageEnd = Math.min(currentActivityPage * activityPageSize, filteredActivities.length);
  const pagedActivities = filteredActivities.slice((currentActivityPage - 1) * activityPageSize, currentActivityPage * activityPageSize);

  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(filteredActivities.length / activityPageSize));

    setActivityPage((current) => Math.min(current, pageCount));
  }, [filteredActivities.length]);
  const hasUnsavedChanges =
    summary !== editorSummaryForReport(report) ||
    blockers !== blockersForReport(report) ||
    workLocation !== report.workLocation ||
    !sameActivityState(activities, report.activities) ||
    deletedActivityIds.length > 0 ||
    hasPendingManual;

  function goToReportDate(nextDate: string) {
    if (!nextDate) {
      return;
    }

    if (nextDate !== reportDate && hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave this date without saving?")) {
      return;
    }

    router.push(`/?date=${nextDate}`);
  }

  function shiftReportDate(days: number) {
    const nextDate = toDate(reportDate) ?? new Date();
    nextDate.setDate(nextDate.getDate() + days);
    goToReportDate(nextDate.toISOString().slice(0, 10));
  }

  const menuActivity = openActivityMenu ? activities.find((activity) => activity.id === openActivityMenu.id) : null;

  return (
    <ReferenceAppShell
      active="report"
      variant="employee"
      userName={userName}
      userEmail={userEmail}
      userRole={userRole}
      userStatus={userStatus}
      timezone={timezone}
      mustChangePassword={mustChangePassword}
      currentReportDate={reportDate}
    >
      <main className="reference-page !pb-4 !pt-3">
        <section className="overflow-visible rounded-[18px] bg-white shadow-[0_14px_38px_rgba(15,23,42,0.09)] ring-1 ring-[#e6ebf3] dark:bg-[#0f1b2a] dark:ring-[#1d2d43]">
          <div className="flex flex-col gap-4 px-6 pb-5 pt-6 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between min-[1200px]:px-8">
            <div>
              <h1 className="text-[28px] font-semibold leading-tight tracking-normal text-[#111827] dark:text-foreground">Daily Update</h1>
              <p className="mt-1.5 text-sm text-[#667085] dark:text-muted-foreground">Share what you worked on today.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {report.id && report.status === "DRAFT" ? (
                <Button
                  variant="outline"
                  className="h-11 rounded-[8px] bg-white px-5 text-sm font-medium text-[#b42318] shadow-[0_2px_7px_rgba(15,23,42,0.06)] ring-1 ring-[#f3b8b2] hover:bg-[#fff5f5] dark:bg-[#101d2e] dark:text-red-300 dark:ring-red-400/25 dark:hover:bg-red-400/10"
                  disabled={isBusy}
                  onClick={deleteDraft}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete draft
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="h-11 rounded-[8px] bg-white px-6 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.06)] ring-1 ring-[#d9dee8] hover:bg-[#f8fafc] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]"
                disabled={isBusy}
                onClick={() => saveReport(false)}
              >
                <Save className="mr-2 h-4 w-4" />
                {isBusy ? "Saving..." : "Save draft"}
              </Button>
              <Button
                className="h-11 rounded-[8px] bg-gradient-to-br from-[#4f6dfd] to-[#4a28df] px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(79,109,253,0.34)] hover:from-[#4663ed] hover:to-[#3f21c8]"
                disabled={isBusy || (report.status === "SUBMITTED" && !hasUnsavedChanges)}
                onClick={() => saveReport(true)}
              >
                <Send className="mr-2 h-4 w-4" />
                {isBusy ? "Submitting..." : "Submit update"}
              </Button>
            </div>
          </div>

          <div className="mx-6 h-px bg-[#e5e9f1] dark:bg-[#213149] min-[1200px]:mx-8" />

          <div className="grid gap-3 px-6 py-4 min-[900px]:grid-cols-[minmax(320px,430px)_minmax(190px,240px)_minmax(260px,344px)] min-[900px]:items-center min-[900px]:justify-between min-[1200px]:px-8">
            <div className="flex w-full items-center gap-2">
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#475467] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] transition hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-muted-foreground dark:ring-[#263a55] dark:hover:bg-[#132239] dark:hover:text-foreground"
                aria-label="Previous day"
                onClick={() => shiftReportDate(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <label className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[8px] bg-white px-5 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:text-foreground dark:ring-[#263a55]">
                <CalendarDays className="h-4 w-4 shrink-0 text-[#475467] dark:text-muted-foreground" />
                <span className="truncate">{formatReportDate(date)}</span>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(event) => goToReportDate(event.target.value)}
                  className="absolute inset-0 h-full cursor-pointer border-0 bg-transparent opacity-0"
                  aria-label="Select report date"
                />
              </label>
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-white text-[#475467] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] transition hover:bg-[#f8fafc] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#101d2e] dark:text-muted-foreground dark:ring-[#263a55] dark:hover:bg-[#132239] dark:hover:text-foreground"
                aria-label="Next day"
                onClick={() => shiftReportDate(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <label className="flex min-h-11 w-full items-center gap-3 rounded-[8px] bg-white px-4 text-sm shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#667085] dark:text-muted-foreground">Location</span>
              <Select
                value={workLocation}
                onChange={(event) => setWorkLocation(event.target.value as WorkLocation)}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-sm font-semibold text-[#111827] shadow-none focus-visible:ring-0 dark:bg-transparent dark:text-foreground"
                aria-label="Work location"
              >
                {workLocationOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex min-h-11 w-full items-center gap-4 rounded-[8px] bg-white px-4 text-sm shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <span className={cn("inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-medium", hasUnsavedChanges ? "bg-orange-50 text-orange-700 dark:bg-orange-400/10 dark:text-orange-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300")}>
                <CheckCircle2 className="h-4 w-4" />
                {hasUnsavedChanges ? "Unsaved changes" : report.status === "SUBMITTED" ? "Submitted" : report.id ? "Draft saved" : "No saved draft"}
              </span>
              <span className="text-[#667085] dark:text-muted-foreground">{lastSavedLabel === "-" ? "Not saved yet" : `Last saved ${lastSavedLabel}`}</span>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[#e8ecf3] px-6 py-5 dark:border-[#213149] min-[1200px]:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)] min-[1200px]:px-8">
            <section className="flex min-h-[660px] flex-col rounded-[12px] bg-white p-5 ring-1 ring-[#e1e6ef] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-normal text-[#111827] dark:text-foreground">Work items</h2>
                    <ReferenceBadge tone="neutral" className="px-3 py-1.5 text-xs">{selectedCount} selected</ReferenceBadge>
                  </div>
                  <p className="mt-2 text-sm text-[#667085] dark:text-muted-foreground">Import and select work to include in your update.</p>
                </div>
                <div className="relative">
                  <Button
                    variant="outline"
                    className="h-10 rounded-[8px] bg-white px-4 text-sm font-medium text-[#111827] shadow-[0_2px_7px_rgba(15,23,42,0.04)] ring-1 ring-[#dfe4ee] hover:bg-[#f8fafc] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55]"
                    disabled={isBusy}
                    onClick={() => setImportMenuOpen((open) => !open)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Import
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                  {importMenuOpen ? (
                    <div className="absolute right-0 top-12 z-30 w-64 rounded-[12px] bg-white p-2 shadow-[0_18px_42px_rgba(15,23,42,0.16)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]">
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncJira && !oauthConfig.atlassian}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncJira ? sync("jira") : connectProvider("atlassian");
                        }}
                      >
                        {canSyncJira ? "Import Jira" : "Connect Jira"}
                      </button>
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncGoogle && !oauthConfig.google}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncGoogle ? sync("google-calendar") : connectProvider("google");
                        }}
                      >
                        {canSyncGoogle ? "Import Calendar" : "Connect Google"}
                      </button>
                      <button
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#344054] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
                        disabled={!canSyncGoogle && !oauthConfig.google}
                        onClick={() => {
                          setImportMenuOpen(false);
                          canSyncGoogle ? sync("google-tasks") : connectProvider("google");
                        }}
                      >
                        {canSyncGoogle ? "Import Tasks" : "Connect Google Tasks"}
                      </button>
                      <Link
                        className="flex w-full items-center rounded-[8px] px-3 py-2.5 text-left text-sm font-medium text-[#2563eb] hover:bg-[#eff6ff] dark:text-[#93c5fd] dark:hover:bg-white/5"
                        href="/settings"
                        onClick={() => setImportMenuOpen(false)}
                      >
                        Manage integrations
                      </Link>
                    </div>
                  ) : null}
                </div>
              </div>

              <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                <Input
                  value={activitySearch}
                  onChange={(event) => {
                    setActivitySearch(event.target.value);
                    setActivityPage(1);
                  }}
                  placeholder="Search work items"
                  className="h-10 rounded-[8px] bg-white pl-9 text-sm shadow-none ring-1 ring-[#dfe4ee] focus-visible:ring-2 dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                  aria-label="Search work items"
                />
              </label>

              <div className="mt-4 h-[412px] space-y-2.5 overflow-y-auto pr-1">
                {activities.length === 0 ? (
                  <EmptyReferenceState>No activities yet. Import work from Jira, Calendar, or Tasks.</EmptyReferenceState>
                ) : pagedActivities.length === 0 ? (
                  <EmptyReferenceState>No work items match your search.</EmptyReferenceState>
                ) : (
                  pagedActivities.map((activity) => (
                    <article
                      key={activity.id}
                      className="grid min-h-[74px] grid-cols-[28px_40px_minmax(0,1fr)_auto_68px_28px] items-center gap-3 rounded-[10px] bg-white px-4 py-3 ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
                    >
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-[#cbd5e1] accent-[#4f46e5]"
                        checked={activity.selected}
                        onChange={(event) => setActivity(activity.id, { selected: event.target.checked })}
                        aria-label={`Include ${activity.title}`}
                      />
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-[8px]", sourceStyles[activity.source])}>{sourceIcon(activity.source)}</div>
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-[#111827] dark:text-foreground">
                          {activity.sourceUrl && activity.sourceUrl !== "#" ? (
                            <a href={activity.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-[#2563eb]">
                              {activity.title || "Untitled activity"}
                            </a>
                          ) : (
                            activity.title || "Untitled activity"
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#667085] dark:text-muted-foreground">
                          <span className="shrink-0">{sourceLabels[activity.source]}</span>
                          {activity.description ? (
                            <>
                              <span className="text-[#98a2b3]">•</span>
                              <span className="truncate">{activity.description}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <ReferenceBadge tone={statusTone(activity.status)} className="justify-self-start px-2.5 py-1 text-xs">
                        {activity.status || "Not set"}
                      </ReferenceBadge>
                      <div className="text-base font-medium text-[#111827] dark:text-foreground">{formatDuration(activity.durationMinutes)}</div>
                      <button
                        className="reference-menu-button"
                        aria-label={`More actions for ${activity.title}`}
                        onClick={(event) => toggleActivityMenu(activity.id, event)}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </article>
                  ))
                )}
              </div>

              <div className="mt-auto border-t border-[#e6eaf2] pt-4 dark:border-[#263a55]">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#667085] dark:text-muted-foreground">
                  <span>
                    {selectedCount} of {activities.length} items selected
                    {activities.length > 0
                      ? normalizedActivitySearch
                        ? `, showing ${activityPageStart}-${activityPageEnd} of ${filteredActivities.length} matches (${filteredSelectedCount} selected)`
                        : `, showing ${activityPageStart}-${activityPageEnd}`
                      : ""}
                  </span>
                </div>
                <div className="mt-3 flex min-h-8 justify-end">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 rounded-[7px] bg-white p-0 dark:bg-[#0f1b2a]"
                      aria-label="Previous work items page"
                      disabled={currentActivityPage === 1 || filteredActivities.length === 0}
                      onClick={() => setActivityPage((page) => Math.max(1, page - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-20 text-center text-xs font-medium text-[#667085] dark:text-muted-foreground">
                      Page {currentActivityPage} of {activityPageCount}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 rounded-[7px] bg-white p-0 dark:bg-[#0f1b2a]"
                      aria-label="Next work items page"
                      disabled={currentActivityPage === activityPageCount || filteredActivities.length === 0}
                      onClick={() => setActivityPage((page) => Math.min(activityPageCount, page + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="min-h-[600px] rounded-[12px] bg-white p-5 ring-1 ring-[#e1e6ef] dark:bg-[#101d2e] dark:ring-[#263a55]">
              <div>
                <h2 className="text-xl font-semibold tracking-normal text-[#111827] dark:text-foreground">Summary</h2>
                <p className="mt-2 text-sm text-[#667085] dark:text-muted-foreground">Add a brief summary of your work.</p>
              </div>
              <div className="mt-4 rounded-[10px] bg-[#f7f9fc] p-2 ring-1 ring-[#dfe4ee] dark:bg-[#0b1523] dark:ring-[#263a55]">
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.heading)}
                    title="Heading"
                    aria-label="Heading"
                    aria-pressed={activeSummaryFormats.heading}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleSummaryBlock("heading")}
                  >
                    <Heading2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.bold)}
                    title="Bold"
                    aria-label="Bold"
                    aria-pressed={activeSummaryFormats.bold}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runSummaryCommand("bold")}
                  >
                    <Bold className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.italic)}
                    title="Italic"
                    aria-label="Italic"
                    aria-pressed={activeSummaryFormats.italic}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runSummaryCommand("italic")}
                  >
                    <Italic className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-5 w-px bg-[#d8dee8] dark:bg-[#263a55]" />
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.bullet)}
                    title="Bulleted list"
                    aria-label="Bulleted list"
                    aria-pressed={activeSummaryFormats.bullet}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runSummaryCommand("insertUnorderedList")}
                  >
                    <List className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.numbered)}
                    title="Numbered list"
                    aria-label="Numbered list"
                    aria-pressed={activeSummaryFormats.numbered}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => runSummaryCommand("insertOrderedList")}
                  >
                    <ListOrdered className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={buttonTone(activeSummaryFormats.quote)}
                    title="Quote"
                    aria-label="Quote"
                    aria-pressed={activeSummaryFormats.quote}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleSummaryBlock("quote")}
                  >
                    <Quote className="h-4 w-4" />
                  </button>
                  <span className="mx-1 h-5 w-px bg-[#d8dee8] dark:bg-[#263a55]" />
                  <button
                    type="button"
                    className="reference-menu-button w-auto gap-2 px-2.5 text-[#b42318] hover:bg-[#fff1f0] hover:text-[#b42318] dark:text-red-300 dark:hover:bg-red-400/10"
                    title="Mark as blocker"
                    aria-label="Mark as blocker"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={markSummarySelectionAsBlocker}
                  >
                    <Ban className="h-4 w-4" />
                    <span className="text-xs font-medium">Mark as blocker</span>
                  </button>
                </div>
                <div
                  ref={summaryEditorRef}
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  aria-label="Summary"
                  data-placeholder="What did you work on today?"
                  className="summary-rich-editor h-[430px] overflow-y-auto rounded-[8px] bg-white px-4 py-4 text-sm leading-6 text-[#111827] shadow-none ring-1 ring-[#dfe4ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#0f1b2a] dark:text-foreground dark:ring-[#263a55]"
                  onInput={syncSummaryFromEditor}
                  onKeyDown={handleSummaryKeyDown}
                  onKeyUp={handleSummaryKeyUp}
                  onMouseDown={handleSummaryMouseDown}
                  onMouseUp={handleSummaryMouseUp}
                  onBlur={syncSummaryFromEditor}
                  onPaste={(event) => {
                    event.preventDefault();
                    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
                    syncSummaryFromEditor();
                  }}
                />
              </div>
            </aside>
          </div>
        </section>
      </main>
      {menuActivity && openActivityMenu ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            aria-label="Close work item menu"
            onClick={() => setOpenActivityMenu(null)}
          />
          <div
            className="fixed z-50 w-60 rounded-[10px] bg-white p-1 text-sm shadow-[0_18px_42px_rgba(15,23,42,0.22)] dark:bg-[#0f1b2a]"
            style={{ top: openActivityMenu.top, left: openActivityMenu.left }}
            role="menu"
          >
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => openActivitySource(menuActivity)}
            >
              <ExternalLink className="h-4 w-4" />
              Open source
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => {
                setActivity(menuActivity.id, { selected: !menuActivity.selected });
                setOpenActivityMenu(null);
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {menuActivity.selected ? "Exclude" : "Include"}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => {
                setActivity(menuActivity.id, { employeeNote: "" });
                setOpenActivityMenu(null);
              }}
            >
              <Edit3 className="h-4 w-4" />
              Clear note
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#334155] hover:bg-[#f8fafc] dark:text-foreground dark:hover:bg-white/5"
              onClick={() => copyActivityTitle(menuActivity)}
            >
              <Copy className="h-4 w-4" />
              Copy title
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-[6px] px-3 py-2 text-left text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-red-400/10"
              onClick={() => removeActivity(menuActivity)}
            >
              <Trash2 className="h-4 w-4" />
              {menuActivity.source === "MANUAL" ? "Delete item" : "Remove from report"}
            </button>
          </div>
        </>
      ) : null}
      {message ? (
        <div
          className="fixed bottom-5 right-5 z-50 max-w-[min(420px,calc(100vw-2.5rem))] rounded-[12px] bg-white px-4 py-3 text-sm font-medium text-[#334155] shadow-[0_18px_42px_rgba(15,23,42,0.18)] ring-1 ring-[#e1e6ef] dark:bg-[#0f1b2a] dark:text-[#d7e0ec] dark:ring-[#263a55]"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      ) : null}
    </ReferenceAppShell>
  );
}
