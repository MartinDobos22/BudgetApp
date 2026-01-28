import { useEffect, useMemo, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("sk-SK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CATEGORY_OPTIONS = [
  "Mliečne výrobky",
  "Sladké pečivo",
  "Slané pečivo",
  "Klasické pečivo",
  "Šunky",
  "Salámy",
  "Mäso",
  "Zelenina",
  "Ovocie",
  "Nápoje",
  "Domáce potreby",
  "Drogéria",
  "Trvanlivé potraviny",
  "Iné",
];

const CATEGORY_RULES = [
  { category: "Mliečne výrobky", keywords: ["mlieko", "jogurt", "tvaroh", "syr", "maslo", "smot", "kef", "brynd", "acid", "taven"] },
  { category: "Sladké pečivo", keywords: ["koláč", "croissant", "donut", "bábov", "buchta", "vianočka", "štrúd", "muffin", "dezert", "sladk"] },
  { category: "Slané pečivo", keywords: ["rožok", "žemľa", "baget", "slan", "pracel", "tyčink", "krek"] },
  { category: "Klasické pečivo", keywords: ["chlieb", "toast", "houska", "pečivo", "knäck", "raž", "pšeni"] },
  { category: "Šunky", keywords: ["šunka", "ham", "prosci"] },
  { category: "Salámy", keywords: ["salám", "salami", "klob", "choriz"] },
  { category: "Mäso", keywords: ["kurac", "bravč", "hoväd", "mleté", "mäso", "steak"] },
  { category: "Zelenina", keywords: ["zemiak", "parad", "uhork", "paprika", "cibu", "mrkv", "salát", "brokol", "karfi", "šampi"] },
  { category: "Ovocie", keywords: ["jablk", "banán", "hrušk", "pomar", "mandar", "hroz", "jahod", "malin", "ovoc"] },
  { category: "Nápoje", keywords: ["voda", "miner", "cola", "džús", "juice", "pivo", "víno", "drink", "čaj", "káva"] },
  { category: "Domáce potreby", keywords: ["papier", "utierk", "vrecia", "hubk", "alobal", "fólia", "vrec", "ruč", "servít"] },
  { category: "Drogéria", keywords: ["šampón", "mydlo", "sprch", "zub", "deterg", "jar", "prací", "aviv", "čisti"] },
  { category: "Trvanlivé potraviny", keywords: ["ryža", "cestov", "olej", "konzerv", "fazul", "šošov", "cukor", "múka", "soľ"] },
];

const STORE_GROUPS = [
  { label: "Lidl", keywords: ["lidl"] },
  { label: "Billa", keywords: ["billa"] },
  { label: "Fresh", keywords: ["fresh"] },
  { label: "Tesco", keywords: ["tesco"] },
  { label: "Kaufland", keywords: ["kaufland"] },
  { label: "Coop Jednota", keywords: ["jednota", "coop"] },
];

const STORAGE_KEY = "budgetapp-receipts-v1";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function guessCategory(name) {
  const text = normalizeText(name);
  if (!text) return "Iné";
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(normalizeText(keyword)))) {
      return rule.category;
    }
  }
  return "Iné";
}

