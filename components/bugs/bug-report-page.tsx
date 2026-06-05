"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
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
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Textarea } from "@/components/ui/textarea";
import {
  maxBugReportBodyCharacters,
  maxBugReportBodyLines,
  maxBugReportBodyWords,
} from "@/lib/bug-report-limits";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import {
  fetchJsonWithClientCache,
  writeClientJsonCache,
} from "@/lib/client-request-cache";
import { defaultPaginationPageSize } from "@/lib/pagination";
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

type BugReportsPageResponse = {
  reports?: BugReport[];
  totalCount?: number;
  error?: string;
};

const maxAttachments = 4;
const maxAttachmentBytes = 900_000;
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function BugReportPage({
  initialReports,
  initialOpenReports,
  initialSolvedReports,
  initialOpenTotalCount,
  initialSolvedTotalCount,
  initialSelectedReport,
  canReviewAll,
  currentUserName,
  sourcePagePath,
  initialSelectedReportId,
}: {
  initialReports?: BugReport[];
  initialOpenReports?: BugReport[];
  initialSolvedReports?: BugReport[];
  initialOpenTotalCount?: number;
  initialSolvedTotalCount?: number;
  initialSelectedReport?: BugReport | null;
  canReviewAll: boolean;
  currentUserName: string;
  sourcePagePath?: string | null;
  initialSelectedReportId?: string | null;
}) {
  const seededReports = initialReports ?? [
    ...(initialOpenReports ?? []),
    ...(initialSolvedReports ?? []),
  ];
  const seededSelectedReport =
    initialSelectedReport &&
    initialSelectedReport.id === initialSelectedReportId
      ? initialSelectedReport
      : null;
  const seededInitialReport = initialSelectedReportId
    ? (seededReports.find((report) => report.id === initialSelectedReportId) ??
        seededSelectedReport)
    : null;
  const seededOpenCount =
    initialOpenTotalCount ??
    seededReports.filter((report) => bugReportStatus(report) === "OPEN").length;
  const seededSolvedCount =
    initialSolvedTotalCount ??
    seededReports.filter((report) => bugReportStatus(report) === "SOLVED")
      .length;
  const [reports, setReports] = useState(() => dedupeBugReports(seededReports));
  const [selectedReportDetail, setSelectedReportDetail] =
    useState<BugReport | null>(() =>
      seededSelectedReport &&
      !seededReports.some((report) => report.id === seededSelectedReport.id)
        ? seededSelectedReport
        : null,
    );
  const [openTotalCount, setOpenTotalCount] = useState(seededOpenCount);
  const [solvedTotalCount, setSolvedTotalCount] = useState(seededSolvedCount);
  const [openResultCount, setOpenResultCount] = useState(seededOpenCount);
  const [solvedResultCount, setSolvedResultCount] =
    useState(seededSolvedCount);
  const [openPage, setOpenPage] = useState(1);
  const [solvedPage, setSolvedPage] = useState(1);
  const [openPageSize, setOpenPageSize] = useState(defaultPaginationPageSize);
  const [solvedPageSize, setSolvedPageSize] = useState(
    defaultPaginationPageSize,
  );
  const [refreshingStatus, setRefreshingStatus] = useState<
    "OPEN" | "SOLVED" | null
  >(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    initialSelectedReportId &&
      seededInitialReport
      ? initialSelectedReportId
      : (seededReports.find((report) => bugReportStatus(report) === "OPEN")
          ?.id ?? null),
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(() =>
    Boolean(
      initialSelectedReportId &&
        seededInitialReport &&
        bugReportStatus(seededInitialReport) === "OPEN",
    ),
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveSearch, setArchiveSearch] = useState("");
  const [selectedArchiveReportId, setSelectedArchiveReportId] = useState<
    string | null
  >(null);
  const handledInitialReportIdRef = useRef<string | null>(null);
  const openSearchReadyRef = useRef(false);
  const archiveSearchReadyRef = useRef(false);
  const cacheSeededRef = useRef(false);
  const immediateListRefreshRef = useRef({ OPEN: false, SOLVED: false });
  const listRequestIdsRef = useRef({ OPEN: 0, SOLVED: 0 });
  const hasOpenSearch = search.trim().length > 0;
  const hasArchiveSearch = archiveSearch.trim().length > 0;
  const openReportCount = hasOpenSearch ? openResultCount : openTotalCount;
  const solvedReportCount = solvedTotalCount;
  const archiveReportCount = hasArchiveSearch
    ? solvedResultCount
    : solvedTotalCount;
  const openPageCount = Math.max(1, Math.ceil(openReportCount / openPageSize));
  const currentOpenPage = Math.min(openPage, openPageCount);
  const archivePageCount = Math.max(
    1,
    Math.ceil(archiveReportCount / solvedPageSize),
  );
  const currentSolvedPage = Math.min(solvedPage, archivePageCount);
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

    return solvedReports.filter((report) =>
      bugReportMatchesQuery(report, query),
    );
  }, [archiveSearch, solvedReports]);
  const selectedDetailReport =
    selectedReportDetail &&
    (selectedReportDetail.id === selectedReportId ||
      selectedReportDetail.id === selectedArchiveReportId)
      ? selectedReportDetail
      : null;
  const selectedArchiveReport =
    (selectedDetailReport?.id === selectedArchiveReportId &&
    bugReportStatus(selectedDetailReport) === "SOLVED"
      ? selectedDetailReport
      : null) ??
    archiveReports.find((report) => report.id === selectedArchiveReportId) ??
    archiveReports[0] ??
    null;
  const mainSelectedReport =
    (detailOpen &&
    selectedDetailReport?.id === selectedReportId &&
    bugReportStatus(selectedDetailReport) === "OPEN"
      ? selectedDetailReport
      : null) ??
    openReports.find((report) => report.id === selectedReportId) ??
    openReports[0] ??
    null;
  const selectedReport = archiveOpen
    ? selectedArchiveReport
    : detailOpen
      ? mainSelectedReport
      : null;
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
    "min-h-0 max-h-[min(34rem,calc(100dvh-18rem))] overflow-y-auto overscroll-contain [scrollbar-gutter:stable] min-[980px]:max-h-none min-[980px]:flex-1";

  const bugReportsUrl = useCallback(
    (
      status: "OPEN" | "SOLVED",
      {
        page,
        pageSize,
        searchValue,
      }: {
        page: number;
        pageSize: number;
        searchValue: string;
      },
    ) => {
      const params = new URLSearchParams({
        status,
        limit: String(pageSize),
        page: String(page),
      });
      const query = searchValue.trim();

      if (query) {
        params.set("search", query);
      }

      return `/api/bug-reports?${params.toString()}`;
    },
    [],
  );

  const loadBugReportPage = useCallback(
    async (
      status: "OPEN" | "SOLVED",
      {
        page,
        pageSize,
        searchValue,
        signal,
      }: {
        page: number;
        pageSize: number;
        searchValue: string;
        signal?: AbortSignal;
      },
    ) => {
      const requestId = listRequestIdsRef.current[status] + 1;
      listRequestIdsRef.current = {
        ...listRequestIdsRef.current,
        [status]: requestId,
      };

      setRefreshingStatus(status);

      try {
        const data = await fetchJsonWithClientCache<BugReportsPageResponse>(
          bugReportsUrl(status, { page, pageSize, searchValue }),
          {
            signal,
            errorMessage: "Unable to load bug reports.",
          },
        );

        if (listRequestIdsRef.current[status] !== requestId) {
          return false;
        }

        setReports((current) => {
          const kept = current.filter((report) => bugReportStatus(report) !== status);

          return mergeBugReports(kept, data.reports ?? []);
        });

        const resultCount = data.totalCount ?? 0;

        if (status === "OPEN") {
          if (searchValue.trim()) {
            setOpenResultCount(resultCount);
          } else {
            setOpenTotalCount(resultCount);
            setOpenResultCount(resultCount);
          }
        } else {
          if (searchValue.trim()) {
            setSolvedResultCount(resultCount);
          } else {
            setSolvedTotalCount(resultCount);
            setSolvedResultCount(resultCount);
          }
        }
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return false;
        }

        setMessage(
          error instanceof Error ? error.message : "Unable to load bug reports.",
        );
        return false;
      } finally {
        if (listRequestIdsRef.current[status] === requestId) {
          setRefreshingStatus((current) =>
            current === status ? null : current,
          );
        }
      }
    },
    [bugReportsUrl],
  );

  function requestImmediateListRefresh(status: "OPEN" | "SOLVED") {
    immediateListRefreshRef.current = {
      ...immediateListRefreshRef.current,
      [status]: true,
    };
    setRefreshingStatus(status);
  }

  function changeOpenPage(nextPage: number) {
    requestImmediateListRefresh("OPEN");
    setOpenPage(nextPage);
  }

  function changeOpenPageSize(nextPageSize: number) {
    if (nextPageSize === openPageSize) {
      return;
    }

    requestImmediateListRefresh("OPEN");
    setOpenPageSize(nextPageSize);
    setOpenPage(1);
  }

  function changeSolvedPage(nextPage: number) {
    requestImmediateListRefresh("SOLVED");
    setSolvedPage(nextPage);
  }

  function changeSolvedPageSize(nextPageSize: number) {
    if (nextPageSize === solvedPageSize) {
      return;
    }

    requestImmediateListRefresh("SOLVED");
    setSolvedPageSize(nextPageSize);
    setSolvedPage(1);
  }

  async function refreshBugReportStatusAfterMutation(
    status: "OPEN" | "SOLVED",
    {
      pageMayBeEmpty = false,
      visibleCount,
    }: {
      pageMayBeEmpty?: boolean;
      visibleCount: number;
    },
  ) {
    markServerDataStale();

    if (status === "OPEN") {
      if (pageMayBeEmpty && visibleCount <= 1 && currentOpenPage > 1) {
        requestImmediateListRefresh("OPEN");
        setOpenPage(currentOpenPage - 1);
        return true;
      }

      return loadBugReportPage("OPEN", {
        page: currentOpenPage,
        pageSize: openPageSize,
        searchValue: search,
      });
    }

    if (pageMayBeEmpty && visibleCount <= 1 && currentSolvedPage > 1) {
      requestImmediateListRefresh("SOLVED");
      setSolvedPage(currentSolvedPage - 1);
      return true;
    }

    return loadBugReportPage("SOLVED", {
      page: currentSolvedPage,
      pageSize: solvedPageSize,
      searchValue: archiveSearch,
    });
  }

  useEffect(() => {
    if (cacheSeededRef.current) {
      return;
    }

    cacheSeededRef.current = true;
    writeClientJsonCache<BugReportsPageResponse>(
      bugReportsUrl("OPEN", {
        page: 1,
        pageSize: openPageSize,
        searchValue: "",
      }),
      {
        reports: openReports,
        totalCount: openTotalCount,
      },
    );
    writeClientJsonCache<BugReportsPageResponse>(
      bugReportsUrl("SOLVED", {
        page: 1,
        pageSize: solvedPageSize,
        searchValue: "",
      }),
      {
        reports: solvedReports,
        totalCount: solvedTotalCount,
      },
    );
  }, [
    bugReportsUrl,
    openPageSize,
    openReports,
    openTotalCount,
    solvedPageSize,
    solvedReports,
    solvedTotalCount,
  ]);

  useEffect(() => {
    if (!openSearchReadyRef.current) {
      openSearchReadyRef.current = true;
      return;
    }

    const controller = new AbortController();
    const delayMs = immediateListRefreshRef.current.OPEN ? 0 : 250;
    immediateListRefreshRef.current = {
      ...immediateListRefreshRef.current,
      OPEN: false,
    };
    const timeoutId = window.setTimeout(() => {
      void loadBugReportPage("OPEN", {
        page: currentOpenPage,
        pageSize: openPageSize,
        searchValue: search,
        signal: controller.signal,
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [currentOpenPage, loadBugReportPage, openPageSize, search]);

  useEffect(() => {
    if (!archiveOpen) {
      return;
    }

    if (!archiveSearchReadyRef.current) {
      archiveSearchReadyRef.current = true;
      return;
    }

    const controller = new AbortController();
    const delayMs = immediateListRefreshRef.current.SOLVED ? 0 : 250;
    immediateListRefreshRef.current = {
      ...immediateListRefreshRef.current,
      SOLVED: false,
    };
    const timeoutId = window.setTimeout(() => {
      void loadBugReportPage("SOLVED", {
        page: currentSolvedPage,
        pageSize: solvedPageSize,
        searchValue: archiveSearch,
        signal: controller.signal,
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [
    archiveOpen,
    archiveSearch,
    currentSolvedPage,
    loadBugReportPage,
    solvedPageSize,
  ]);

  useEffect(() => {
    if (selectedReportId !== selectedMainReportId) {
      setSelectedReportId(selectedMainReportId);
    }
  }, [selectedMainReportId, selectedReportId]);

  useEffect(() => {
    if (openPage > openPageCount) {
      setOpenPage(openPageCount);
    }
  }, [openPage, openPageCount]);

  useEffect(() => {
    if (solvedPage > archivePageCount) {
      setSolvedPage(archivePageCount);
    }
  }, [archivePageCount, solvedPage]);

  useEffect(() => {
    if (!archiveOpen) {
      return;
    }

    if (selectedArchiveReportId !== selectedArchiveDetailId) {
      setSelectedArchiveReportId(selectedArchiveDetailId);
    }
  }, [archiveOpen, selectedArchiveDetailId, selectedArchiveReportId]);

  useEffect(() => {
    if (detailOpen && !mainSelectedReport) {
      setDetailOpen(false);
    }
  }, [detailOpen, mainSelectedReport]);

  useEffect(
    () => () => {
      document.body.style.overflow = "";
    },
    [],
  );

  useEffect(() => {
    if (!archiveOpen && !detailOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [archiveOpen, detailOpen]);

  useEffect(() => {
    if (!archiveOpen && !detailOpen) {
      return;
    }

    function closeDialogOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (archiveOpen) {
          setArchiveOpen(false);
          return;
        }

        setDetailOpen(false);
      }
    }

    window.addEventListener("keydown", closeDialogOnEscape);

    return () => {
      window.removeEventListener("keydown", closeDialogOnEscape);
    };
  }, [archiveOpen, detailOpen]);

  useEffect(() => {
    if (!archiveOpen) {
      setArchiveSearch("");
      setSelectedArchiveReportId(null);
      setSolvedPage(1);
    }
  }, [archiveOpen]);

  useEffect(() => {
    if (!initialSelectedReportId) {
      handledInitialReportIdRef.current = null;
      return;
    }

    if (handledInitialReportIdRef.current === initialSelectedReportId) {
      return;
    }

    const selectedInitialReport = reports.find(
      (report) => report.id === initialSelectedReportId,
    ) ?? (selectedReportDetail?.id === initialSelectedReportId
      ? selectedReportDetail
      : null);

    if (!selectedInitialReport) {
      return;
    }

    handledInitialReportIdRef.current = initialSelectedReportId;

    if (bugReportStatus(selectedInitialReport) === "SOLVED") {
      setArchiveOpen(true);
      setSelectedArchiveReportId(initialSelectedReportId);
    } else {
      setDetailOpen(true);
    }
  }, [initialSelectedReportId, reports, selectedReportDetail]);

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
          setSelectedReportDetail((current) =>
            current?.id === reportId ? data.bugReport : current,
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
    const canUpdateCurrentPage = currentOpenPage === 1 && !search.trim();

    if (!canUpdateCurrentPage) {
      requestImmediateListRefresh("OPEN");
    }
    setSearch("");
    setOpenPage(1);
    setReports((current) => {
      const keptReports = current.filter(
        (item) => bugReportStatus(item) !== "OPEN",
      );
      const currentOpenReports = canUpdateCurrentPage
        ? current.filter((item) => bugReportStatus(item) === "OPEN")
        : [];
      const nextOpenReports = mergeBugReports(
        [report],
        currentOpenReports,
      ).slice(0, openPageSize);

      return mergeBugReports(keptReports, nextOpenReports);
    });
    setOpenTotalCount((current) => current + 1);
    setOpenResultCount((current) => current + 1);
    setSelectedReportId(report.id);
    setDetailOpen(true);
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
        const previousStatus = bugReportStatus(report);
        const nextStatus = bugReportStatus(data.bugReport);
        const sourceVisibleCount =
          previousStatus === "OPEN" ? openReports.length : archiveReports.length;

        setReports((current) =>
          current.some((item) => item.id === report.id)
            ? mergeBugReports(
                current.filter((item) => item.id !== report.id),
                [data.bugReport],
              )
            : current,
        );
        setSelectedReportDetail((current) =>
          current?.id === report.id ? data.bugReport : current,
        );

        if (previousStatus !== nextStatus) {
          if (nextStatus === "SOLVED") {
            setOpenTotalCount((current) => Math.max(0, current - 1));
            setSolvedTotalCount((current) => current + 1);
            setOpenResultCount((current) =>
              matchesSearchValue(report, search) ? Math.max(0, current - 1) : current,
            );
            setSolvedResultCount((current) =>
              matchesSearchValue(data.bugReport, archiveSearch)
                ? current + 1
                : current,
            );
          } else {
            setSolvedTotalCount((current) => Math.max(0, current - 1));
            setOpenTotalCount((current) => current + 1);
            setSolvedResultCount((current) =>
              matchesSearchValue(report, archiveSearch)
                ? Math.max(0, current - 1)
                : current,
            );
            setOpenResultCount((current) =>
              matchesSearchValue(data.bugReport, search)
                ? current + 1
                : current,
            );
          }
        }

        if (status === "SOLVED") {
          setSelectedReportId(null);
          setDetailOpen(false);
          setSelectedArchiveReportId(data.bugReport.id);
        } else {
          setSelectedReportId(data.bugReport.id);
          setSelectedArchiveReportId(null);
          setArchiveOpen(false);
        }

        const refreshed = await refreshBugReportStatusAfterMutation(
          previousStatus,
          {
            pageMayBeEmpty: previousStatus !== nextStatus,
            visibleCount: sourceVisibleCount,
          },
        );

        if (!refreshed) {
          return;
        }
      }

      setMessage(
        status === "SOLVED"
          ? "Bug report marked solved."
          : "Bug report reopened.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update bug report.",
      );
    } finally {
      setUpdatingStatusId((current) =>
        current === report.id ? null : current,
      );
    }
  }

  async function deleteSelectedReport(report: BugReport) {
    if (!canReviewAll || deletingReportId) {
      return;
    }

    if (!window.confirm("Delete this bug report? This cannot be undone.")) {
      return;
    }

    setDeletingReportId(report.id);
    setMessage(null);

    try {
      const deletedStatus = bugReportStatus(report);
      const sourceVisibleCount =
        deletedStatus === "OPEN" ? openReports.length : archiveReports.length;
      const response = await fetch(
        `/api/bug-reports/${encodeURIComponent(report.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to delete bug report.");
      }

      setReports((current) =>
        current.filter((item) => item.id !== report.id),
      );
      setSelectedReportDetail((current) =>
        current?.id === report.id ? null : current,
      );
      if (bugReportStatus(report) === "OPEN") {
        setOpenTotalCount((current) => Math.max(0, current - 1));
        setOpenResultCount((current) =>
          matchesSearchValue(report, search) ? Math.max(0, current - 1) : current,
        );
      } else {
        setSolvedTotalCount((current) => Math.max(0, current - 1));
        setSolvedResultCount((current) =>
          matchesSearchValue(report, archiveSearch)
            ? Math.max(0, current - 1)
            : current,
        );
      }

      if (selectedReportId === report.id) {
        setSelectedReportId(null);
      }

      if (selectedArchiveReportId === report.id) {
        setSelectedArchiveReportId(null);
      }

      setDetailOpen(false);
      const refreshed = await refreshBugReportStatusAfterMutation(
        deletedStatus,
        {
          pageMayBeEmpty: true,
          visibleCount: sourceVisibleCount,
        },
      );

      if (!refreshed) {
        return;
      }

      setMessage("Bug report deleted.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to delete bug report.",
      );
    } finally {
      setDeletingReportId((current) =>
        current === report.id ? null : current,
      );
    }
  }

  return (
    <main className="reference-page min-[980px]:flex min-[980px]:h-full min-[980px]:min-h-0 min-[980px]:flex-col min-[980px]:overflow-hidden">
      <div className="reference-page-header min-[980px]:shrink-0">
        <div>
          <h1 className="reference-title">Review reported issues</h1>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-3 min-[980px]:min-h-0 min-[980px]:flex-1 min-[980px]:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] min-[980px]:items-stretch">
        <BugReportComposer
          currentUserName={currentUserName}
          sourcePagePath={sourcePagePath}
          className="min-[980px]:h-full min-[980px]:min-h-0"
          onCreated={addReport}
          onMessage={setMessage}
        />

        <Card className="min-w-0 overflow-hidden min-[980px]:flex min-[980px]:h-full min-[980px]:min-h-0 min-[980px]:flex-col">
          <CardHeader className="border-b border-[#e5eaf2] p-3 pb-2 dark:border-[#263a55]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Open bug reports</CardTitle>
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
          <CardContent className="space-y-2 p-3 min-[980px]:flex min-[980px]:min-h-0 min-[980px]:flex-1 min-[980px]:flex-col min-[980px]:gap-2 min-[980px]:space-y-0">
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
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOpenPage(1);
                }}
              />
            </div>
            <BugReportList
              reports={openReports}
              selectedReportId={detailOpen ? mainSelectedReport?.id ?? null : null}
              emptyText={openEmptyText}
              className={openReportListClassName}
              variant="inbox"
              loading={refreshingStatus === "OPEN"}
              onSelect={(reportId) => {
                setSelectedReportId(reportId);
                setDetailOpen(true);
              }}
            />
            <PaginationControls
              className="reference-paginated-footer px-1 pb-0 pt-2"
              page={currentOpenPage}
              pageSize={openPageSize}
              pageSizeMenuPlacement="top"
              totalItems={openReportCount}
              itemLabel="open bug reports"
              isLoading={refreshingStatus === "OPEN"}
              onPageChange={changeOpenPage}
              onPageSizeChange={changeOpenPageSize}
            />
          </CardContent>
        </Card>
      </div>

      {detailOpen && mainSelectedReport ? (
        <BugReportDetailDialog
          report={mainSelectedReport}
          canManageStatus={canReviewAll}
          isUpdatingStatus={
            canReviewAll && updatingStatusId === mainSelectedReport.id
          }
          isDeleting={deletingReportId === mainSelectedReport.id}
          isLoadingAttachments={
            loadingDetailId === mainSelectedReport.id &&
            selectedReportNeedsAttachments
          }
          onClose={() => setDetailOpen(false)}
          onDelete={() => deleteSelectedReport(mainSelectedReport)}
          onStatusChange={(status) => {
            if (canReviewAll) {
              void updateSelectedReportStatus(mainSelectedReport, status);
            }
          }}
        />
      ) : null}

      {archiveOpen ? (
        <BugReportArchiveDialog
          reports={archiveReports}
          totalCount={archiveReportCount}
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
          isDeleting={Boolean(
            selectedArchiveReport &&
              deletingReportId === selectedArchiveReport.id,
          )}
          canManageStatus={canReviewAll}
          emptyText={archiveEmptyText}
          onSearchChange={setArchiveSearch}
          onSearchResetPage={() => setSolvedPage(1)}
          onSelect={setSelectedArchiveReportId}
          onClose={() => setArchiveOpen(false)}
          loading={refreshingStatus === "SOLVED"}
          page={currentSolvedPage}
          pageSize={solvedPageSize}
          onPageChange={changeSolvedPage}
          onPageSizeChange={changeSolvedPageSize}
          onStatusChange={(status) => {
            if (selectedArchiveReport) {
              updateSelectedReportStatus(selectedArchiveReport, status);
            }
          }}
          onDelete={() => {
            if (selectedArchiveReport) {
              deleteSelectedReport(selectedArchiveReport);
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
  isDeleting,
  canManageStatus,
  emptyText,
  onSearchChange,
  onSearchResetPage,
  onSelect,
  onClose,
  loading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onStatusChange,
  onDelete,
}: {
  reports: BugReport[];
  totalCount: number;
  search: string;
  selectedReport: BugReport | null;
  selectedReportId: string | null;
  isLoadingAttachments: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  canManageStatus: boolean;
  emptyText: string;
  onSearchChange: (value: string) => void;
  onSearchResetPage: () => void;
  onSelect: (reportId: string) => void;
  onClose: () => void;
  loading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onStatusChange: (status: "OPEN" | "SOLVED") => void;
  onDelete: () => void;
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
                onChange={(event) => {
                  onSearchChange(event.target.value);
                  onSearchResetPage();
                }}
              />
            </div>
            <BugReportList
              reports={reports}
              selectedReportId={selectedReportId}
              emptyText={emptyText}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
              loading={loading}
              onSelect={onSelect}
            />
            <PaginationControls
              className="reference-paginated-footer px-1 pb-0 pt-2"
              page={page}
              pageSize={pageSize}
              pageSizeMenuPlacement="top"
              totalItems={totalCount}
              itemLabel="solved bug reports"
              isLoading={loading}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>

          <div className="min-h-0">
            {selectedReport ? (
              <BugReportDetail
                report={selectedReport}
                canManageStatus={canManageStatus}
                isUpdatingStatus={isUpdatingStatus}
                isDeleting={isDeleting}
                isLoadingAttachments={isLoadingAttachments}
                className="h-full min-h-0 max-h-none shadow-none"
                contentClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
                onStatusChange={onStatusChange}
                onDelete={onDelete}
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

function BugReportDetailDialog({
  report,
  canManageStatus,
  isUpdatingStatus,
  isDeleting,
  isLoadingAttachments,
  onClose,
  onStatusChange,
  onDelete,
}: {
  report: BugReport;
  canManageStatus: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  isLoadingAttachments: boolean;
  onClose: () => void;
  onStatusChange: (status: "OPEN" | "SOLVED") => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#0f172a]/45 p-3 pt-5 backdrop-blur-[2px] min-[720px]:pt-8">
      <button
        type="button"
        aria-label="Dismiss bug report"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Bug report detail"
        className="relative z-10 flex max-h-[min(760px,calc(100dvh-2rem))] w-[min(920px,calc(100vw-2rem))] min-h-0 flex-col"
      >
        <BugReportDetail
          report={report}
          canManageStatus={canManageStatus}
          isUpdatingStatus={isUpdatingStatus}
          isDeleting={isDeleting}
          isLoadingAttachments={isLoadingAttachments}
          className="h-full min-h-0 max-h-none shadow-[0_24px_70px_rgba(15,23,42,0.24)]"
          contentClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2 [scrollbar-gutter:stable]"
          onStatusChange={onStatusChange}
          onDelete={onDelete}
          onClose={onClose}
        />
      </section>
    </div>
  );
}

function BugReportComposer({
  currentUserName,
  sourcePagePath,
  className,
  onCreated,
  onMessage,
}: {
  currentUserName: string;
  sourcePagePath?: string | null;
  className?: string;
  onCreated: (report: BugReport) => void;
  onMessage: (message: string | null) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<BugReportAttachmentDraft[]>(
    [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const bodyStats = useMemo(() => bugReportTextStats(body), [body]);
  const exceedsReportLimits =
    bodyStats.characters > maxBugReportBodyCharacters ||
    bodyStats.words > maxBugReportBodyWords ||
    bodyStats.lines > maxBugReportBodyLines;
  const canSubmit =
    body.trim().length > 0 &&
    !exceedsReportLimits &&
    !isSubmitting &&
    !isProcessingImages;

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
        error instanceof Error ? error.message : "Unable to attach that image.",
      );
    } finally {
      setIsProcessingImages(false);
    }
  }

  async function submitReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (exceedsReportLimits) {
      onMessage(limitMessage());
      return;
    }

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

      markServerDataStale();
      onCreated(data.bugReport);
      setBody("");
      setAttachments([]);
      onMessage("Bug report sent.");
    } catch {
      onMessage(
        "Unable to send bug report. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden min-[980px]:flex min-[980px]:flex-col",
        className,
      )}
    >
      <CardHeader className="shrink-0 p-3 pb-2">
        <CardTitle>New report</CardTitle>
        <CardDescription className="text-xs">{currentUserName}</CardDescription>
      </CardHeader>
      <CardContent className="p-3 pt-0 min-[980px]:flex min-[980px]:min-h-0 min-[980px]:flex-1">
        <form
          className="space-y-3 min-[980px]:flex min-[980px]:min-h-0 min-[980px]:flex-1 min-[980px]:flex-col min-[980px]:gap-3 min-[980px]:space-y-0"
          onSubmit={submitReport}
        >
          <Textarea
            aria-label="Bug report text"
            className="min-h-[220px] resize-none overflow-y-auto bg-white ring-1 ring-[#dbe5f4] [scrollbar-gutter:stable] dark:bg-[#0b1523] dark:ring-[#263a55] min-[980px]:min-h-0 min-[980px]:flex-1"
            placeholder="What happened?"
            value={body}
            maxLength={maxBugReportBodyCharacters}
            disabled={isSubmitting}
            onChange={(event) => setBody(event.target.value)}
          />
          <div
            className={cn(
              "flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-[#64748b] dark:text-muted-foreground",
              exceedsReportLimits && "text-[#dc2626] dark:text-red-300",
            )}
          >
            <span>
              Up to {maxBugReportBodyWords.toLocaleString()} words,{" "}
              {maxBugReportBodyLines.toLocaleString()} lines
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {bodyStats.words.toLocaleString()} /{" "}
                {maxBugReportBodyWords.toLocaleString()} words
              </span>
              <span>
                {bodyStats.lines.toLocaleString()} /{" "}
                {maxBugReportBodyLines.toLocaleString()} lines
              </span>
              <span>
                {bodyStats.characters.toLocaleString()} /{" "}
                {maxBugReportBodyCharacters.toLocaleString()} chars
              </span>
            </span>
          </div>

          {attachments.length > 0 ? (
            <div className="grid shrink-0 grid-cols-2 gap-2 min-[560px]:grid-cols-4">
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

          <div className="flex shrink-0 flex-col gap-2 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
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
  variant = "card",
  loading = false,
  onSelect,
}: {
  reports: BugReport[];
  selectedReportId: string | null;
  title?: string;
  emptyText?: string;
  className?: string;
  variant?: "card" | "inbox";
  loading?: boolean;
  onSelect: (reportId: string) => void;
}) {
  const isInbox = variant === "inbox";

  return (
    <div
      className={cn(
        isInbox
          ? "min-w-0 divide-y divide-[#e5eaf2] overflow-x-hidden rounded-[8px] bg-white ring-1 ring-[#dbe5f4] dark:divide-[#263a55] dark:bg-[#0b1523] dark:ring-[#263a55]"
          : "space-y-1.5",
        className,
      )}
      data-pagination-loading={
        loading && reports.length > 0 ? "true" : undefined
      }
      aria-busy={loading}
    >
      {title ? (
        <div className="px-1 text-xs font-semibold uppercase tracking-wide text-[#64748b] dark:text-muted-foreground">
          {title}
        </div>
      ) : null}
      {loading && reports.length === 0 ? (
        <EmptyReferenceState>Loading bug reports...</EmptyReferenceState>
      ) : reports.length === 0 ? (
        <EmptyReferenceState>
          {emptyText ??
            (title
              ? "No bug reports yet."
              : "No bug reports match this search.")}
        </EmptyReferenceState>
      ) : (
        <>
          {reports.map((report) => {
            const selected = report.id === selectedReportId;

            return (
              <button
                key={report.id}
                type="button"
                className={cn(
                  isInbox
                    ? "w-full border-l-2 border-transparent bg-white px-3 py-3 text-left transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563eb] dark:bg-[#0b1523] dark:hover:bg-white/[0.04]"
                    : "w-full rounded-[8px] bg-white p-2.5 text-left ring-1 ring-[#dbe5f4] transition-colors hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:bg-[#0f1b2a] dark:ring-[#263a55] dark:hover:bg-white/[0.04]",
                  selected
                    ? isInbox
                      ? "border-[#2563eb] bg-[#eff6ff] dark:border-[#60a5fa] dark:bg-blue-400/10"
                      : "bg-[#eff6ff] ring-[#93c5fd] dark:bg-blue-400/10 dark:ring-blue-300/40"
                    : null,
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
                    <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[#475569] [overflow-wrap:anywhere] dark:text-muted-foreground">
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
        </>
      )}
    </div>
  );
}

function BugReportDetail({
  report,
  canManageStatus,
  isUpdatingStatus,
  isDeleting = false,
  isLoadingAttachments = false,
  className,
  contentClassName,
  onStatusChange,
  onDelete,
  onClose,
}: {
  report: BugReport;
  canManageStatus: boolean;
  isUpdatingStatus: boolean;
  isDeleting?: boolean;
  isLoadingAttachments?: boolean;
  className?: string;
  contentClassName?: string;
  onStatusChange: (status: "OPEN" | "SOLVED") => void;
  onDelete?: () => void;
  onClose?: () => void;
}) {
  const isSolved = bugReportStatus(report) === "SOLVED";

  return (
    <Card
      className={cn(
        "flex min-h-[360px] max-h-[min(46rem,calc(100dvh-8rem))] flex-col overflow-hidden min-[980px]:min-h-0",
        className,
      )}
    >
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start gap-3">
          <ReporterAvatar report={report} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">
              {reportReporterName(report)}
            </CardTitle>
            <CardDescription className="text-xs">
              {report.reporter.email ?? "No email"}
            </CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canManageStatus ? (
              <>
                <Button
                  type="button"
                  variant={isSolved ? "outline" : "default"}
                  size="sm"
                  className={cn(
                    "h-8 px-2 text-xs",
                    !isSolved && "bg-[#16a34a] hover:bg-[#15803d]",
                  )}
                  disabled={isUpdatingStatus || isDeleting}
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
                {onDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={isUpdatingStatus || isDeleting}
                    onClick={onDelete}
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {isDeleting ? "Deleting..." : "Delete"}
                  </Button>
                ) : null}
              </>
            ) : null}
            {onClose ? (
              <button
                type="button"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#64748b] transition-colors hover:bg-[#eef2f7] hover:text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] dark:text-muted-foreground dark:hover:bg-white/10 dark:hover:text-foreground"
                aria-label="Close bug report"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </button>
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
              {report.solvedBy
                ? ` by ${reportReporterName({ ...report, reporter: report.solvedBy })}`
                : ""}
            </span>
          ) : null}
        </div>

        <div className="break-words whitespace-pre-wrap rounded-[8px] bg-[#f8fafc] p-3 text-sm leading-6 text-[#0f172a] ring-1 ring-[#dbe5f4] [overflow-wrap:anywhere] dark:bg-[#0b1523] dark:text-foreground dark:ring-[#263a55]">
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

function dedupeBugReports(reports: BugReport[]) {
  return mergeBugReports([], reports);
}

function mergeBugReports(current: BugReport[], next: BugReport[]) {
  const byId = new Map(current.map((report) => [report.id, report]));

  for (const report of next) {
    const existing = byId.get(report.id);
    byId.set(report.id, existing ? mergeBugReport(existing, report) : report);
  }

  return [...byId.values()].sort((first, second) => {
    const createdDelta =
      new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();

    return createdDelta || second.id.localeCompare(first.id);
  });
}

function mergeBugReport(existing: BugReport, next: BugReport): BugReport {
  const existingAttachments = new Map(
    existing.attachments.map((attachment) => [attachment.id, attachment]),
  );

  return {
    ...existing,
    ...next,
    attachments: next.attachments.map((attachment) => {
      const existingAttachment = attachment.id
        ? existingAttachments.get(attachment.id)
        : null;

      if (!existingAttachment?.dataUrl || attachment.dataUrl) {
        return attachment;
      }

      return {
        ...attachment,
        dataUrl: existingAttachment.dataUrl,
      };
    }),
  };
}

function bugReportStatus(report: BugReport) {
  return report.status ?? "OPEN";
}

function bugReportMatchesQuery(report: BugReport, query: string) {
  const reporter = reportReporterName(report).toLowerCase();
  const email = report.reporter.email?.toLowerCase() ?? "";
  const body = report.body.toLowerCase();

  return (
    reporter.includes(query) || email.includes(query) || body.includes(query)
  );
}

function matchesSearchValue(report: BugReport, value: string) {
  const query = value.trim().toLowerCase();

  return !query || bugReportMatchesQuery(report, query);
}

function bugReportTextStats(value: string) {
  const characters = value.length;
  const words = value.trim() ? (value.trim().match(/\S+/g)?.length ?? 0) : 0;
  const lines = value.length > 0 ? value.split(/\r\n|\r|\n/).length : 0;

  return { characters, words, lines };
}

function limitMessage() {
  return `Bug reports can be up to ${maxBugReportBodyWords.toLocaleString()} words, ${maxBugReportBodyLines.toLocaleString()} lines, and ${maxBugReportBodyCharacters.toLocaleString()} characters.`;
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
