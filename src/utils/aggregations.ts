import { Receipt } from "../models/receipt";

export type TimeBucket = "day" | "week" | "month";

export const sumByCategory = (history: Receipt[]) => {
  const totals = new Map<string, number>();
  history.forEach((receipt) => {
    receipt.items.forEach((item) => {
      const main = item.categoryMain || "Nezaradené";
      const sub = item.categorySub || "Bez podkategórie";
      const key = `${main} / ${sub}`;
      totals.set(key, (totals.get(key) || 0) + item.lineTotal);
    });
  });
  return Array.from(totals.entries()).map(([name, total]) => ({ name, total }));
};

export const sumByMerchant = (history: Receipt[]) => {
  const totals = new Map<string, number>();
  history.forEach((receipt) => {
    const key = receipt.merchantGroup || receipt.merchant || "Neznámy obchod";
    totals.set(key, (totals.get(key) || 0) + receipt.total);
  });
  return Array.from(totals.entries()).map(([name, total]) => ({ name, total }));
};

const getWeekNumber = (date: Date) => {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const diff = target.valueOf() - firstThursday.valueOf();
  return 1 + Math.round(diff / 604800000);
};

export const sumByTime = (history: Receipt[], bucket: TimeBucket) => {
  const totals = new Map<string, number>();
  history.forEach((receipt) => {
    const date = new Date(receipt.date);
    let key = "";
    if (bucket === "day") {
      key = date.toISOString().slice(0, 10);
    } else if (bucket === "week") {
      key = `${date.getFullYear()}-W${getWeekNumber(date)}`;
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }
    totals.set(key, (totals.get(key) || 0) + receipt.total);
  });
  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, total]) => ({ name, total }));
};
