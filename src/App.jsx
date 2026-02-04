import { useEffect, useMemo, useRef, useState } from "react";
import HistorySection from "./components/HistorySection";
import ReceiptOutput from "./components/ReceiptOutput";
import UploadCard from "./components/UploadCard";
import { CATEGORY_FILTER_ALL, ERROR_TIPS, NO_SUBCATEGORY_LABEL, STORE_GROUPS, UNCATEGORIZED_LABEL } from "./constants/app";
import { buildAiCategoryMap } from "./utils/aiCategoryMap";
import { formatCurrency, formatNumber } from "./utils/formatters";
import { guessStoreGroup } from "./utils/storeUtils";
import { buildTimeTotals, getEntryTotal } from "./utils/totals";

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
  const [manualItems, setManualItems] = useState([{ name: "", quantity: 1, price: "", category: "" }]);
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
      }),
    );
  }, [receipt, organization?.name, items, aiCategories]);

  function onCategoryChange(index, value) {
    setCategorizedItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, category: value } : item)));
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
    setManualItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
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

  function handleMainCategoryChange(value) {
    setSelectedMainCategory(value);
    setSelectedSubCategory(CATEGORY_FILTER_ALL);
  }

  function handleSubCategoryChange(value) {
    setSelectedSubCategory(value);
  }

  return (
    <div className="wrap">
      <header className="header">
        <h1>QR bloček → OPD JSON</h1>
        <p>
          Nahraj fotku bločku (QR kód), backend prečíta QR a zavolá OPD endpoint. Výsledok (JSON) sa
          zobrazí nižšie.
        </p>
      </header>

      <UploadCard
        busy={busy}
        file={file}
        previewUrl={previewUrl}
        onPickFile={onPickFile}
        onSend={onSend}
        onCaptureClick={onCaptureClick}
        onCaptureFile={onCaptureFile}
        cameraInputRef={cameraInputRef}
      />

      <ReceiptOutput
        resp={resp}
        receipt={receipt}
        organization={organization}
        unit={unit}
        categorizedItems={categorizedItems}
        totalPrice={totalPrice}
        totalItems={totalItems}
        vatSummary={vatSummary}
        prettyJson={prettyJson}
        diagnosticsJson={diagnosticsJson}
        errorTip={errorTip}
        storeGroup={storeGroup}
        notes={notes}
        storeGroups={STORE_GROUPS}
        historyBusy={historyBusy}
        onCategoryChange={onCategoryChange}
        onApplyAutoCategories={applyAutoCategories}
        onStoreGroupChange={setStoreGroup}
        onNotesChange={setNotes}
        onSaveToHistory={saveToHistory}
        formatCurrency={formatCurrency}
        formatNumber={formatNumber}
      />

      <HistorySection
        history={history}
        historyBusy={historyBusy}
        onClearHistory={clearHistory}
        storeGroups={STORE_GROUPS}
        manualStoreName={manualStoreName}
        manualStoreGroup={manualStoreGroup}
        manualIssueDate={manualIssueDate}
        manualNotes={manualNotes}
        manualItems={manualItems}
        manualCategorySuggestions={manualCategorySuggestions}
        manualItemsTotal={manualItemsTotal}
        onManualStoreNameChange={setManualStoreName}
        onManualStoreGroupChange={setManualStoreGroup}
        onManualIssueDateChange={setManualIssueDate}
        onManualNotesChange={setManualNotes}
        onUpdateManualItem={updateManualItem}
        onAddManualItem={addManualItem}
        onRemoveManualItem={removeManualItem}
        onSaveManualEntry={saveManualEntry}
        selectedMainCategory={selectedMainCategory}
        selectedSubCategory={selectedSubCategory}
        mainCategoryOptions={mainCategoryOptions}
        subCategoryOptions={subCategoryOptions}
        onMainCategoryChange={handleMainCategoryChange}
        onSubCategoryChange={handleSubCategoryChange}
        categorySummaryRows={categorySummaryRows}
        totalsByStore={totalsByStore}
        totalsByDay={totalsByDay}
        totalsByWeek={totalsByWeek}
        totalsByMonth={totalsByMonth}
        formatCurrency={formatCurrency}
      />

      <footer className="footer muted">
        Backend: <code>/api/receipt</code> (upload obrázka → decode QR → OPD <code>receipt/find</code>)
      </footer>
    </div>
  );
}
