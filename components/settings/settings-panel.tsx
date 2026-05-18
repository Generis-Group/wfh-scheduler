"use client";

import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  KanbanSquare,
  ListChecks,
  Mail,
  Save,
  Users,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signIn } from "next-auth/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { OAuthProviderConfig } from "@/lib/oauth-config";
import { ATLASSIAN_OAUTH_SCOPE, GOOGLE_OAUTH_SCOPE } from "@/lib/oauth-scopes";
import { titleCase } from "@/lib/utils";

type Settings = {
  jiraCloudId?: string | null;
  googleCalendarId: string;
  googleTaskListIds: string[];
};

type JiraResource = {
  id: string;
  name: string;
  url: string;
};

type TaskList = {
  id: string;
  title: string;
};

type CompanySettings = {
  jiraProjectKeys: string[];
};

type EmailStatus = {
  configured: boolean;
  provider: string;
  from?: string | null;
  digestTime: string;
  recipientRule: string;
};

type LastEmailRun = {
  reportDate: string | Date;
  trigger: string;
  status: string;
  recipientEmails: string[];
  subject: string;
  errorMessage?: string | null;
  createdAt: string | Date;
  completedAt?: string | Date | null;
};

type IntegrationSaveStatus = "saved" | "saving" | "error";

function normalizeIntegrationSettings(settings: Settings): Settings {
  return {
    jiraCloudId: settings.jiraCloudId || null,
    googleCalendarId: settings.googleCalendarId.trim() || "primary",
    googleTaskListIds: settings.googleTaskListIds
  };
}

