export const serverDataStaleEvent = "generis:server-data-stale";
export const serverDataFreshEvent = "generis:server-data-fresh";

declare global {
  interface Window {
    __generisServerDataVersion?: number;
    __generisServerDataFreshVersion?: number;
  }
}

export function getServerDataVersion() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.__generisServerDataVersion ?? 0;
}

export function getFreshServerDataVersion() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.__generisServerDataFreshVersion ?? 0;
}

export function hasStaleServerData() {
  return getServerDataVersion() !== getFreshServerDataVersion();
}

export function markServerDataStale() {
  if (typeof window === "undefined") {
    return;
  }

  const version = getServerDataVersion() + 1;
  window.__generisServerDataVersion = version;
  window.dispatchEvent(new CustomEvent(serverDataStaleEvent, { detail: { version } }));
}

export function markServerDataFresh() {
  if (typeof window === "undefined") {
    return;
  }

  const version = getServerDataVersion();
  window.__generisServerDataFreshVersion = version;
  window.dispatchEvent(new CustomEvent(serverDataFreshEvent, { detail: { version } }));
}

export function refreshStaleServerData(router: { refresh: () => void }) {
  if (!hasStaleServerData()) {
    return false;
  }

  router.refresh();
  markServerDataFresh();
  return true;
}
