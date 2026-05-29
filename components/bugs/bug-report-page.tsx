"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  ExternalLink,
  ImagePlus,
  Loader2,
  Paperclip,
  Search,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyReferenceState } from "@/components/reports/reference-shell";
import { FixedToast } from "@/components/ui/fixed-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import { cn, initials } from "@/lib/utils";

type BugReportAttachment = {
  id?: string;
  fileName: string;
  contentType: string;
  dataUrl?: string | null;
  sizeBytes: number;
  createdAt?: string | Date;
};

type BugReportAttachmentDraft = BugReportAttachment & {
  dataUrl: string;
};

type BugReport = {
  id: string;
  body: string;
  pagePath?: string | null;
  userAgent?: string | null;
  createdAt: string | Date;
  reporter: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  attachments: BugReportAttachment[];
};

const maxAttachments = 4;
const maxAttachmentBytes = 900_000;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function BugReportPage({
  initialReports,
  canReviewAll,
  currentUserName,
  sourcePagePath,
  initialSelectedReportId,
}: {
  initialReports: BugReport[];
  canReviewAll: boolean;
  currentUserName: string;
  sourcePagePath?: string | null;
  initialSelectedReportId?: string | null;
}) {
  const [reports, setReports] = useState(initialReports);
  const [selectedReportId, setSelectedReportId] = useState(
    initialSelectedReportId &&
      initialReports.some((report) => report.id === initialSelectedReportId)
      ? initialSelectedReportId
      : initialReports[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return reports;
    }

    return reports.filter((report) => {
      const reporter = reportReporterName(report).toLowerCase();
      const email = report.reporter.email?.toLowerCase() ?? "";
      const body = report.body.toLowerCase();

      return (
        reporter.includes(query) ||
        email.includes(query) ||
        body.includes(query)
      );
    });
  }, [reports, search]);
  const selectedReport =
    filteredReports.find((report) => report.id === selectedReportId) ??
    filteredReports[0] ??
    null;
  const selectedReportDetailId = selectedReport?.id ?? null;
  const selectedReportNeedsAttachments =
    selectedReport?.attachments.some((attachment) => !attachment.dataUrl) ??
    false;

  useEffect(() => {
    if (selectedReportId !== selectedReportDetailId) {
      setSelectedReportId(selectedReportDetailId);
    }
  }, [selectedReportDetailId, selectedReportId]);

  useEffect(() => {
    if (!selectedReportDetailId || !selectedReportNeedsAttachments) {
      return;
    }

    const controller = new AbortController();
    const reportId = selectedReportDetailId;

    setLoadingDetailId(reportId);

    async function loadReportDetail() {
      try {
        const response = await fetch(
          `/api/bug-reports/${encodeURIComponent(reportId)}`,
          { signal: controller.signal },
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error ?? "Unable to load screenshots.");
        }

        if (data.bugReport) {
          setReports((current) =>
            current.map((report) =>
              report.id === reportId ? data.bugReport : report,
            ),
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load screenshots.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDetailId((current) =>
            current === reportId ? null : current,
          );
        }
      }
    }

    void loadReportDetail();

    return () => controller.abort();
  }, [selectedReportDetailId, selectedReportNeedsAttachments]);

  function addReport(report: BugReport) {
    setReports((current) => [report, ...current]);
    setSelectedReportId(report.id);
  }

  return (
    <main className="reference-page">
      <div className="reference-page-header">
        <div>
          <h1 className="reference-title">Bug Reports</h1>
          <p className="reference-subtitle">
            {canReviewAll
              ? "Review submitted issues and screenshots from the team."
              : "Send a bug report with screenshots when something feels off."}
          </p>
        </div>
      </div>

      <div
        className={cn(
          "grid items-start gap-3",
          canReviewAll
            ? "min-[1120px]:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]"
            : "min-[1040px]:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.75fr)]",
        )}
      >
        <div className="space-y-3">
          <BugReportComposer
            currentUserName={currentUserName}
            sourcePagePath={sourcePagePath}
            onCreated={addReport}
            onMessage={setMessage}
          />
          {!canReviewAll ? (
            <BugReportList
              reports={filteredReports}
              selectedReportId={selectedReport?.id ?? null}
              title="Your reports"
              onSelect={setSelectedReportId}
            />
          ) : null}
        </div>

        {canReviewAll ? (
          <div className="grid gap-3 min-[1120px]:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.18fr)]">
            <Card>
              <CardHeader className="p-3 pb-2">
                <CardTitle>Inbox</CardTitle>
                <CardDescription className="text-xs">
                  {reports.length} report{reports.length === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label="Search bug reports"
                    className="h-9 bg-white pl-9 text-sm ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    placeholder="Search reports"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <BugReportList
                  reports={filteredReports}
                  selectedReportId={selectedReport?.id ?? null}
                  onSelect={setSelectedReportId}
                />
              </CardContent>
            </Card>
            {selectedReport ? (
              <BugReportDetail
                report={selectedReport}
                isLoadingAttachments={
                  loadingDetailId === selectedReport.id &&
                  selectedReportNeedsAttachments
                }
              />
            ) : null}
          </div>
        ) : (
          selectedReport ? (
            <BugReportDetail
              report={selectedReport}
              isLoadingAttachments={
                loadingDetailId === selectedReport.id &&
                selectedReportNeedsAttachments
              }
            />
          ) : null
        )}
      </div>

      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </main>
  );
}

