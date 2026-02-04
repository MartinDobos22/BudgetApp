import { formatDayKey, formatMonthLabel, formatShortDate, getIsoWeekInfo, getIsoWeekRange, parseEntryDate } from "./dateUtils";

export function getEntryTotal(entry) {
  return (
    Number(entry?.totalPrice) ||
    entry?.items?.reduce((sum, item) => sum + (Number(item?.price) || 0), 0) ||
    0
  );
}

export function buildTimeTotals(history, granularity) {
  const totals = new Map();

  history.forEach((entry) => {
    const date = parseEntryDate(entry);
    if (!date) return;

    const total = getEntryTotal(entry);
    if (!total) return;

    let key = "";
    let label = "";

    if (granularity === "day") {
      key = formatDayKey(date);
      label = date.toLocaleDateString("sk-SK");
    } else if (granularity === "week") {
      const { year, week } = getIsoWeekInfo(date);
      key = `${year}-W${String(week).padStart(2, "0")}`;
      const { monday, sunday } = getIsoWeekRange(date);
      label = `Týždeň ${week} (${formatShortDate(monday)} – ${formatShortDate(sunday)})`;
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      label = formatMonthLabel(date);
    }

    const current = totals.get(key) || { key, label, total: 0 };
    current.total += total;
    totals.set(key, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.key.localeCompare(a.key));
}
