export default function ReceiptOutput({
  resp,
  receipt,
  organization,
  unit,
  categorizedItems,
  totalPrice,
  totalItems,
  vatSummary,
  prettyJson,
  diagnosticsJson,
  errorTip,
  storeGroup,
  notes,
  storeGroups,
  historyBusy,
  onCategoryChange,
  onApplyAutoCategories,
  onStoreGroupChange,
  onNotesChange,
  onSaveToHistory,
  formatCurrency,
  formatNumber,
}) {
  return (
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
            <strong>Upozornenie:</strong> OPD odpoveď neobsahuje <code>receipt</code>. Skontroluj QR/OCR
            alebo si pozri surový JSON nižšie.
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
                <button type="button" onClick={onApplyAutoCategories}>
                  AI pretriediť kategórie
                </button>
                <p className="muted">Kategórie sú navrhnuté cez AI z backendu a môžeš ich upraviť ručne.</p>
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
                  onChange={(event) => onStoreGroupChange(event.target.value)}
                  list="store-groups"
                  placeholder="Lidl, Billa, Fresh..."
                />
              </label>
              <label>
                <span className="field-label">Poznámka</span>
                <input
                  type="text"
                  value={notes}
                  onChange={(event) => onNotesChange(event.target.value)}
                  placeholder="napr. veľký nákup na týždeň"
                />
              </label>
              <datalist id="store-groups">
                {storeGroups.map((store) => (
                  <option value={store.label} key={store.label} />
                ))}
              </datalist>
              <button type="button" onClick={onSaveToHistory} disabled={historyBusy}>
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
  );
}
