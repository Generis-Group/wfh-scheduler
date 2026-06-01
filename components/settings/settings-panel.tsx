"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Cable,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Save,
  UserRound,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signIn } from "next-auth/react";

import {
  AccountSettings,
  type AccountUser,
} from "@/components/account/account-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FixedToast } from "@/components/ui/fixed-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { markServerDataStale } from "@/lib/client-cache-invalidation";
import type { OAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import type { IntegrationMetadata } from "@/lib/services/integration-metadata";
import { cn } from "@/lib/utils";

type Settings = {
  jiraCloudId?: string | null;
  googleCalendarId: string;
  googleTaskListIds: string[];
};

type CompanySettings = {
  jiraProjectKeys: string[];
};

type SettingsSectionId = "account" | "integrations" | "company";
type SettingsSectionConfig = {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
};

function normalizeIntegrationSettings(settings: Settings): Settings {
  return {
    jiraCloudId: settings.jiraCloudId || null,
    googleCalendarId: settings.googleCalendarId.trim() || "primary",
    googleTaskListIds: settings.googleTaskListIds,
  };
}

export function SettingsPanel({
  user,
  connected,
  oauthConfig,
  initialSettings,
  initialIntegrationMetadata,
  companySettings,
  canManageCompanySettings = false,
}: {
  user: AccountUser;
  connected: {
    google: boolean;
    atlassian: boolean;
  };
  oauthConfig: OAuthProviderConfig;
  initialSettings: Settings;
  initialIntegrationMetadata?: IntegrationMetadata;
  companySettings?: CompanySettings;
  canManageCompanySettings?: boolean;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [connectionState, setConnectionState] = useState(connected);
  const [integrationMetadata, setIntegrationMetadata] =
    useState<IntegrationMetadata>(
      initialIntegrationMetadata ?? {
        jiraResources: [],
        taskLists: [],
        providerErrors: {},
      },
    );
  const [metadataLoading, setMetadataLoading] = useState({
    google: connected.google && !initialIntegrationMetadata,
    atlassian: connected.atlassian && !initialIntegrationMetadata,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [disconnectingProvider, setDisconnectingProvider] = useState<
    "google" | "atlassian" | null
  >(null);
  const [jiraProjectsInput, setJiraProjectsInput] = useState(
    (companySettings?.jiraProjectKeys ?? []).join(", "),
  );
  const lastSavedIntegrationSettings = useRef(
    JSON.stringify(normalizeIntegrationSettings(initialSettings)),
  );
  const saveRequestId = useRef(0);

  const selectedTaskLists = useMemo(
    () => new Set(settings.googleTaskListIds),
    [settings.googleTaskListIds],
  );
  const jiraResources = integrationMetadata.jiraResources;
  const taskLists = integrationMetadata.taskLists;
  const providerErrors = integrationMetadata.providerErrors;
  const selectedJiraSite = jiraResources.find(
    (resource) => resource.id === settings.jiraCloudId,
  );
  const googleConfigured = oauthConfig.google;
  const googleTasksDisabled = !connectionState.google;
  const atlassianConfigured = oauthConfig.atlassian;
  const settingsSections = useMemo<SettingsSectionConfig[]>(
    () => [
      {
        id: "account" as const,
        label: "Account",
        icon: UserRound,
      },
      {
        id: "integrations" as const,
        label: "Integrations",
        icon: Cable,
      },
      ...(canManageCompanySettings
        ? [
            {
              id: "company" as const,
              label: "Company",
              icon: Users,
            },
          ]
        : []),
    ],
    [canManageCompanySettings],
  );
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("account");

  function toggleTaskList(id: string, checked: boolean) {
    setSettings((current) => ({
      ...current,
      googleTaskListIds: checked
        ? [...new Set([...current.googleTaskListIds, id])]
        : current.googleTaskListIds.filter((item) => item !== id),
    }));
  }

  useEffect(() => {
    if (!connectionState.google && !connectionState.atlassian) {
      setIntegrationMetadata({
        jiraResources: [],
        taskLists: [],
        providerErrors: {},
      });
      setMetadataLoading({ google: false, atlassian: false });
      return;
    }

    const controller = new AbortController();
    setMetadataLoading({
      google: connectionState.google,
      atlassian: connectionState.atlassian,
    });

    fetch("/api/settings/integration-metadata", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to load provider settings.");
        }

        setIntegrationMetadata({
          jiraResources: Array.isArray(body.jiraResources)
            ? body.jiraResources
            : [],
          taskLists: Array.isArray(body.taskLists) ? body.taskLists : [],
          providerErrors: body.providerErrors ?? {},
        });
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        const providerError =
          error instanceof Error
            ? error.message
            : "Unable to load provider settings.";
        setIntegrationMetadata({
          jiraResources: [],
          taskLists: [],
          providerErrors: {
            google: connectionState.google ? providerError : undefined,
            atlassian: connectionState.atlassian ? providerError : undefined,
          },
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMetadataLoading({ google: false, atlassian: false });
        }
      });

    return () => controller.abort();
  }, [connectionState.atlassian, connectionState.google]);

  useEffect(() => {
    function syncHashSection() {
      const nextSection = window.location.hash.replace("#", "");

      if (settingsSections.some((section) => section.id === nextSection)) {
        setActiveSection(nextSection as SettingsSectionId);
      }
    }

    syncHashSection();
    window.addEventListener("hashchange", syncHashSection);

    return () => window.removeEventListener("hashchange", syncHashSection);
  }, [settingsSections]);

  useEffect(() => {
    const payload = normalizeIntegrationSettings(settings);
    const serialized = JSON.stringify(payload);

    if (serialized === lastSavedIntegrationSettings.current) {
      return;
    }

    const currentRequestId = saveRequestId.current + 1;
    saveRequestId.current = currentRequestId;

    const timeout = window.setTimeout(async () => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (saveRequestId.current !== currentRequestId) {
        return;
      }

      if (response?.ok) {
        lastSavedIntegrationSettings.current = serialized;
        markServerDataStale();
        return;
      }

      setMessage("Unable to save integration settings automatically.");
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [settings]);

  async function saveCompanySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingCompany(true);
    setMessage(null);

    const payload = {
      jiraProjectKeys: jiraProjectsInput
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    };

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));

    setMessage(
      response.ok
        ? "Company settings saved."
        : (body.error ?? "Unable to save company settings."),
    );
    if (response.ok) {
      markServerDataStale();
    }
    setIsSavingCompany(false);
  }

  async function disconnect(provider: "google" | "atlassian") {
    if (disconnectingProvider) {
      return;
    }

    setDisconnectingProvider(provider);
    let shouldResetDisconnecting = true;

    try {
      const response = await fetch(`/api/settings/providers/${provider}`, {
        method: "DELETE",
      });

      if (response.ok) {
        shouldResetDisconnecting = false;
        markServerDataStale();
        window.location.reload();
        return;
      }

      setMessage(`Unable to disconnect ${provider}.`);
    } catch {
      setMessage(
        `Unable to disconnect ${provider}. Check your connection and try again.`,
      );
    } finally {
      if (shouldResetDisconnecting) {
        setDisconnectingProvider(null);
      }
    }
  }

  function connect(provider: "google" | "atlassian") {
    signIn(
      provider,
      { callbackUrl: "/settings#integrations" },
      provider === "google"
        ? {
            access_type: "offline",
            prompt: "consent select_account",
            scope: GOOGLE_OAUTH_SCOPE,
          }
        : {
            audience: "api.atlassian.com",
            prompt: "consent",
            scope: ATLASSIAN_OAUTH_SCOPE,
          },
    );
  }

  function selectSection(sectionId: SettingsSectionId) {
    setActiveSection(sectionId);
    window.history.replaceState(null, "", `/settings#${sectionId}`);
  }

  const activeSectionConfig =
    settingsSections.find((section) => section.id === activeSection) ??
    settingsSections[0];

  return (
    <>
      <main className="reference-page">
        <div className="mb-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <span className="text-[#2563eb]">Settings</span>
            <span className="text-[#98a2b3]">/</span>
            <span className="text-[#475467] dark:text-muted-foreground">
              {activeSectionConfig.label}
            </span>
          </div>
          <h1 className="reference-title">Settings</h1>
          <p className="reference-subtitle">
            Manage your account, integrations, and reporting preferences.
          </p>
        </div>

        <nav
          className="mb-6 flex gap-6 overflow-x-auto border-b border-[#d9e1ec] dark:border-[#263a55]"
          aria-label="Settings categories"
        >
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-2 pb-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "border-[#2563eb] text-[#2563eb] dark:border-[#60a5fa] dark:text-[#bfdbfe]"
                    : "border-transparent text-[#475467] hover:text-[#111827] dark:text-muted-foreground dark:hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
                onClick={() => selectSection(section.id)}
              >
                <Icon className="h-[18px] w-[18px]" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <section hidden={activeSection !== "account"} className="min-w-0">
          <AccountSettings user={user} embedded />
        </section>

        <section
          hidden={activeSection !== "integrations"}
          className="min-w-0 space-y-4"
        >
          <div className="grid min-w-0 gap-4 min-[980px]:grid-cols-2">
            <ProviderCard
              title="Atlassian Jira"
              description="Issues, worklogs, and changelogs become report activity."
              logo={<JiraLogo className="h-8 w-8" />}
              connected={connectionState.atlassian}
              configured={atlassianConfigured}
              configMessage="Add ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET to enable Jira sign-in."
              error={providerErrors?.atlassian}
              connectLabel={
                connectionState.atlassian ? "Reconnect Jira" : "Connect Jira"
              }
              isDisconnecting={disconnectingProvider === "atlassian"}
              disabled={disconnectingProvider !== null}
              onConnect={() => connect("atlassian")}
              onDisconnect={() => disconnect("atlassian")}
            >
              <div className="min-w-0 space-y-2">
                <Label>Jira cloud site</Label>
                <Select
                  value={settings.jiraCloudId ?? ""}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      jiraCloudId: event.target.value || null,
                    }))
                  }
                  disabled={
                    !connectionState.atlassian ||
                    metadataLoading.atlassian ||
                    jiraResources.length === 0
                  }
                >
                  <option value="">Auto-select first available site</option>
                  {jiraResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </Select>
                {metadataLoading.atlassian ? (
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-48 rounded-[4px]" />
                    <Skeleton className="h-3.5 w-32 rounded-[4px]" />
                  </div>
                ) : (
                  <p className="text-xs text-[#64748b]">
                    {selectedJiraSite
                      ? `Selected site: ${selectedJiraSite.name}`
                      : "Connect Jira to select a cloud site."}
                  </p>
                )}
              </div>
            </ProviderCard>

            <ProviderCard
              title="Google Workspace"
              description="Calendar and Tasks activity can be imported into daily reports."
              logo={<GoogleWorkspaceLogo className="h-8 w-8" />}
              connected={connectionState.google}
              configured={googleConfigured}
              configMessage="Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in."
              error={providerErrors?.google}
              connectLabel={
                connectionState.google ? "Reconnect Google" : "Connect Google"
              }
              isDisconnecting={disconnectingProvider === "google"}
              disabled={disconnectingProvider !== null}
              onConnect={() => connect("google")}
              onDisconnect={() => disconnect("google")}
            >
              <div className="min-w-0 space-y-2">
                <Label htmlFor="calendarId">Calendar ID</Label>
                <Input
                  id="calendarId"
                  value={settings.googleCalendarId}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      googleCalendarId: event.target.value || "primary",
                    }))
                  }
                />
                <p className="text-xs text-[#64748b]">
                  Use `primary` unless a separate calendar should feed reports.
                </p>
              </div>
            </ProviderCard>
          </div>

          <Card
            className={cn(
              "overflow-hidden transition-opacity",
              googleTasksDisabled && "opacity-55 grayscale",
            )}
            aria-disabled={googleTasksDisabled}
          >
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb] dark:bg-white/[0.06]">
                    <GoogleTasksLogo className="h-8 w-8" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-[18px]">
                      Google Tasks import
                    </CardTitle>
                    <CardDescription>
                      Choose which Google Tasks lists are eligible for daily
                      reports.
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 bg-[#f4f7fb] text-[#475569]"
                >
                  {settings.googleTaskListIds.length === 0
                    ? "All lists"
                    : `${settings.googleTaskListIds.length} selected`}
                </Badge>
              </div>

              <div className="mt-4 grid max-h-52 min-w-0 gap-2 overflow-y-auto rounded-[8px] border border-[#dfe7f2] bg-white p-2 dark:border-[#263a55] dark:bg-[#0b1523]">
                {metadataLoading.google ? (
                  <>
                    <Skeleton className="h-10 rounded-[6px]" />
                    <Skeleton className="h-10 rounded-[6px]" />
                    <Skeleton className="h-10 rounded-[6px]" />
                    <Skeleton className="h-10 rounded-[6px]" />
                  </>
                ) : taskLists.length === 0 ? (
                  <p className="col-span-full px-2 py-3 text-sm text-[#64748b]">
                    {providerErrors?.google
                      ? "Reconnect Google to load task lists."
                      : connectionState.google
                        ? "No task lists found. Empty selection imports all lists."
                        : "Connect Google to load task lists. Empty selection imports all lists."}
                  </p>
                ) : (
                  taskLists.map((list) => (
                    <label
                      key={list.id}
                      className="flex h-11 items-center justify-between gap-3 rounded-[7px] bg-[#f8fafc] px-3 text-sm ring-1 ring-[#e6ebf3] transition-colors hover:bg-[#f3f8ff] dark:bg-white/[0.03] dark:ring-[#263a55] dark:hover:bg-white/[0.06]"
                    >
                      <span className="min-w-0 truncate font-medium text-[#334155]">
                        {list.title}
                      </span>
                      <Checkbox
                        className="h-4 w-4"
                        checked={selectedTaskLists.has(list.id)}
                        disabled={googleTasksDisabled}
                        onChange={(event) =>
                          toggleTaskList(list.id, event.target.checked)
                        }
                      />
                    </label>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </section>

        {canManageCompanySettings ? (
          <section
            hidden={activeSection !== "company"}
            className="min-w-0 space-y-4"
          >
            <SectionHeading
              icon={Users}
              title="Company"
              description="Shared rules used by reviewer/admin workflows."
            />
            <Card>
              <CardHeader className="px-5 py-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb] dark:bg-white/[0.06]">
                    <Users className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-[18px]">
                      Company Controls
                    </CardTitle>
                    <CardDescription>
                      Shared rules used by reviewer/admin workflows.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <form className="space-y-4" onSubmit={saveCompanySettings}>
                  <div className="space-y-2">
                    <Label htmlFor="jira-projects">Jira project filters</Label>
                    <Input
                      id="jira-projects"
                      value={jiraProjectsInput}
                      onChange={(event) =>
                        setJiraProjectsInput(event.target.value)
                      }
                      placeholder="GEN, OPS"
                      disabled={!canManageCompanySettings}
                    />
                    <p className="text-xs text-[#64748b]">
                      Leave empty to import matching Jira activity from every
                      accessible project.
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                      disabled={isSavingCompany}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      {isSavingCompany ? "Saving..." : "Save company settings"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </main>
      <FixedToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb] dark:bg-white/[0.06]">
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0 pt-1">
        <h2 className="text-lg font-semibold tracking-normal text-[#111827] dark:text-foreground">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-[#667085] dark:text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function GoogleTasksLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 527.1 500"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        fill="#0066DA"
        points="410.4,58.3 368.8,81.2 348.2,120.6 368.8,168.8 407.8,211 450,187.5 475.9,142.8 450,87.5"
      />
      <path
        fill="#2684FC"
        d="M249.3,219.4l98.9-98.9c29.1,22.1,50.5,53.8,59.6,90.4L272.1,346.7c-12.2,12.2-32,12.2-44.2,0l-91.5-91.5c-9.8-9.8-9.8-25.6,0-35.3l39-39c9.8-9.8,25.6-9.8,35.3,0L249.3,219.4z M519.8,63.6l-39.7-39.7c-9.7-9.7-25.6-9.7-35.3,0l-34.4,34.4c27.5,23,49.9,51.8,65.5,84.5l43.9-43.9C529.6,89.2,529.6,73.3,519.8,63.6z M412.5,250c0,89.8-72.8,162.5-162.5,162.5S87.5,339.8,87.5,250S160.2,87.5,250,87.5c36.9,0,70.9,12.3,98.2,33.1l62.2-62.2C367,21.9,311.1,0,250,0C111.9,0,0,111.9,0,250s111.9,250,250,250s250-111.9,250-250c0-38.3-8.7-74.7-24.1-107.2L407.8,211C410.8,223.5,412.5,236.6,412.5,250z"
      />
    </svg>
  );
}

function JiraLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#0052CC"
        d="M7.12 11.084a.683.683 0 0 0-1.16.126L.075 22.974a.703.703 0 0 0 .63 1.018h8.19a.678.678 0 0 0 .63-.39c1.767-3.65.696-9.203-2.406-12.52z"
      />
      <path
        fill="#2684FF"
        d="M11.434.386a15.515 15.515 0 0 0-.906 15.317l3.95 7.9a.703.703 0 0 0 .628.388h8.19a.703.703 0 0 0 .63-1.017L12.63.38a.664.664 0 0 0-1.196.006z"
      />
    </svg>
  );
}

function GoogleWorkspaceLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18A13.18 13.18 0 0 1 11 24c0-1.45.25-2.86.69-4.18v-5.7H4.34A21.94 21.94 0 0 0 2 24c0 3.55.85 6.9 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  );
}

function ProviderCard({
  title,
  description,
  logo,
  connected,
  configured,
  configMessage,
  error,
  connectLabel,
  isDisconnecting = false,
  disabled = false,
  onConnect,
  onDisconnect,
  children,
}: {
  title: string;
  description: string;
  logo: ReactNode;
  connected: boolean;
  configured: boolean;
  configMessage: string;
  error?: string;
  connectLabel: string;
  isDisconnecting?: boolean;
  disabled?: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-[#eff6ff] text-[#2563eb] dark:bg-white/[0.06]">
              {logo}
            </span>
            <div className="min-w-0 pt-1">
              <CardTitle className="text-[18px]">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <ConnectionBadge connected={connected} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border border-[#dfe7f2] bg-white text-[#2563eb] hover:bg-[#eff6ff] dark:border-[#263a55] dark:bg-white/[0.04]"
            disabled={!configured || disabled}
            title={configured ? connectLabel : configMessage}
            onClick={onConnect}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {connectLabel}
          </Button>
          {connected ? (
            <Button
              variant="outline"
              size="sm"
              className="border border-[#dfe7f2] bg-white text-[#111827] hover:bg-[#f8fafc] dark:border-[#263a55] dark:bg-white/[0.04]"
              disabled={disabled}
              onClick={onDisconnect}
            >
              {isDisconnecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              {isDisconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          ) : null}
        </div>
        {!configured ? (
          <p className="text-sm text-[#64748b]">{configMessage}</p>
        ) : null}
        {error ? (
          <p className="rounded-[8px] border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <Badge
      className={
        connected
          ? "border-[#b7e4bf] bg-[#ecfdf0] text-[#15803d] hover:bg-[#ecfdf0]"
          : "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c] hover:bg-[#fff7ed]"
      }
      variant="outline"
    >
      {connected ? (
        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <XCircle className="mr-1.5 h-3.5 w-3.5" />
      )}
      {connected ? "Connected" : "Not connected"}
    </Badge>
  );
}