function formatSettingTimestamp(value?: string | Date | null) {
  if (!value) {
    return "Never";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function SettingsPanel({
  connected,
  oauthConfig,
  initialSettings,
  jiraResources,
  taskLists,
  providerErrors,
  isPreview = false,
  companySettings,
  canManageCompanySettings = false,
  viewerKind = "employee",
  emailStatus,
  lastEmailRun
}: {
  connected: {
    google: boolean;
    atlassian: boolean;
  };
  oauthConfig: OAuthProviderConfig;
  initialSettings: Settings;
  jiraResources: JiraResource[];
  taskLists: TaskList[];
  providerErrors?: {
    google?: string;
    atlassian?: string;
  };
  isPreview?: boolean;
  companySettings?: CompanySettings;
  canManageCompanySettings?: boolean;
  viewerKind?: "employee" | "admin";
  emailStatus?: EmailStatus;
  lastEmailRun?: LastEmailRun | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [connectionState, setConnectionState] = useState(connected);
  const [message, setMessage] = useState<string | null>(null);
  const [integrationSaveStatus, setIntegrationSaveStatus] = useState<IntegrationSaveStatus>("saved");
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [jiraProjectsInput, setJiraProjectsInput] = useState((companySettings?.jiraProjectKeys ?? []).join(", "));
  const lastSavedIntegrationSettings = useRef(JSON.stringify(normalizeIntegrationSettings(initialSettings)));
  const saveRequestId = useRef(0);

  const selectedTaskLists = useMemo(() => new Set(settings.googleTaskListIds), [settings.googleTaskListIds]);
  const selectedJiraSite = jiraResources.find((resource) => resource.id === settings.jiraCloudId);
  const googleConfigured = oauthConfig.google;
  const atlassianConfigured = oauthConfig.atlassian;

  function toggleTaskList(id: string, checked: boolean) {
    setSettings((current) => ({
      ...current,
      googleTaskListIds: checked
        ? [...new Set([...current.googleTaskListIds, id])]
        : current.googleTaskListIds.filter((item) => item !== id)
    }));
  }

  useEffect(() => {
    const payload = normalizeIntegrationSettings(settings);
    const serialized = JSON.stringify(payload);

    if (serialized === lastSavedIntegrationSettings.current) {
      return;
    }

    setIntegrationSaveStatus("saving");
    const currentRequestId = saveRequestId.current + 1;
    saveRequestId.current = currentRequestId;

    const timeout = window.setTimeout(async () => {
      if (isPreview) {
        if (saveRequestId.current === currentRequestId) {
          lastSavedIntegrationSettings.current = serialized;
          setIntegrationSaveStatus("saved");
        }
        return;
      }

      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(() => null);

      if (saveRequestId.current !== currentRequestId) {
        return;
      }

      if (response?.ok) {
        lastSavedIntegrationSettings.current = serialized;
        setIntegrationSaveStatus("saved");
        return;
      }

      setIntegrationSaveStatus("error");
      setMessage("Unable to save integration settings automatically.");
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [isPreview, settings]);

  const integrationSaveLabel =
    integrationSaveStatus === "saving"
      ? "Saving changes..."
      : integrationSaveStatus === "error"
        ? "Could not save changes"
        : "Changes save automatically";

  async function saveCompanySettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingCompany(true);
    setMessage(null);

    const payload = {
      jiraProjectKeys: jiraProjectsInput.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean)
    };

    if (isPreview) {
      setMessage("Preview company settings saved locally.");
      setIsSavingCompany(false);
      return;
    }

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));

    setMessage(response.ok ? "Company settings saved." : body.error ?? "Unable to save company settings.");
    setIsSavingCompany(false);
  }

  async function disconnect(provider: "google" | "atlassian") {
    if (isPreview) {
      setConnectionState((current) => ({ ...current, [provider]: false }));
      setMessage(`${provider === "google" ? "Google" : "Atlassian"} disconnected in preview.`);
      return;
    }

    const response = await fetch(`/api/settings/providers/${provider}`, { method: "DELETE" });

    if (response.ok) {
      window.location.reload();
      return;
    }

    setMessage(`Unable to disconnect ${provider}.`);
  }

  function connect(provider: "google" | "atlassian") {
    if (isPreview) {
      setConnectionState((current) => ({ ...current, [provider]: true }));
      setMessage(`${provider === "google" ? "Google" : "Atlassian"} connected in preview.`);
      return;
    }

    signIn(
      provider,
      { callbackUrl: "/settings" },
      provider === "google"
        ? { access_type: "offline", prompt: "consent select_account", scope: GOOGLE_OAUTH_SCOPE }
        : {
            audience: "api.atlassian.com",
            prompt: "consent",
            scope: ATLASSIAN_OAUTH_SCOPE
          }
    );
  }

  function openAtlassianLogout() {
    window.open("https://id.atlassian.com/logout", "_blank", "noopener,noreferrer");
    setMessage("A new tab opened to sign out of Atlassian. After signing out there, return here and click Connect Jira again.");
  }

  return (
    <main className="reference-page">
      <div className="reference-page-header">
        <div>
          <h1 className="reference-title">Settings</h1>
          <p className="reference-subtitle">
            Manage reporting integrations, import rules, and reviewer/admin delivery settings.
          </p>
        </div>
      </div>

      {message ? (
        <div className="mb-4 rounded-[10px] bg-white/80 px-4 py-3 text-sm text-[#475569] shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:bg-[#0f1b2a] dark:text-muted-foreground">
          {message}
        </div>
      ) : null}

      <div className="space-y-4">
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            <ProviderCard
              title="Atlassian Jira"
              description="Issues, worklogs, and changelogs become report activity."
              icon={KanbanSquare}
              connected={connectionState.atlassian}
              configured={atlassianConfigured}
              configMessage="Add ATLASSIAN_CLIENT_ID and ATLASSIAN_CLIENT_SECRET to enable Jira sign-in."
              error={providerErrors?.atlassian}
              connectLabel={connectionState.atlassian ? "Reconnect Jira" : "Connect Jira"}
              onConnect={() => connect("atlassian")}
              onDisconnect={() => disconnect("atlassian")}
            >
              <div className="rounded-[8px] border border-[#bfdbfe] bg-[#eff6ff] p-3 text-sm text-[#1f3b68] dark:border-blue-300/15 dark:bg-blue-400/10 dark:text-blue-100">
                <p>
                  Atlassian may reuse the account already signed in at id.atlassian.com. If the wrong account opens, sign out of Atlassian first, then reconnect Jira.
                </p>
                <Button variant="outline" size="sm" className="mt-3 bg-white dark:bg-[#0f1b2a]" onClick={openAtlassianLogout}>
                  Use a different Atlassian account
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Jira cloud site</Label>
                <Select
                  value={settings.jiraCloudId ?? ""}
                  onChange={(event) => setSettings((current) => ({ ...current, jiraCloudId: event.target.value || null }))}
                  disabled={!connectionState.atlassian || jiraResources.length === 0}
                >
                  <option value="">Auto-select first available site</option>
                  {jiraResources.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.name}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-[#64748b]">
                  {selectedJiraSite ? `Selected site: ${selectedJiraSite.name}` : "Connect Jira to select a cloud site."}
                </p>
              </div>
            </ProviderCard>

            <ProviderCard
              title="Google Workspace"
              description="Calendar meetings and selected Tasks lists become report activity."
              icon={CalendarDays}
              connected={connectionState.google}
              configured={googleConfigured}
              configMessage="Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in."
              error={providerErrors?.google}
              connectLabel={connectionState.google ? "Reconnect Google" : "Connect Google"}
              onConnect={() => connect("google")}
              onDisconnect={() => disconnect("google")}
            >
              <div className="space-y-2">
                <Label htmlFor="calendarId">Calendar ID</Label>
                <Input
                  id="calendarId"
                  value={settings.googleCalendarId}
                  onChange={(event) => setSettings((current) => ({ ...current, googleCalendarId: event.target.value || "primary" }))}
                />
                <p className="text-xs text-[#64748b]">Use `primary` unless a separate calendar should feed reports.</p>
              </div>
            </ProviderCard>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ListChecks className="h-5 w-5 text-[#2563eb]" />
                  <div>
                    <CardTitle>Google Tasks Lists</CardTitle>
                    <CardDescription>Select the task lists that should be imported into daily reports.</CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="bg-[#f8fafc] text-[#475569]">
                  {settings.googleTaskListIds.length === 0 ? "All lists" : `${settings.googleTaskListIds.length} selected`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="reference-card-muted grid gap-2 p-3">
                {taskLists.length === 0 ? (
                  <p className="text-sm text-[#64748b]">
                    {providerErrors?.google
                      ? "Reconnect Google to load task lists."
                      : connectionState.google
                        ? "No task lists found. Empty selection imports all lists."
                        : "Connect Google to load task lists. Empty selection imports all lists."}
                  </p>
                ) : (
                  taskLists.map((list) => (
                    <label key={list.id} className="flex items-center justify-between gap-3 rounded-[6px] px-2 py-2 text-sm hover:bg-[#f8fafc] dark:hover:bg-muted">
                      <span className="font-medium text-[#334155]">{list.title}</span>
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-[#cbd5e1] accent-[#2563eb]"
                        checked={selectedTaskLists.has(list.id)}
                        onChange={(event) => toggleTaskList(list.id, event.target.checked)}
                      />
                    </label>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {viewerKind === "admin" && emailStatus ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-[#2563eb]" />
                    <div>
                      <CardTitle>Email Digests</CardTitle>
                      <CardDescription>Reviewer/admin report summaries delivered through Resend.</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      emailStatus.configured
                        ? "border-[#b7e4bf] bg-[#ecfdf0] text-[#15803d]"
                        : "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]"
                    }
                  >
                    {emailStatus.configured ? "Configured" : "Needs env vars"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <InfoRow icon={Mail} label="Provider" value={emailStatus.provider} />
                <InfoRow icon={Clock3} label="Daily digest" value={emailStatus.digestTime} />
                <InfoRow icon={Users} label="Recipients" value={emailStatus.recipientRule} />
                <InfoRow icon={Mail} label="From address" value={emailStatus.from ?? "Not configured"} />
                <InfoRow icon={CheckCircle2} label="Last run" value={lastEmailRun ? `${titleCase(lastEmailRun.status)} - ${formatSettingTimestamp(lastEmailRun.completedAt ?? lastEmailRun.createdAt)}` : "Never"} />
                <InfoRow icon={CalendarDays} label="Last report date" value={lastEmailRun ? String(lastEmailRun.reportDate).slice(0, 10) : "None"} />
                {lastEmailRun?.errorMessage ? (
                  <div className="rounded-[8px] border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive md:col-span-2">
                    {lastEmailRun.errorMessage}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="flex justify-end text-xs font-medium text-[#64748b] dark:text-muted-foreground">
            <span
              className={
                integrationSaveStatus === "error"
                  ? "text-destructive"
                  : integrationSaveStatus === "saving"
                    ? "text-[#2563eb] dark:text-[#7db4ff]"
                    : "text-[#15803d] dark:text-[#54d387]"
              }
            >
              {integrationSaveLabel}
            </span>
          </div>

          {viewerKind === "admin" ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-[#2563eb]" />
                    <div>
                      <CardTitle>Company Controls</CardTitle>
                      <CardDescription>Shared rules used by reviewer/admin workflows.</CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-[#f8fafc] text-[#475569]">
                    {canManageCompanySettings || isPreview ? "Editable" : "Read only"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={saveCompanySettings}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Required email domain</Label>
                      <div className="rounded-[8px] bg-[#f8fafc] px-3 py-2 text-sm font-semibold text-[#0f172a] dark:bg-muted dark:text-foreground">
                        @generisgp.com
                      </div>
                      <p className="text-xs text-[#64748b]">Company access is hard-restricted to this domain.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jira-projects">Jira project filters</Label>
                      <Input
                        id="jira-projects"
                        value={jiraProjectsInput}
                        onChange={(event) => setJiraProjectsInput(event.target.value)}
                        placeholder="GEN, OPS"
                        disabled={!canManageCompanySettings && !isPreview}
                      />
                      <p className="text-xs text-[#64748b]">Leave empty to import matching Jira activity from every accessible project.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-[#64748b]">Employee access is managed from the Employees page.</div>
                    {(canManageCompanySettings || isPreview) ? (
                      <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={isSavingCompany}>
                        <Save className="mr-2 h-4 w-4" />
                        {isSavingCompany ? "Saving..." : "Save company settings"}
                      </Button>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>
          ) : null}
      </div>
    </main>
  );
}

function ProviderCard({
  title,
  description,
  icon: Icon,
  connected,
  configured,
  configMessage,
  error,
  connectLabel,
  onConnect,
  onDisconnect,
  children
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  connected: boolean;
  configured: boolean;
  configMessage: string;
  error?: string;
  connectLabel: string;
  onConnect: () => void;
  onDisconnect: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-[#2563eb]" />
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <ConnectionBadge connected={connected} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!configured}
            title={configured ? connectLabel : configMessage}
            onClick={onConnect}
          >
            <Icon className="mr-2 h-4 w-4" />
            {connectLabel}
          </Button>
          {connected ? (
            <Button variant="ghost" onClick={onDisconnect}>
              Disconnect
            </Button>
          ) : null}
        </div>
        {!configured ? <p className="text-sm text-[#64748b]">{configMessage}</p> : null}
        {error ? (
          <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
      {connected ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <XCircle className="mr-1.5 h-3.5 w-3.5" />}
      {connected ? "Connected" : "Not connected"}
    </Badge>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] bg-[#f8fafc] p-3 dark:bg-muted">
      <div className="flex items-center gap-2 text-xs font-medium text-[#64748b]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-[#0f172a]">{value}</div>
    </div>
  );
}
