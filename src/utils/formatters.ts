export const formatCurrency = (value: number, currency = "EUR") =>
  new Intl.NumberFormat("sk-SK", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("sk-SK", { maximumFractionDigits: 2 }).format(value);

export const formatDate = (isoDate: string) =>
  new Intl.DateTimeFormat("sk-SK", { dateStyle: "medium" }).format(new Date(isoDate));
