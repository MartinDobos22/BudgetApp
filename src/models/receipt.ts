export type ReceiptSource = "qr" | "manual";

export interface QrMeta {
  source: string;
  parseTimeMs: number;
  warnings?: string[];
}

export interface ReceiptItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  categoryMain?: string;
  categorySub?: string;
}

export interface Receipt {
  id: string;
  merchant: string;
  date: string;
  unit?: string;
  currency: string;
  total: number;
  items: ReceiptItem[];
  note?: string;
  merchantGroup?: string;
  source: ReceiptSource;
  raw?: unknown;
  qrMeta?: QrMeta;
}
