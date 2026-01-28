import { useMemo, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("sk-SK", {
  style: "currency",
  currency: "EUR",
});

const numberFormatter = new Intl.NumberFormat("sk-SK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function App() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState(null); // server response
  const [previewUrl, setPreviewUrl] = useState(null);

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

  function formatCurrency(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return currencyFormatter.format(Number(value));
  }

  function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    return numberFormatter.format(Number(value));
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
              <div className="items-table">
                <div className="items-head">
                  <span>Názov</span>
                  <span>Množstvo</span>
                  <span>DPH %</span>
                  <span>Cena</span>
                </div>
                {items.map((item, idx) => (
                  <div className="items-row" key={`${item?.name}-${idx}`}>
                    <span className="item-name">{item?.name?.trim() || "-"}</span>
                    <span>{formatNumber(item?.quantity)}</span>
                    <span>{item?.vatRate ?? "-"}</span>
                    <span className={item?.price < 0 ? "negative" : ""}>{formatCurrency(item?.price)}</span>
                  </div>
                ))}
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

      <footer className="footer muted">
        Backend: <code>/api/receipt</code> (upload obrázka → decode QR → OPD <code>receipt/find</code>)
      </footer>
    </div>
  );
}
