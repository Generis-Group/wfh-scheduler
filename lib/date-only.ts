export function dateOnlyString(value?: string | Date | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString().slice(0, 10) : parsed.toISOString().slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

export function dateOnlyDisplayDate(value?: string | Date | null) {
  return new Date(`${dateOnlyString(value)}T12:00:00`);
}
