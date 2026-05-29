type TimingDetails = Record<string, unknown>;

function isServerTimingEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.GENERIS_PERF_LOGS === "1"
  );
}

function isClientTimingEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    process.env.NODE_ENV !== "production" ||
    window.localStorage?.getItem("generis.perfLogs") === "1"
  );
}

function detailSuffix(details?: TimingDetails) {
  return details ? ` ${JSON.stringify(details)}` : "";
}

export async function withServerTiming<T>(
  label: string,
  callback: () => Promise<T>,
  details?: TimingDetails,
) {
  const start = performance.now();

  try {
    return await callback();
  } finally {
    if (isServerTimingEnabled()) {
      const durationMs = Math.round(performance.now() - start);
      console.info(`[perf] ${label} ${durationMs}ms${detailSuffix(details)}`);
    }
  }
}

export function startClientTiming(label: string, details?: TimingDetails) {
  const start =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  if (isClientTimingEnabled() && typeof performance !== "undefined") {
    performance.mark(`${label}:start`);
  }

  return (outcome?: TimingDetails) => {
    if (!isClientTimingEnabled()) {
      return;
    }

    const end =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.round(end - start);

    if (typeof performance !== "undefined") {
      performance.mark(`${label}:end`);
    }

    console.debug(
      `[perf] ${label} ${durationMs}ms${detailSuffix({
        ...details,
        ...outcome,
      })}`,
    );
  };
}