function BugReportComposer({
  currentUserName,
  sourcePagePath,
  onCreated,
  onMessage,
}: {
  currentUserName: string;
  sourcePagePath?: string | null;
  onCreated: (report: BugReport) => void;
  onMessage: (message: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<BugReportAttachmentDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const canSubmit =
    body.trim().length > 0 && !isSubmitting && !isProcessingImages;

  async function addFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const openSlots = maxAttachments - attachments.length;

    if (openSlots <= 0) {
      onMessage(`You can attach up to ${maxAttachments} images.`);
      return;
    }

    setIsProcessingImages(true);

    try {
      const nextAttachments: BugReportAttachmentDraft[] = [];

      for (const file of files.slice(0, openSlots)) {
        nextAttachments.push(await standardizeBugReportImage(file));
      }

      setAttachments((current) => [...current, ...nextAttachments]);
      onMessage(
        nextAttachments.length === 1
          ? "Image attached."
          : `${nextAttachments.length} images attached.`,
      );
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Unable to attach that image.",
      );
    } finally {
      setIsProcessingImages(false);
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    onMessage(null);

    try {
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          attachments,
          pagePath: sourcePagePath ?? null,
          userAgent: navigator.userAgent,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        onMessage(data.error ?? "Unable to send bug report.");
        return;
      }

      onCreated(data.bugReport);
      markServerDataStale();
      setBody("");
      setAttachments([]);
      onMessage("Bug report sent.");
    } catch {
      onMessage("Unable to send bug report. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="p-3 pb-2">
        <CardTitle>New report</CardTitle>
        <CardDescription className="text-xs">{currentUserName}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <form className="space-y-3" onSubmit={submitReport}>
          <Textarea
            aria-label="Bug report text"
            className="min-h-[132px] bg-white ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
            placeholder="What happened?"
            value={body}
            maxLength={5000}
            disabled={isSubmitting}
            onChange={(event) => setBody(event.target.value)}
          />

          {attachments.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.fileName}-${index}`}
                  className="group relative overflow-hidden rounded-[8px] bg-[#f8fafc] ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.dataUrl}
                    alt=""
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-[7px] bg-white/90 text-[#334155] shadow-sm ring-1 ring-[#dbe5f4] transition-colors hover:bg-[#eef2f7] dark:bg-[#0f1b2a]/90 dark:text-foreground dark:ring-[#263a55]"
                    aria-label={`Remove ${attachment.fileName}`}
                    disabled={isSubmitting}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                void addFiles(files);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 justify-start bg-white text-sm dark:bg-[#0f1b2a]"
              disabled={
                isSubmitting ||
                isProcessingImages ||
                attachments.length >= maxAttachments
              }
              onClick={() => fileInputRef.current?.click()}
            >
              {isProcessingImages ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-2 h-4 w-4" />
              )}
              {isProcessingImages ? "Attaching..." : "Attach images"}
            </Button>
            <Button
              type="submit"
              className="h-9 bg-[#2563eb] text-sm hover:bg-[#1d4ed8]"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? "Sending..." : "Send report"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BugReportList({
  reports,
  selectedReportId,
  title,
  onSelect,
}: {
  reports: BugReport[];
  selectedReportId: string | null;
  title?: string;
  onSelect: (reportId: string) => void;
}) {
  if (reports.length === 0) {
    return (
      <EmptyReferenceState>
        {title ? "No bug reports yet." : "No bug reports match this search."}
      </EmptyReferenceState>
    );
  }

  return (
    <div className="space-y-1.5">
      {title ? (
        <div className="px-1 text-xs font-semibold uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
          {title}
        </div>
      ) : null}
      {reports.map((report) => {
        const selected = report.id === selectedReportId;

        return (
          <button
            key={report.id}
            type="button"
            className={cn(
              "w-full rounded-[8px] bg-white p-2.5 text-left ring-1 ring-[#dbe5f4] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#0f1b2a] dark:ring-[#263a55] dark:hover:bg-white/[0.04]",
              selected &&
                "bg-[#eff6ff] ring-[#93c5fd] dark:bg-blue-400/10 dark:ring-blue-300/40",
            )}
            onClick={() => onSelect(report.id)}
          >
            <div className="flex items-start gap-2">
              <ReporterAvatar report={report} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="truncate text-sm font-semibold text-[#0f172a] dark:text-foreground">
                    {reportReporterName(report)}
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-[#64748b] dark:text-muted-foreground">
                    {formatShortDate(report.createdAt)}
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-[#475569] dark:text-muted-foreground">
                  {report.body}
                </div>
                {report.attachments.length > 0 ? (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#2563eb]">
                    <Paperclip className="h-3.5 w-3.5" />
                    {report.attachments.length}
                  </div>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BugReportDetail({
  report,
  isLoadingAttachments = false,
}: {
  report: BugReport;
  isLoadingAttachments?: boolean;
}) {
  return (
    <Card className="min-h-[360px]">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-3">
          <ReporterAvatar report={report} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{reportReporterName(report)}</CardTitle>
            <CardDescription className="text-xs">
              {report.reporter.email ?? "No email"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b] dark:text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatFullDate(report.createdAt)}
          </span>
          {report.pagePath ? (
            <span className="rounded-[7px] bg-[#f4f7fb] px-2 py-1 font-medium dark:bg-white/[0.04]">
              {report.pagePath}
            </span>
          ) : null}
        </div>

        <div className="whitespace-pre-wrap rounded-[8px] bg-[#f8fafc] p-3 text-sm leading-6 text-[#0f172a] ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:text-foreground dark:ring-[#263a55]">
          {report.body}
        </div>

        {report.attachments.length > 0 ? (
          <div className="grid gap-2 min-[640px]:grid-cols-2">
            {report.attachments.map((attachment) =>
              attachment.dataUrl ? (
                <a
                  key={attachment.id ?? attachment.fileName}
                  href={attachment.dataUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-[8px] bg-[#f8fafc] ring-1 ring-[#dbe5f4] transition-shadow hover:shadow-[0_10px_28px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#0b1523] dark:ring-[#263a55]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.dataUrl}
                    alt={attachment.fileName}
                    className="aspect-video w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-medium text-[#475569] dark:text-muted-foreground">
                    <span className="truncate">{attachment.fileName}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
                  </div>
                </a>
              ) : (
                <div
                  key={attachment.id ?? attachment.fileName}
                  className="flex aspect-video items-center justify-center rounded-[8px] bg-[#f8fafc] text-xs font-medium text-[#64748b] ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:text-muted-foreground dark:ring-[#263a55]"
                >
                  {isLoadingAttachments ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="mr-2 h-4 w-4" />
                  )}
                  Loading screenshot
                </div>
              ),
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReporterAvatar({
  report,
  size = "md",
}: {
  report: BugReport;
  size?: "sm" | "md";
}) {
  const name = reportReporterName(report);

  return (
    <div
      className={cn(
        "shrink-0 rounded-full bg-[#2563eb] bg-cover bg-center text-center font-semibold text-white",
        size === "sm"
          ? "h-8 w-8 text-[11px] leading-8"
          : "h-10 w-10 text-sm leading-10",
      )}
      style={
        report.reporter.image
          ? { backgroundImage: `url("${report.reporter.image}")` }
          : undefined
      }
      aria-hidden="true"
    >
      {report.reporter.image ? null : initials(name)}
    </div>
  );
}

function reportReporterName(report: BugReport) {
  return report.reporter.name ?? report.reporter.email ?? "Unknown reporter";
}

function formatShortDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatFullDate(value: string | Date) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function standardizeBugReportImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) {
    throw new Error("Attach JPEG, PNG, or WebP images.");
  }

  if (file.size > 8_000_000) {
    throw new Error("Image is too large.");
  }

  const image = await loadImage(file);
  const firstPass = imageToDataUrl(image, 1400, 0.82);
  const dataUrl =
    dataUrlByteSize(firstPass) <= maxAttachmentBytes
      ? firstPass
      : imageToDataUrl(image, 1000, 0.74);
  const sizeBytes = dataUrlByteSize(dataUrl);

  if (sizeBytes > maxAttachmentBytes) {
    throw new Error("Image is too large after resizing.");
  }

  return {
    fileName: file.name || "screenshot.jpg",
    contentType: "image/jpeg" as const,
    dataUrl,
    sizeBytes,
  };
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read that image."));
    };
    image.src = objectUrl;
  });
}

function imageToDataUrl(
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
) {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to prepare that image.");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlByteSize(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;

  return Math.floor((base64.length * 3) / 4) - padding;
}
