import { addDays, format } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const DEFAULT_TIMEZONE = "America/Toronto";

export function todayDateString(timezone = DEFAULT_TIMEZONE) {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

export function parseReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Expected date in YYYY-MM-DD format.");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

export function reportDateString(date: Date, timezone = DEFAULT_TIMEZONE) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

export function zonedDayRange(dateString: string, timezone = DEFAULT_TIMEZONE) {
  const start = fromZonedTime(`${dateString}T00:00:00`, timezone);
  const end = fromZonedTime(`${dateString}T23:59:59.999`, timezone);

  return { start, end };
}

export function inclusiveDateRange(startDate: string, endDate = startDate) {
  const start = parseReportDate(startDate);
  const end = parseReportDate(endDate);
  const dates: Date[] = [];

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }

  return dates;
}

export function inputDate(date: Date) {
  return format(toZonedTime(date, "UTC"), "yyyy-MM-dd");
}
