function padNumber(value) {
  return String(value).padStart(2, "0");
}

export function parseIssueDate(value) {
  if (!value) return null;
  const source = String(value).trim();
  const isoMatch = source.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?$/);
  if (isoMatch) {
    const timePart = isoMatch[2] ? `T${isoMatch[2]}` : "T00:00:00";
    const date = new Date(`${isoMatch[1]}${timePart}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const skMatch = source.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?$/);
  if (skMatch) {
    const timePart = skMatch[4] || "00:00:00";
    const date = new Date(`${skMatch[3]}-${skMatch[2]}-${skMatch[1]}T${timePart}`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const parsed = new Date(source);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

export function parseEntryDate(entry) {
  if (entry?.issueDate) {
    const parsedIssueDate = parseIssueDate(entry.issueDate);
    if (parsedIssueDate) return parsedIssueDate;
  }

  if (entry?.createdAt) {
    const created = new Date(entry.createdAt);
    if (!Number.isNaN(created.getTime())) return created;
  }

  return null;
}

export function formatDayKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

export function getIsoWeekInfo(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { year: utcDate.getUTCFullYear(), week: weekNumber };
}

export function getIsoWeekRange(date) {
  const weekday = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

export function formatShortDate(date) {
  return date.toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit" });
}

export function formatMonthLabel(date) {
  return date.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}
