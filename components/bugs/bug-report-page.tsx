"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImagePlus,
  Loader2,
  Paperclip,
  RotateCcw,
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
  status?: "OPEN" | "SOLVED";
  solvedAt?: string | Date | null;
  solvedBy?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  } | null;
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
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    initialSelectedReportId &&
      initialReports.some((report) => report.id === initialSelectedReportId)
      ? initialSelectedReportId
      : initialReports[0]?.id ?? null,
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [selectedArchiveReportId, setSelectedArchiveReportId] = useState<
    string | null
  >(null);
  const openReportCount = useMemo(
    () => reports.filter((report) => bugReportStatus(report) === "OPEN").length,
    [reports],
  );
  const solvedReportCount = useMemo(
    () =>
      reports.filter((report) => bugReportStatus(report) === "SOLVED").length,
    [reports],
  );
  const openReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    const openItems = reports.filter(
      (report) => bugReportStatus(report) === "OPEN",
    );

    if (!query) {
      return openItems;
    }

    return openItems.filter((report) => bugReportMatchesQuery(report, query));
  }, [reports, search]);
  const solvedReports = useMemo(
    () => reports.filter((report) => bugReportStatus(report) === "SOLVED"),
    [reports],
  );
  const archiveReports = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase();

    if (!query) {
      return solvedReports;
    }

    return solvedReports.filter((report) => bugReportMatchesQuery(report, query));
  }, [archiveSearch, solvedReports]);
  const selectedArchiveReport =
    archiveReports.find((report) => report.id === selectedArchiveReportId) ??
    archiveReports[0] ??
    null;
  const mainSelectedReport =
    openReports.find((report) => report.id === selectedReportId) ??
    openReports[0] ??
    null;
  const selectedReport = archiveOpen ? selectedArchiveReport : mainSelectedReport;
  const selectedMainReportId = mainSelectedReport?.id ?? null;
  const selectedArchiveDetailId = selectedArchiveReport?.id ?? null;
  const selectedReportDetailId = selectedReport?.id ?? null;
  const selectedReportNeedsAttachments =
    selectedReport?.attachments.some((attachment) => !attachment.dataUrl) ??
    false;
  const openEmptyText = search.trim()
    ? "No open bug reports match this search."
    : "No open bug reports.";
  const archiveEmptyText = archiveSearch.trim()
    ? "No solved bug reports match this search."
    : "No solved bug reports yet.";
  const openReportListClassName =
    "max-h-[min(34rem,calc(100vh-18rem))] overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable] min-[1120px]:max-h-none min-[1120px]:min-h-0 min-[1120px]:flex-1";

  useEffect(() => {
    if (selectedReportId !== selectedMainReportId) {
      setSelectedReportId(selectedMainReportId);
    }
  }, [selectedMainReportId, selectedReportId]);

  useEffect(() => {
    if (!archiveOpen) {
      return;
    }

    if (selectedArchiveReportId !== selectedArchiveDetailId) {
      setSelectedArchiveReportId(selectedArchiveDetailId);
    }
  }, [archiveOpen, selectedArchiveDetailId, selectedArchiveReportId]);

  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  useEffect(() => {
    if (!archiveOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [archiveOpen]);

  useEffect(() => {
    if (!archiveOpen) {
      return;
    }

    function closeArchiveOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setArchiveOpen(false);
      }
    }

    window.addEventListener("keydown", closeArchiveOnEscape);

    return () => {
      window.removeEventListener("keydown", closeArchiveOnEscape);
    };
  }, [archiveOpen]);

  useEffect(() => {
    if (!archiveOpen) {
      setArchiveSearch("");
      setSelectedArchiveReportId(null);
    }
  }, [archiveOpen]);

  useEffect(() => {
    if (archiveOpen && solvedReportCount === 0) {
      setArchiveOpen(false);
    }
  }, [archiveOpen, solvedReportCount]);

  useEffect(() => {
    if (!initialSelectedReportId) {
      return;
    }

    const selectedInitialReport = reports.find(
      (report) => report.id === initialSelectedReportId,
    );

    if (selectedInitialReport && bugReportStatus(selectedInitialReport) === "SOLVED") {
      setArchiveOpen(true);
      setSelectedArchiveReportId(initialSelectedReportId);
    }
  }, [initialSelectedReportId, reports]);

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

  async function updateSelectedReportStatus(
    report: BugReport,
    status: "OPEN" | "SOLVED",
  ) {
    if (!canReviewAll || updatingStatusId) {
      return;
    }

    setUpdatingStatusId(report.id);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/bug-reports/${encodeURIComponent(report.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to update bug report.");
      }

      if (data.bugReport) {
        setReports((current) =>
          current.map((item) =>
            item.id === report.id ? data.bugReport : item,
          ),
        );

        if (status === "SOLVED") {
          setSelectedReportId(null);
          setSelectedArchiveReportId(data.bugReport.id);
        } else {
          setSelectedReportId(data.bugReport.id);
          setSelectedArchiveReportId(null);
          setArchiveOpen(false);
        }
      }

      markServerDataStale();
      setMessage(
        status === "SOLVED" ? "Bug report marked solved." : "Bug report reopened.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to update bug report.",
      );
    } finally {
      setUpdatingStatusId((current) => (current === report.id ? null : current));
    }
  }

  return (
    <main
      className={cn(
        "reference-page",
        canReviewAll &&
          "min-[1120px]:flex min-[1120px]:h-full min-[1120px]:min-h-0 min-[1120px]:flex-col",
      )}
    >
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
            ? "min-[1120px]:min-h-0 min-[1120px]:flex-1 min-[1120px]:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)] min-[1120px]:items-stretch"
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
            <>
              <BugReportArchiveButton
                count={solvedReportCount}
                onOpen={() => setArchiveOpen(true)}
              />
              <BugReportList
                reports={openReports}
                selectedReportId={mainSelectedReport?.id ?? null}
                title="Open bug reports"
                emptyText={openEmptyText}
                className={openReportListClassName}
                onSelect={setSelectedReportId}
              />
            </>
          ) : null}
        </div>

        {canReviewAll ? (
          <div className="grid gap-3 min-[1120px]:h-full min-[1120px]:min-h-0 min-[1120px]:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.18fr)] min-[1120px]:items-stretch">
            <Card className="min-[1120px]:flex min-[1120px]:h-full min-[1120px]:min-h-0 min-[1120px]:flex-col">
              <CardHeader className="p-3 pb-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Inbox</CardTitle>
                    <CardDescription className="text-xs">
                      {openReportCount} open report
                      {openReportCount === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  <BugReportArchiveButton
                    count={solvedReportCount}
                    onOpen={() => setArchiveOpen(true)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 p-3 pt-0 min-[1120px]:flex min-[1120px]:min-h-0 min-[1120px]:flex-1 min-[1120px]:flex-col min-[1120px]:gap-2 min-[1120px]:space-y-0">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label="Search bug reports"
                    className="h-9 bg-white pl-9 text-sm ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
                    placeholder="Search open reports"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <BugReportList
                  reports={openReports}
                  selectedReportId={mainSelectedReport?.id ?? null}
                  title="Open bug reports"
                  emptyText={openEmptyText}
                  className={openReportListClassName}
                  onSelect={setSelectedReportId}
                />
              </CardContent>
            </Card>
            {mainSelectedReport ? (
              <BugReportDetail
                report={mainSelectedReport}
                canManageStatus={canReviewAll}
                isUpdatingStatus={updatingStatusId === mainSelectedReport.id}
                isLoadingAttachments={
                  loadingDetailId === mainSelectedReport.id &&
                  selectedReportNeedsAttachments
                }
                onStatusChange={(status) =>
                  updateSelectedReportStatus(mainSelectedReport, status)
                }
                className="min-[1120px]:h-full min-[1120px]:max-h-none"
              />
            ) : null}
          </div>
        ) : (
          mainSelectedReport ? (
            <BugReportDetail
              report={mainSelectedReport}
              canManageStatus={false}
              isUpdatingStatus={false}
              isLoadingAttachments={
                loadingDetailId === mainSelectedReport.id &&
                selectedReportNeedsAttachments
              }
              onStatusChange={() => undefined}
            />
          ) : null
        )}
      </div>

      {archiveOpen ? (
        <BugReportArchiveDialog
          reports={archiveReports}
          totalCount={solvedReportCount}
          search={archiveSearch}
          selectedReport={selectedArchiveReport}
          selectedReportId={selectedArchiveReport?.id ?? null}
          isLoadingAttachments={
            Boolean(selectedArchiveReport) &&
            loadingDetailId === selectedArchiveReport.id &&
            selectedReportNeedsAttachments
          }
          isUpdatingStatus={Boolean(
            selectedArchiveReport &&
              updatingStatusId === selectedArchiveReport.id,
          )}
          canManageStatus={canReviewAll}
          emptyText={archiveEmptyText}
          onSearchChange={setArchiveSearch}
          onSelect={setSelectedArchiveReportId}
          onClose={() => setArchiveOpen(false)}
          onStatusChange={(status) => {
            if (selectedArchiveReport) {
              updateSelectedReportStatus(selectedArchiveReport, status);
            }
          }}
        />
      ) : null}

      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </main>
  );
}

