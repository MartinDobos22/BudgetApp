export const UNCATEGORIZED_LABEL = "Nezaradené";
export const NO_SUBCATEGORY_LABEL = "Bez podkategórie";
export const CATEGORY_FILTER_ALL = "all";

export const STORE_GROUPS = [
  { label: "Lidl", keywords: ["lidl"] },
  { label: "Billa", keywords: ["billa"] },
  { label: "Fresh", keywords: ["fresh"] },
  { label: "Tesco", keywords: ["tesco"] },
  { label: "Kaufland", keywords: ["kaufland"] },
  { label: "Coop Jednota", keywords: ["jednota", "coop"] },
  { label: "Fajne", keywords: ["Fajne", "fajne potraviny"] },
  { label: "Labaš", keywords: ["Labaš", "Labaš s.r.o."] },
];

export const ERROR_TIPS = {
  qr_decode_failed: "Priblíž QR, zvýš kontrast alebo pridaj viac svetla. Skús aj zmeniť uhol fotenia.",
  ocr_text_no_payload: "Skús odfotiť QR viac zblízka, bez odleskov a s vyšším kontrastom.",
  unsupported_qr_format: "Skontroluj, či je QR nepoškodený a skús inú fotku s lepším uhlom.",
  missing_image: "Vyber obrázok bločku a nahraj ho znova.",
};
