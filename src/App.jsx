import { useEffect, useMemo, useRef, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("sk-SK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const UNCATEGORIZED_LABEL = "Nezaradené";
const NO_SUBCATEGORY_LABEL = "Bez podkategórie";
const CATEGORY_FILTER_ALL = "all";

const STORE_GROUPS = [
  { label: "Lidl", keywords: ["lidl"] },
  { label: "Billa", keywords: ["billa"] },
  { label: "Fresh", keywords: ["fresh"] },
  { label: "Tesco", keywords: ["tesco"] },
  { label: "Kaufland", keywords: ["kaufland"] },
  { label: "Coop Jednota", keywords: ["jednota", "coop"] },
  { label: "Fajne", keywords: ["Fajne", "fajne potraviny"] },
  { label: "Labaš", keywords: ["Labaš", "Labaš s.r.o."] },
];

const ERROR_TIPS = {
  qr_decode_failed: "Priblíž QR, zvýš kontrast alebo pridaj viac svetla. Skús aj zmeniť uhol fotenia.",
  ocr_text_no_payload: "Skús odfotiť QR viac zblízka, bez odleskov a s vyšším kontrastom.",
  unsupported_qr_format: "Skontroluj, či je QR nepoškodený a skús inú fotku s lepším uhlom.",
  missing_image: "Vyber obrázok bločku a nahraj ho znova.",
};

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function parseIssueDate(value) {
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

function parseEntryDate(entry) {
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

function formatDayKey(date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getIsoWeekInfo(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return { year: utcDate.getUTCFullYear(), week: weekNumber };
}

function getIsoWeekRange(date) {
  const weekday = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - weekday + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatShortDate(date) {
  return date.toLocaleDateString("sk-SK", { day: "2-digit", month: "2-digit" });
}

function formatMonthLabel(date) {
  return date.toLocaleDateString("sk-SK", { month: "long", year: "numeric" });
}

function getEntryTotal(entry) {
  return (
    Number(entry?.totalPrice) ||
    entry?.items?.reduce((sum, item) => sum + (Number(item?.price) || 0), 0) ||
    0
  );
}

function buildTimeTotals(history, granularity) {
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
      key = `${year}-W${padNumber(week)}`;
      const { monday, sunday } = getIsoWeekRange(date);
      label = `Týždeň ${week} (${formatShortDate(monday)} – ${formatShortDate(sunday)})`;
    } else {
      key = `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
      label = formatMonthLabel(date);
    }

    const current = totals.get(key) || { key, label, total: 0 };
    current.total += total;
    totals.set(key, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.key.localeCompare(a.key));
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function guessStoreGroup(name) {
  const text = normalizeText(name);
  if (!text) return "";
  const match = STORE_GROUPS.find((store) => store.keywords.some((keyword) => text.includes(normalizeText(keyword))));
  return match?.label || "";
}

function buildAiCategoryMap(items, aiCategories) {
  if (!Array.isArray(aiCategories) || aiCategories.length === 0) return null;

  const byId = new Map();
  aiCategories.forEach((entry) => {
    const id = Number(entry?.id);
    if (!Number.isNaN(id)) {
      byId.set(id, entry);
    }
  });

  const byName = new Map();
  aiCategories.forEach((entry) => {
    const key = normalizeText(entry?.name);
    if (key && !byName.has(key)) {
      byName.set(key, entry);
    }
  });

  return new Map(
    items.map((item, idx) => [idx, byId.get(idx) || byName.get(normalizeText(item?.name)) || null]),
  );
}

export default function App() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState(null); // server response
  const [previewUrl, setPreviewUrl] = useState(null);
  const [categorizedItems, setCategorizedItems] = useState([]);
  const [history, setHistory] = useState([]);
  const [storeGroup, setStoreGroup] = useState("");
  const [notes, setNotes] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [manualStoreName, setManualStoreName] = useState("");
  const [manualStoreGroup, setManualStoreGroup] = useState("");
  const [manualIssueDate, setManualIssueDate] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualItems, setManualItems] = useState([
    { name: "", quantity: 1, price: "", category: "" },
  ]);
  const [selectedMainCategory, setSelectedMainCategory] = useState(CATEGORY_FILTER_ALL);
  const [selectedSubCategory, setSelectedSubCategory] = useState(CATEGORY_FILTER_ALL);

  const prettyJson = useMemo(() => {
    if (!resp) return "";
    try {
      return JSON.stringify(resp, null, 2);
    } catch {
      return String(resp);
    }
  }, [resp]);

  const diagnosticsJson = useMemo(() => {
    if (!resp) return "";
    try {
      return JSON.stringify(
        {
          qrMeta: resp?.qrMeta ?? null,
          lookupDebug: resp?.lookupDebug ?? null,
        },
        null,
        2,
      );
    } catch {
      return String(resp);
    }
  }, [resp]);

  const receipt =
    resp?.fsJson?.receipt ??
    resp?.fsJson?.data?.receipt ??
    resp?.fsJson?.result?.receipt ??
    resp?.fsJson?.response?.receipt ??
    null;
  const organization = receipt?.organization ?? null;
  const unit = receipt?.unit ?? null;
  const items = useMemo(() => receipt?.items ?? [], [receipt]);
  const vatSummary = receipt?.vatSummary ?? [];
  const aiCategories = useMemo(() => resp?.aiCategories ?? [], [resp]);
  const totalPrice = receipt?.totalPrice ?? null;
  const totalItems = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);
  const errorTip = resp?.errorCode ? ERROR_TIPS[resp.errorCode] || null : null;

  const totalsByCategory = useMemo(() => {
    const totals = {};
    history.forEach((entry) => {
      entry.items?.forEach((item) => {
        const category = item?.category || UNCATEGORIZED_LABEL;
        const price = Number(item?.price) || 0;
        totals[category] = (totals[category] || 0) + price;
      });
    });
    return totals;
  }, [history]);

  const categoryBreakdown = useMemo(() => {
    const breakdown = {};
    history.forEach((entry) => {
      entry.items?.forEach((item) => {
        const category = item?.category || UNCATEGORIZED_LABEL;
        const price = Number(item?.price) || 0;
        const [mainRaw, ...rest] = String(category).split("/");
        const main = mainRaw?.trim() || UNCATEGORIZED_LABEL;
        const sub = rest.join("/").trim() || NO_SUBCATEGORY_LABEL;
        if (!breakdown[main]) {
          breakdown[main] = { total: 0, subcategories: {} };
        }
        breakdown[main].total += price;
        breakdown[main].subcategories[sub] = (breakdown[main].subcategories[sub] || 0) + price;
      });
    });
    return breakdown;
  }, [history]);

  const mainCategoryOptions = useMemo(
    () => Object.keys(categoryBreakdown).sort((a, b) => a.localeCompare(b, "sk")),
    [categoryBreakdown],
  );

  const subCategoryOptions = useMemo(() => {
    if (selectedMainCategory === CATEGORY_FILTER_ALL) return [];
    const subcategories = categoryBreakdown[selectedMainCategory]?.subcategories ?? {};
    return Object.keys(subcategories).sort((a, b) => a.localeCompare(b, "sk"));
  }, [categoryBreakdown, selectedMainCategory]);

  const categorySummaryRows = useMemo(() => {
    if (selectedMainCategory === CATEGORY_FILTER_ALL) {
      return Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
    }
    const subcategories = categoryBreakdown[selectedMainCategory]?.subcategories ?? {};
    const rows = [[selectedMainCategory, categoryBreakdown[selectedMainCategory]?.total || 0]];
    if (selectedSubCategory !== CATEGORY_FILTER_ALL) {
      rows.push([`${selectedMainCategory}/${selectedSubCategory}`, subcategories[selectedSubCategory] || 0]);
      return rows;
    }
    return rows.concat(
      Object.entries(subcategories)
      .map(([subcategory, total]) => [`${selectedMainCategory}/${subcategory}`, total])
      .sort((a, b) => b[1] - a[1]),
    );
  }, [categoryBreakdown, selectedMainCategory, selectedSubCategory, totalsByCategory]);

  const totalsByStore = useMemo(() => {
    const totals = {};
    history.forEach((entry) => {
      const store = entry?.storeGroup || entry?.storeName || "Neznámy obchod";
      const price = getEntryTotal(entry);
      totals[store] = (totals[store] || 0) + price;
    });
    return totals;
  }, [history]);

  const totalsByDay = useMemo(() => buildTimeTotals(history, "day"), [history]);
  const totalsByWeek = useMemo(() => buildTimeTotals(history, "week"), [history]);
  const totalsByMonth = useMemo(() => buildTimeTotals(history, "month"), [history]);

  const manualCategorySuggestions = useMemo(() => {
    const categories = new Set();
    history.forEach((entry) => {
      entry.items?.forEach((item) => {
        if (item?.category) categories.add(item.category);
      });
    });
    return Array.from(categories);
  }, [history]);

  const manualItemsTotal = useMemo(
    () => manualItems.reduce((sum, item) => sum + (Number(item?.price) || 0), 0),
    [manualItems],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const response = await fetch("/api/receipts");
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) {
          setHistory(Array.isArray(data?.receipts) ? data.receipts : []);
        }
      } catch {
        if (!cancelled) setHistory([]);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!receipt) {
      console.log("[FE] receipt reset");
      setCategorizedItems([]);
      setStoreGroup("");
      setNotes("");
      return;
    }
    const suggestedStore = guessStoreGroup(organization?.name);
    setStoreGroup((prev) => prev || suggestedStore);
    const aiMap = buildAiCategoryMap(items, aiCategories);
    console.log("[FE] using AI categories.js", { items: items.length, ai: aiCategories.length });
    setCategorizedItems(
        items.map((item, idx) => {
          const ai = aiMap?.get(idx);
          return {
            ...item,
            category: ai?.category || "",
            categoryKey: ai?.categoryKey || "",
          };
        })
    );
  }, [receipt, organization?.name, items, aiCategories]);

  function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return currencyFormatter.format(Number(value));
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return numberFormatter.format(Number(value));
  }

  function onCategoryChange(index, value) {
    setCategorizedItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, category: value } : item)),
    );
  }

  function applyAutoCategories() {
    const aiMap = buildAiCategoryMap(items, aiCategories);
    console.log("[FE] applying AI categories.js from backend");
    setCategorizedItems((prev) =>
      prev.map((item, idx) => {
        const entry = aiMap?.get(idx);
        return {
          ...item,
          category: entry?.category || "",
          categoryKey: entry?.categoryKey || "",
        };
      }),
    );
  }

  function updateManualItem(index, key, value) {
    setManualItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)),
    );
  }

  function addManualItem() {
    setManualItems((prev) => [...prev, { name: "", quantity: 1, price: "", category: "" }]);
  }

  function removeManualItem(index) {
    setManualItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  function resetManualForm() {
    setManualStoreName("");
    setManualStoreGroup("");
    setManualIssueDate("");
    setManualNotes("");
    setManualItems([{ name: "", quantity: 1, price: "", category: "" }]);
  }

  async function saveToHistory() {
    if (!receipt) return;
    console.log("[FE] saving receipt to history", { items: categorizedItems.length });
    const entryItems = categorizedItems.map((item) => ({
      name: item?.name || "-",
      quantity: Number(item?.quantity) || 0,
      price: Number(item?.price) || 0,
      category: item?.category || UNCATEGORIZED_LABEL,
    }));
    const entry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      issueDate: receipt?.issueDate || null,
      storeName: organization?.name || "Neznámy obchod",
      storeGroup: storeGroup || guessStoreGroup(organization?.name) || UNCATEGORIZED_LABEL,
      totalPrice: Number(totalPrice) || entryItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
      notes: notes.trim(),
      items: entryItems,
    };
    try {
      setHistoryBusy(true);
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const saved = data?.receipt || entry;
        setHistory((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      }
    } finally {
      setHistoryBusy(false);
    }
  }

  async function saveManualEntry() {
    const filteredItems = manualItems
      .map((item) => ({
        name: item?.name?.trim(),
        quantity: Number(item?.quantity) || 0,
        price: Number(item?.price) || 0,
        category: item?.category?.trim() || "",
      }))
      .filter((item) => item.name || item.price);
    if (filteredItems.length === 0) return;
    const entryItems = filteredItems.map((item) => ({
      name: item.name || "-",
      quantity: item.quantity || 0,
      price: item.price || 0,
      category: item.category || UNCATEGORIZED_LABEL,
    }));
    const entry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      issueDate: manualIssueDate || null,
      storeName: manualStoreName.trim() || "Manuálny záznam",
      storeGroup: manualStoreGroup.trim() || manualStoreName.trim() || "Nezaradené",
      totalPrice: entryItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
      notes: manualNotes.trim(),
      items: entryItems,
    };
    try {
      setHistoryBusy(true);
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(entry),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const saved = data?.receipt || entry;
        setHistory((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
        resetManualForm();
      }
    } finally {
      setHistoryBusy(false);
    }
  }

  async function clearHistory() {
    console.log("[FE] clearing history");
    try {
      setHistoryBusy(true);
      const response = await fetch("/api/receipts", { method: "DELETE" });
      if (response.ok) {
        setHistory([]);
      }
    } finally {
      setHistoryBusy(false);
    }
  }

  const cameraInputRef = useRef(null);

  function handlePickedFile(nextFile) {
    console.log("[FE] file selected", { name: nextFile?.name, size: nextFile?.size });
    setFile(nextFile);
    setResp(null);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  function onPickFile(e) {
    const nextFile = e.target.files?.[0] || null;
    handlePickedFile(nextFile);
  }

  async function onSend(selectedFile = file) {
    if (!selectedFile) return;
    setBusy(true);
    setResp(null);
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const startedAt = performance.now();
    console.log("[FE] sending receipt to backend", {
      requestId,
      name: selectedFile?.name,
      size: selectedFile?.size,
      type: selectedFile?.type,
    });

    try {
      const fd = new FormData();
      fd.append("image", selectedFile);

      const r = await fetch("/api/receipt", {
        method: "POST",
        body: fd,
      });

      const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      console.log("[FE] backend response", {
        requestId,
        ok: r.ok,
        status: r.status,
        durationMs: Math.round(performance.now() - startedAt),
        qrMeta: data?.qrMeta || null,
        lookupStrategy: data?.lookupDebug?.strategy || null,
      });
      if (!r.ok) {
        console.log("[FE] backend error", data);
        setResp({ ok: false, ...data });
      } else {
        console.log("[FE] backend success", { cached: data?.cached, aiCategories: data?.aiCategories?.length || 0 });
        console.log("[FE] AI request payload", data?.aiDebug?.requestPayload || data?.aiDebug?.request || null);
        console.log("[FE] AI response raw", data?.aiDebug?.rawResponse || data?.aiDebug?.raw || null);
        console.log("[FE] AI parsed categories.js", data?.aiDebug?.parsed || data?.aiCategories || null);
        setResp(data);
      }
    } catch (e) {
      console.log("[FE] request failed", e);
      setResp({ ok: false, error: e?.message || String(e) });
    } finally {
      console.log("[FE] request finished", { requestId });
      setBusy(false);
    }
  }

  function onCaptureClick() {
    cameraInputRef.current?.click();
  }

  async function onCaptureFile(e) {
    const nextFile = e.target.files?.[0] || null;
    handlePickedFile(nextFile);
    if (nextFile) {
      await onSend(nextFile);
    }
  }

  return (
    <div className="wrap">
      <header className="header">
        <h1>QR bloček → OPD JSON</h1>
        <p>
          Nahraj fotku bločku (QR kód), backend prečíta QR a zavolá OPD endpoint.
          Výsledok (JSON) sa zobrazí nižšie.
        </p>
      </header>

      <section className="card">
        <div className="row">
          <input type="file" accept="image/*" onChange={onPickFile} disabled={busy} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCaptureFile}
            disabled={busy}
            style={{ display: "none" }}
          />
          <button type="button" onClick={onCaptureClick} disabled={busy}>
            Odfotiť bloček
          </button>
          <button onClick={onSend} disabled={!file || busy}>
            {busy ? "Spracúvam..." : "Odoslať fotku a získať JSON"}
          </button>
        </div>

        {previewUrl && (
          <div className="preview">
            <img src={previewUrl} alt="preview" />
          </div>
        )}

        <div className="hint muted">
          Tip: ak to nejde, sprav ostrejšiu fotku, viac svetla, alebo priblíž QR. HEIC z iPhonu
          prekonvertuj na JPG/PNG.
        </div>
      </section>

      <section className="card">
        <h2>Výstup z bločku</h2>

        {!resp && <p className="muted">Zatiaľ nič. Nahraj fotku a klikni na tlačidlo.</p>}

        {resp?.ok === false && (
          <div className="error">
            <div>
              <strong>Chyba:</strong> {resp.error}
            </div>
            {resp.errorCode && (
              <div className="muted">
                Kód: <code>{resp.errorCode}</code>
              </div>
            )}
            {errorTip && <div className="muted">Tip: {errorTip}</div>}
            {resp.details && <pre className="pre">{JSON.stringify(resp.details, null, 2)}</pre>}
          </div>
        )}

        {resp?.ok && !receipt && (
          <div className="error">
            <div>
              <strong>Upozornenie:</strong> OPD odpoveď neobsahuje <code>receipt</code>. Skontroluj QR/OCR alebo
              si pozri surový JSON nižšie.
            </div>
            <details className="raw-json">
              <summary>Zobraziť surový JSON</summary>
              <pre className="pre">{prettyJson}</pre>
            </details>
          </div>
        )}

        {resp?.ok && receipt && (
          <div className="receipt">
            <div className="receipt-header">
              <div>
                <p className="muted">Obchod</p>
                <h3>{organization?.name || "Neznámy obchod"}</h3>
                <p className="muted">
                  {organization?.streetName} {organization?.buildingNumber}, {organization?.postalCode}{" "}
                  {organization?.municipality}
                </p>
                <p className="muted">IČO: {organization?.ico || "-"} · DIČ: {organization?.dic || "-"}</p>
              </div>
              <div className="receipt-total">
                <p className="muted">Celková suma</p>
                <div className="total-amount">{formatCurrency(totalPrice)}</div>
                <p className="muted">Položiek: {totalItems}</p>
              </div>
            </div>

            <div className="receipt-meta">
              <div>
                <p className="muted">Dátum vystavenia</p>
                <p>{receipt?.issueDate || "-"}</p>
              </div>
              <div>
                <p className="muted">Číslo dokladu</p>
                <p>{receipt?.receiptNumber ?? "-"}</p>
              </div>
              <div>
                <p className="muted">Pokladňa</p>
                <p>{receipt?.cashRegisterCode || unit?.cashRegisterCode || "-"}</p>
              </div>
              <div>
                <p className="muted">Prevádzka</p>
                <p>
                  {unit?.municipality || "-"}
                  {unit?.streetName ? `, ${unit.streetName}` : ""}
                </p>
              </div>
            </div>

            <div className="receipt-section">
              <h4>Položky</h4>
              <div className="items-table items-table--categories">
                <div className="items-head">
                  <span>Názov</span>
                  <span>Množstvo</span>
                  <span>DPH %</span>
                  <span>Cena</span>
                  <span>Kategória</span>
                </div>
                {categorizedItems.map((item, idx) => (
                  <div className="items-row" key={`${item?.name}-${idx}`}>
                    <span className="item-name">{item?.name?.trim() || "-"}</span>
                    <span>{formatNumber(item?.quantity)}</span>
                    <span>{item?.vatRate ?? "-"}</span>
                    <span className={item?.price < 0 ? "negative" : ""}>{formatCurrency(item?.price)}</span>
                    <label className="category-field">
                      <span className="sr-only">Kategória pre {item?.name}</span>
                      <input
                        type="text"
                        list="category-suggestions"
                        value={item?.category || ""}
                        onChange={(event) => onCategoryChange(idx, event.target.value)}
                        placeholder="AI kategória"
                      />
                    </label>
                  </div>
                ))}
                <datalist id="category-suggestions">
                  {[...new Set(categorizedItems.map((item) => item?.category).filter(Boolean))].map((category) => (
                    <option value={category} key={category} />
                  ))}
                </datalist>
                <div className="items-actions">
                  <button type="button" onClick={applyAutoCategories}>
                    AI pretriediť kategórie
                  </button>
                  <p className="muted">
                    Kategórie sú navrhnuté cez AI z backendu a môžeš ich upraviť ručne.
                  </p>
                </div>
              </div>
            </div>

            <div className="receipt-section">
              <h4>Uložiť bloček do histórie</h4>
              <div className="history-form">
                <label>
                  <span className="field-label">Obchod (skupina)</span>
                  <input
                    type="text"
                    value={storeGroup}
                    onChange={(event) => setStoreGroup(event.target.value)}
                    list="store-groups"
                    placeholder="Lidl, Billa, Fresh..."
                  />
                </label>
                <label>
                  <span className="field-label">Poznámka</span>
                  <input
                    type="text"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="napr. veľký nákup na týždeň"
                  />
                </label>
                <datalist id="store-groups">
                  {STORE_GROUPS.map((store) => (
                    <option value={store.label} key={store.label} />
                  ))}
                </datalist>
                <button type="button" onClick={saveToHistory} disabled={historyBusy}>
                  {historyBusy ? "Ukladám..." : "Uložiť bloček"}
                </button>
              </div>
            </div>

            <div className="receipt-section">
              <h4>Sumáre</h4>
              <div className="summary-grid">
                <div>
                  <p className="muted">Spolu</p>
                  <p className="summary-value">{formatCurrency(totalPrice)}</p>
                </div>
                <div>
                  <p className="muted">Doklad OKP</p>
                  <p className="mono">{receipt?.okp || "-"}</p>
                </div>
                <div>
                  <p className="muted">Pokladnica</p>
                  <p className="mono">{receipt?.cashRegisterCode || "-"}</p>
                </div>
              </div>

              {vatSummary.length > 0 && (
                <div className="vat-summary">
                  <h5>DPH prehľad</h5>
                  <div className="items-table vat-table">
                    <div className="items-head">
                      <span>Sadzba</span>
                      <span>Základ</span>
                      <span>DPH</span>
                    </div>
                    {vatSummary.map((vat, idx) => (
                      <div className="items-row" key={`vat-${idx}`}>
                        <span>{vat?.vat?.vatRate ?? "-"}%</span>
                        <span>{formatCurrency(vat?.vatBase)}</span>
                        <span>{formatCurrency(vat?.vatAmount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <details className="raw-json">
              <summary>Zobraziť surový JSON</summary>
              <pre className="pre">{prettyJson}</pre>
            </details>
          </div>
        )}

        {resp && (
          <details className="raw-json">
            <summary>Zobraziť diagnostiku</summary>
            <pre className="pre">{diagnosticsJson}</pre>
          </details>
        )}
      </section>

      <section className="card">
        <div className="history-header">
          <h2>História a sumáre</h2>
          <button type="button" onClick={clearHistory} disabled={history.length === 0 || historyBusy}>
            {historyBusy ? "Mažem..." : "Vymazať históriu"}
          </button>
        </div>

        <div className="receipt-section manual-entry">
          <h4>Manuálne pridať výdavok</h4>
          <div className="history-form manual-form">
            <label>
              <span className="field-label">Obchod</span>
              <input
                type="text"
                value={manualStoreName}
                onChange={(event) => setManualStoreName(event.target.value)}
                placeholder="napr. Lidl, Billa"
              />
            </label>
            <label>
              <span className="field-label">Skupina obchodu</span>
              <input
                type="text"
                value={manualStoreGroup}
                onChange={(event) => setManualStoreGroup(event.target.value)}
                list="manual-store-groups"
                placeholder="potraviny, drogéria..."
              />
            </label>
            <label>
              <span className="field-label">Dátum</span>
              <input
                type="date"
                value={manualIssueDate}
                onChange={(event) => setManualIssueDate(event.target.value)}
              />
            </label>
            <label>
              <span className="field-label">Poznámka</span>
              <input
                type="text"
                value={manualNotes}
                onChange={(event) => setManualNotes(event.target.value)}
                placeholder="napr. rýchly nákup"
              />
            </label>
          </div>
          <datalist id="manual-store-groups">
            {STORE_GROUPS.map((store) => (
              <option value={store.label} key={store.label} />
            ))}
          </datalist>

          <div className="items-table manual-items">
            <div className="items-head">
              <span>Názov</span>
              <span>Množstvo</span>
              <span>Cena</span>
              <span>Kategória</span>
              <span>Akcia</span>
            </div>
            {manualItems.map((item, idx) => (
              <div className="items-row" key={`manual-${idx}`}>
                <input
                  type="text"
                  value={item.name}
                  onChange={(event) => updateManualItem(idx, "name", event.target.value)}
                  placeholder="položka"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.quantity}
                  onChange={(event) => updateManualItem(idx, "quantity", event.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.price}
                  onChange={(event) => updateManualItem(idx, "price", event.target.value)}
                />
                <input
                  type="text"
                  list="manual-category-suggestions"
                  value={item.category}
                  onChange={(event) => updateManualItem(idx, "category", event.target.value)}
                  placeholder="kategória"
                />
                <button
                  type="button"
                  onClick={() => removeManualItem(idx)}
                  disabled={manualItems.length === 1}
                >
                  Odstrániť
                </button>
              </div>
            ))}
            <datalist id="manual-category-suggestions">
              {manualCategorySuggestions.map((category) => (
                <option value={category} key={category} />
              ))}
            </datalist>
          </div>
          <div className="manual-items-actions">
            <button type="button" onClick={addManualItem}>
              Pridať položku
            </button>
            <div className="manual-total">
              Spolu: <strong>{formatCurrency(manualItemsTotal)}</strong>
            </div>
          </div>
          <button type="button" onClick={saveManualEntry} disabled={historyBusy || manualItemsTotal === 0}>
            {historyBusy ? "Ukladám..." : "Uložiť ručný záznam"}
          </button>
          <p className="muted">
            Pridaj aspoň jednu položku s cenou. Záznam sa uloží do histórie rovnako ako bločky.
          </p>
        </div>

        {history.length === 0 ? (
          <p className="muted">Zatiaľ nemáš uložené žiadne bločky.</p>
        ) : (
          <>
            <div className="summary-grid summary-grid--tight">
              <div>
                <p className="muted">Počet bločkov</p>
                <p className="summary-value">{history.length}</p>
              </div>
              <div>
                <p className="muted">Celkové výdavky</p>
                <p className="summary-value">
                  {formatCurrency(history.reduce((sum, entry) => sum + (Number(entry?.totalPrice) || 0), 0))}
                </p>
              </div>
            </div>

            <div className="receipt-section">
              <h4>Sumár podľa kategórií</h4>
              <div className="summary-filters">
                <label>
                  <span className="field-label">Hlavná kategória</span>
                  <select
                    value={selectedMainCategory}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedMainCategory(value);
                      setSelectedSubCategory(CATEGORY_FILTER_ALL);
                    }}
                  >
                    <option value={CATEGORY_FILTER_ALL}>Všetky kategórie</option>
                    {mainCategoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">Podkategória</span>
                  <select
                    value={selectedSubCategory}
                    onChange={(event) => setSelectedSubCategory(event.target.value)}
                    disabled={selectedMainCategory === CATEGORY_FILTER_ALL}
                  >
                    <option value={CATEGORY_FILTER_ALL}>
                      {selectedMainCategory === CATEGORY_FILTER_ALL
                        ? "Najprv vyber hlavnú kategóriu"
                        : "Všetky podkategórie"}
                    </option>
                    {subCategoryOptions.map((subcategory) => (
                      <option key={subcategory} value={subcategory}>
                        {subcategory}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="summary-table">
                {categorySummaryRows.length === 0 ? (
                  <p className="muted">Žiadne dáta pre vybraný filter.</p>
                ) : (
                  categorySummaryRows.map(([category, total]) => (
                    <div className="summary-row" key={category}>
                      <span>{category}</span>
                      <span className="summary-amount">{formatCurrency(total)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="receipt-section">
              <h4>Sumár podľa obchodov</h4>
              <div className="summary-table">
                {Object.entries(totalsByStore)
                  .sort((a, b) => b[1] - a[1])
                  .map(([store, total]) => (
                    <div className="summary-row" key={store}>
                      <span>{store}</span>
                      <span className="summary-amount">{formatCurrency(total)}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="receipt-section">
              <h4>Výdavky podľa času</h4>
              <div className="summary-grid">
                <div>
                  <p className="muted">Denne</p>
                  <div className="summary-table">
                    {totalsByDay.length === 0 ? (
                      <p className="muted">Nie sú dostupné denné dáta.</p>
                    ) : (
                      totalsByDay.map((entry) => (
                        <div className="summary-row" key={entry.key}>
                          <span>{entry.label}</span>
                          <span className="summary-amount">{formatCurrency(entry.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="muted">Týždenne</p>
                  <div className="summary-table">
                    {totalsByWeek.length === 0 ? (
                      <p className="muted">Nie sú dostupné týždenné dáta.</p>
                    ) : (
                      totalsByWeek.map((entry) => (
                        <div className="summary-row" key={entry.key}>
                          <span>{entry.label}</span>
                          <span className="summary-amount">{formatCurrency(entry.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="muted">Mesačne</p>
                  <div className="summary-table">
                    {totalsByMonth.length === 0 ? (
                      <p className="muted">Nie sú dostupné mesačné dáta.</p>
                    ) : (
                      totalsByMonth.map((entry) => (
                        <div className="summary-row" key={entry.key}>
                          <span>{entry.label}</span>
                          <span className="summary-amount">{formatCurrency(entry.total)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="receipt-section">
              <h4>Uložené bločky</h4>
              <div className="history-list">
                {history.map((entry) => (
                  <article className="history-card" key={entry.id}>
                    <div>
                      <p className="muted">{entry.issueDate || entry.createdAt?.slice(0, 10) || "-"}</p>
                      <h5>{entry.storeName}</h5>
                      <p className="muted">
                        Skupina: {entry.storeGroup || "Nezadaná"} · Položiek: {entry.items?.length || 0}
                      </p>
                      {entry.notes && <p className="muted">Poznámka: {entry.notes}</p>}
                    </div>
                    <div className="history-total">{formatCurrency(entry.totalPrice)}</div>
                  </article>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <footer className="footer muted">
        Backend: <code>/api/receipt</code> (upload obrázka → decode QR → OPD <code>receipt/find</code>)
      </footer>
    </div>
  );
}
