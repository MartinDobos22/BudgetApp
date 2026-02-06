import { CATEGORY_TREE, MERCHANT_GROUPS } from "../utils/categories";
import { Receipt, ReceiptItem } from "../models/receipt";

const merchants = [
  "Tesco",
  "Lidl",
  "Kaufland",
  "Billa",
  "Dr.Max",
  "DM Drogerie",
  "Fresh Market",
  "Pizza Ristorante",
];

const productCatalog = [
  { name: "Čerstvé rožky", price: 0.19, categoryMain: "Potraviny", categorySub: "Pečivo" },
  { name: "Mlieko 1.5%", price: 1.09, categoryMain: "Potraviny", categorySub: "Mliečne" },
  { name: "Kuracie prsia", price: 5.49, categoryMain: "Potraviny", categorySub: "Mäso" },
  { name: "Jablká", price: 1.79, categoryMain: "Potraviny", categorySub: "Ovocie/Zelenina" },
  { name: "Minerálka", price: 0.89, categoryMain: "Potraviny", categorySub: "Nápoje" },
  { name: "Sprchový gél", price: 3.59, categoryMain: "Drogéria", categorySub: "Hygiena" },
  { name: "Čistič kuchyne", price: 2.79, categoryMain: "Drogéria", categorySub: "Čistiace" },
  { name: "Káva latte", price: 2.9, categoryMain: "Reštaurácie", categorySub: "Káva/Dezerty" },
  { name: "Menu obed", price: 7.5, categoryMain: "Reštaurácie", categorySub: "Obed" },
  { name: "Lístok MHD", price: 1.1, categoryMain: "Doprava", categorySub: "MHD" },
  { name: "Vitamíny C", price: 4.3, categoryMain: "Zdravie", categorySub: "Vitamíny" },
  { name: "Tričko basic", price: 9.99, categoryMain: "Oblečenie", categorySub: "Pánske" },
];

const randomId = () => Math.random().toString(36).slice(2, 10);

const randomDelay = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const randomItem = (): ReceiptItem => {
  const product = productCatalog[Math.floor(Math.random() * productCatalog.length)];
  const qty = Number((Math.random() * 2 + 0.5).toFixed(2));
  const lineTotal = Number((product.price * qty).toFixed(2));
  return {
    id: randomId(),
    name: product.name,
    qty,
    unitPrice: product.price,
    lineTotal,
    categoryMain: product.categoryMain,
    categorySub: product.categorySub,
  };
};

export const parseReceipt = (file: File): Promise<Receipt> =>
  new Promise((resolve, reject) => {
    const delay = randomDelay(1200, 2200);
    setTimeout(() => {
      if (Math.random() < 0.12) {
        reject(new Error("Nepodarilo sa prečítať QR kód. Skúste lepšie svetlo alebo ostrejší záber."));
        return;
      }

      const itemCount = Math.floor(Math.random() * 5) + 4;
      const items = Array.from({ length: itemCount }, randomItem);
      const total = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
      const merchant = merchants[Math.floor(Math.random() * merchants.length)];
      const merchantGroup = MERCHANT_GROUPS[Math.floor(Math.random() * MERCHANT_GROUPS.length)];
      const date = new Date();
      const receipt: Receipt = {
        id: `${Date.now()}-${randomId()}`,
        merchant,
        date: date.toISOString(),
        unit: "Prevádzka 01",
        currency: "EUR",
        total,
        items,
        merchantGroup,
        note: "",
        source: "qr",
        raw: {
          fileName: file.name,
          size: file.size,
          mime: file.type,
        },
        qrMeta: {
          source: "QR bloček",
          parseTimeMs: randomDelay(180, 380),
          warnings: Math.random() > 0.7 ? ["Nižší kontrast QR", "Neúplný okraj bločku"] : [],
        },
      };

      resolve(receipt);
    }, delay);
  });

export const categorizeItems = (items: ReceiptItem[]): Promise<ReceiptItem[]> =>
  new Promise((resolve, reject) => {
    const delay = randomDelay(700, 1200);
    setTimeout(() => {
      if (Math.random() < 0.18) {
        reject(new Error("AI kategorizácia dočasne zlyhala. Skúste to znova o chvíľu."));
        return;
      }

      const updated = items.map((item) => {
        const matched = Object.entries(CATEGORY_TREE).find(([_, subs]) =>
          subs.some((sub) => item.name.toLowerCase().includes(sub.toLowerCase().split("/")[0])),
        );
        const fallbackMain = item.categoryMain || matched?.[0] || "Iné";
        const fallbackSub = item.categorySub || matched?.[1]?.[0] || "Iné";
        return {
          ...item,
          categoryMain: fallbackMain,
          categorySub: fallbackSub,
        };
      });

      resolve(updated);
    }, delay);
  });