function BugReportArchiveButton({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0 bg-white px-2 text-xs dark:bg-[#0f1b2a]"
      disabled={count === 0}
      onClick={onOpen}
    >
      <Archive className="mr-1.5 h-3.5 w-3.5" />
      Solved archive
      <span className="ml-1.5 rounded-full bg-[#e2e8f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#475569] dark:bg-white/10 dark:text-muted-foreground">
        {count}
      </span>
    </Button>
  );
}

function BugReportArchiveDialog({
  reports,
  totalCount,
  search,
  selectedReport,
  selectedReportId,
  isLoadingAttachments,
  isUpdatingStatus,
  canManageStatus,
  emptyText,
  onSearchChange,
  onSelect,
  onClose,
  onStatusChange,
}: {
  reports: BugReport[];
  totalCount: number;
  search: string;
  selectedReport: BugReport | null;
  selectedReportId: string | null;
  isLoadingAttachments: boolean;
  isUpdatingStatus: boolean;
  canManageStatus: boolean;
  emptyText: string;
  onSearchChange: (value: string) => void;
  onSelect: (reportId: string) => void;
  onClose: () => void;
  onStatusChange: (status: "OPEN" | "SOLVED") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0f172a]/45 p-3 pt-5 backdrop-blur-[2px] min-[720px]:pt-8">
      <button
        type="button"
        aria-label="Dismiss solved archive"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-archive-title"
        className="relative z-10 flex max-h-[min(760px,calc(100vh-2rem))] w-[min(1120px,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.24)] ring-1 ring-[#dbe5f4] dark:bg-[#0f1b2a] dark:ring-[#263a55]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5eaf2] px-4 py-3 dark:border-[#263a55]">
          <div className="min-w-0">
            <h2
              id="bug-report-archive-title"
              className="text-base font-semibold leading-tight text-[#0f172a] dark:text-foreground"
            >
              Solved bug reports
            </h2>
            <p className="mt-0.5 text-xs text-[#64748b] dark:text-muted-foreground">
              {totalCount} solved report{totalCount === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#64748b] transition-colors hover:bg-[#eef2f7] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
            aria-label="Close solved archive"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 p-3 min-[900px]:grid-cols-[minmax(280px,0.76fr)_minmax(0,1.24fr)]">
          <div className="flex min-h-0 flex-col gap-2">
            <div className="relative shrink-0">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748b]"
                aria-hidden="true"
              />
              <Input
                aria-label="Search solved bug reports"
                className="h-9 bg-white pl-9 text-sm ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:ring-[#263a55]"
                placeholder="Search archive"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </div>
            <BugReportList
              reports={reports}
              selectedReportId={selectedReportId}
              emptyText={emptyText}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
              onSelect={onSelect}
            />
          </div>

          <div className="min-h-0">
            {selectedReport ? (
              <BugReportDetail
                report={selectedReport}
                canManageStatus={canManageStatus}
                isUpdatingStatus={isUpdatingStatus}
                isLoadingAttachments={isLoadingAttachments}
                className="h-full min-h-0 max-h-none shadow-none"
                contentClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
                onStatusChange={onStatusChange}
              />
            ) : (
              <div className="flex h-full min-h-[260px] items-center justify-center rounded-[8px] bg-[#f8fafc] p-4 text-center text-sm text-[#64748b] ring-1 ring-[#dbe5f4] dark:bg-[#0b1523] dark:text-muted-foreground dark:ring-[#263a55]">
                {emptyText}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
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
  emptyText,
  className,
  onSelect,
}: {
  reports: BugReport[];
  selectedReportId: string | null;
  title?: string;
  emptyText?: string;
  className?: string;
  onSelect: (reportId: string) => void;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {title ? (
        <div className="px-1 text-xs font-semibold uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
          {title}
        </div>
      ) : null}
      {reports.length === 0 ? (
        <EmptyReferenceState>
          {emptyText ??
            (title ? "No bug reports yet." : "No bug reports match this search.")}
        </EmptyReferenceState>
      ) : (
        reports.map((report) => {
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
                  {bugReportStatus(report) === "SOLVED" ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {report.solvedAt ? (
                        <span className="text-[11px] font-medium text-[#64748b] dark:text-muted-foreground">
                          {formatShortDate(report.solvedAt)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
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
        })
      )}
    </div>
  );
}

function BugReportDetail({
  report,
  canManageStatus,
  isUpdatingStatus,
  isLoadingAttachments = false,
  className,
  contentClassName,
  onStatusChange,
}: {
  report: BugReport;
  canManageStatus: boolean;
  isUpdatingStatus: boolean;
  isLoadingAttachments?: boolean;
  className?: string;
  contentClassName?: string;
  onStatusChange: (status: "OPEN" | "SOLVED") => void;
}) {
  const isSolved = bugReportStatus(report) === "SOLVED";

  return (
    <Card
      className={cn(
        "flex min-h-[360px] max-h-[min(46rem,calc(100vh-8rem))] flex-col overflow-hidden min-[1120px]:min-h-0",
        className,
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-3">
          <ReporterAvatar report={report} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">{reportReporterName(report)}</CardTitle>
            <CardDescription className="text-xs">
              {report.reporter.email ?? "No email"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            {canManageStatus ? (
              <Button
                type="button"
                variant={isSolved ? "outline" : "default"}
                size="sm"
                className={cn(
                  "h-8 px-2 text-xs",
                  !isSolved && "bg-[#16a34a] hover:bg-[#15803d]",
                )}
                disabled={isUpdatingStatus}
                onClick={() => onStatusChange(isSolved ? "OPEN" : "SOLVED")}
              >
                {isUpdatingStatus ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : isSolved ? (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isUpdatingStatus
                  ? "Updating..."
                  : isSolved
                    ? "Reopen"
                    : "Mark solved"}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pt-0 pr-2 [scrollbar-gutter:stable]",
          contentClassName,
        )}
      >
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
          {isSolved && report.solvedAt ? (
            <span className="rounded-[7px] bg-[#ecfdf0] px-2 py-1 font-medium text-[#15803d] dark:bg-emerald-400/10 dark:text-emerald-200">
              Solved {formatFullDate(report.solvedAt)}
              {report.solvedBy ? ` by ${reportReporterName({ ...report, reporter: report.solvedBy })}` : ""}
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

function bugReportStatus(report: BugReport) {
  return report.status ?? "OPEN";
}

function bugReportMatchesQuery(report: BugReport, query: string) {
  const reporter = reportReporterName(report).toLowerCase();
  const email = report.reporter.email?.toLowerCase() ?? "";
  const body = report.body.toLowerCase();

  return reporter.includes(query) || email.includes(query) || body.includes(query);
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