function guessStoreGroup(name) {
  const text = normalizeText(name);
  if (!text) return "";
  const match = STORE_GROUPS.find((store) => store.keywords.some((keyword) => text.includes(normalizeText(keyword))));
  return match?.label || "";
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
  const [aiCategories, setAiCategories] = useState(null);

  const prettyJson = useMemo(() => {
    if (!resp) return "";
    try {
      return JSON.stringify(resp, null, 2);
    } catch {
      return String(resp);
    }
  }, [resp]);

  const receipt = resp?.fsJson?.receipt ?? null;
  const organization = receipt?.organization ?? null;
  const unit = receipt?.unit ?? null;
  const items = receipt?.items ?? [];
  const vatSummary = receipt?.vatSummary ?? [];
  const totalPrice = receipt?.totalPrice ?? null;
  const totalItems = items.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0);

  const totalsByCategory = useMemo(() => {
    const totals = {};
    history.forEach((entry) => {
      entry.items?.forEach((item) => {
        const category = item?.category || "Iné";
        const price = Number(item?.price) || 0;
        totals[category] = (totals[category] || 0) + price;
      });
    });
    return totals;
  }, [history]);

  const totalsByStore = useMemo(() => {
    const totals = {};
    history.forEach((entry) => {
      const store = entry?.storeGroup || entry?.storeName || "Neznámy obchod";
      const price = Number(entry?.totalPrice) || entry.items?.reduce((sum, item) => sum + (Number(item?.price) || 0), 0) || 0;
      totals[store] = (totals[store] || 0) + price;
    });
    return totals;
  }, [history]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (!receipt) {
      setCategorizedItems([]);
      setStoreGroup("");
      setNotes("");
      setAiCategories(null);
      return;
    }
    const suggestedStore = guessStoreGroup(organization?.name);
    setStoreGroup((prev) => prev || suggestedStore);
    const aiMap = new Map((resp?.aiCategories || []).map((entry) => [entry?.name, entry?.category]));
    const nextItems = items.map((item) => {
      const aiCategory = aiMap.get(item?.name);
      return {
        ...item,
        category: aiCategory || guessCategory(item?.name),
      };
    });
    setAiCategories(resp?.aiCategories || null);
    setCategorizedItems(nextItems);
  }, [receipt, organization?.name, items, resp?.aiCategories]);

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
    if (aiCategories?.length) {
      const aiMap = new Map(aiCategories.map((entry) => [entry?.name, entry?.category]));
      setCategorizedItems((prev) =>
        prev.map((item) => ({
          ...item,
          category: aiMap.get(item?.name) || guessCategory(item?.name),
        })),
      );
      return;
    }
    setCategorizedItems((prev) =>
      prev.map((item) => ({
        ...item,
        category: guessCategory(item?.name),
      })),
    );
  }

  function saveToHistory() {
    if (!receipt) return;
    const entryItems = categorizedItems.map((item) => ({
      name: item?.name || "-",
      quantity: Number(item?.quantity) || 0,
      price: Number(item?.price) || 0,
      category: item?.category || "Iné",
    }));
    const entry = {
      id: `${Date.now()}`,
      createdAt: new Date().toISOString(),
      issueDate: receipt?.issueDate || null,
      storeName: organization?.name || "Neznámy obchod",
      storeGroup: storeGroup || guessStoreGroup(organization?.name) || "Iné",
      totalPrice: Number(totalPrice) || entryItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0),
      notes: notes.trim(),
      items: entryItems,
    };
    setHistory((prev) => [entry, ...prev]);
  }

  function clearHistory() {
    setHistory([]);
  }

  function onPickFile(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setResp(null);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function onSend() {
    if (!file) return;
    setBusy(true);
    setResp(null);

    try {
      const fd = new FormData();
      fd.append("image", file);

      const r = await fetch("/api/receipt", {
        method: "POST",
        body: fd,
      });

      const data = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
      if (!r.ok) {
        setResp({ ok: false, ...data });
      } else {
        setResp(data);
      }
    } catch (e) {
      setResp({ ok: false, error: e?.message || String(e) });
    } finally {
      setBusy(false);
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
            {resp.details && <pre className="pre">{JSON.stringify(resp.details, null, 2)}</pre>}
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
                      <select
                        value={item?.category || "Iné"}
                        onChange={(event) => onCategoryChange(idx, event.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((category) => (
                          <option value={category} key={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ))}
                <div className="items-actions">
                  <button type="button" onClick={applyAutoCategories}>
                    Použiť AI kategórie
                  </button>
                  <p className="muted">
                    Kategórie prídu z backendu cez OpenAI. Ak nie sú dostupné, použije sa lokálny odhad.
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
                <button type="button" onClick={saveToHistory}>
                  Uložiť bloček
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
      </section>

      <section className="card">
        <div className="history-header">
          <h2>História a sumáre</h2>
          <button type="button" onClick={clearHistory} disabled={history.length === 0}>
            Vymazať históriu
          </button>
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
              <div className="summary-table">
                {Object.entries(totalsByCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([category, total]) => (
                    <div className="summary-row" key={category}>
                      <span>{category}</span>
                      <span className="summary-amount">{formatCurrency(total)}</span>
                    </div>
                  ))}
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
