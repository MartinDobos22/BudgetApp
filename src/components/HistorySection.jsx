import LineChart from "./LineChart";

export default function HistorySection({
  history,
  historyBusy,
  onClearHistory,
  storeGroups,
  manualStoreName,
  manualStoreGroup,
  manualIssueDate,
  manualNotes,
  manualItems,
  manualCategorySuggestions,
  manualItemsTotal,
  onManualStoreNameChange,
  onManualStoreGroupChange,
  onManualIssueDateChange,
  onManualNotesChange,
  onUpdateManualItem,
  onAddManualItem,
  onRemoveManualItem,
  onSaveManualEntry,
  selectedMainCategory,
  selectedSubCategory,
  mainCategoryOptions,
  subCategoryOptions,
  onMainCategoryChange,
  onSubCategoryChange,
  categorySummaryRows,
  totalsByStore,
  totalsByDay,
  totalsByWeek,
  totalsByMonth,
  formatCurrency,
}) {
  const categoryChartData = categorySummaryRows.map(([label, total]) => ({ label, total }));

  return (
    <section className="card">
      <div className="history-header">
        <h2>História a sumáre</h2>
        <button type="button" onClick={onClearHistory} disabled={history.length === 0 || historyBusy}>
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
              onChange={(event) => onManualStoreNameChange(event.target.value)}
              placeholder="napr. Lidl, Billa"
            />
          </label>
          <label>
            <span className="field-label">Skupina obchodu</span>
            <input
              type="text"
              value={manualStoreGroup}
              onChange={(event) => onManualStoreGroupChange(event.target.value)}
              list="manual-store-groups"
              placeholder="potraviny, drogéria..."
            />
          </label>
          <label>
            <span className="field-label">Dátum</span>
            <input
              type="date"
              value={manualIssueDate}
              onChange={(event) => onManualIssueDateChange(event.target.value)}
            />
          </label>
          <label>
            <span className="field-label">Poznámka</span>
            <input
              type="text"
              value={manualNotes}
              onChange={(event) => onManualNotesChange(event.target.value)}
              placeholder="napr. rýchly nákup"
            />
          </label>
        </div>
        <datalist id="manual-store-groups">
          {storeGroups.map((store) => (
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
                onChange={(event) => onUpdateManualItem(idx, "name", event.target.value)}
                placeholder="položka"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.quantity}
                onChange={(event) => onUpdateManualItem(idx, "quantity", event.target.value)}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.price}
                onChange={(event) => onUpdateManualItem(idx, "price", event.target.value)}
              />
              <input
                type="text"
                list="manual-category-suggestions"
                value={item.category}
                onChange={(event) => onUpdateManualItem(idx, "category", event.target.value)}
                placeholder="kategória"
              />
              <button type="button" onClick={() => onRemoveManualItem(idx)} disabled={manualItems.length === 1}>
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
          <button type="button" onClick={onAddManualItem}>
            Pridať položku
          </button>
          <div className="manual-total">
            Spolu: <strong>{formatCurrency(manualItemsTotal)}</strong>
          </div>
        </div>
        <button type="button" onClick={onSaveManualEntry} disabled={historyBusy || manualItemsTotal === 0}>
          {historyBusy ? "Ukladám..." : "Uložiť ručný záznam"}
        </button>
        <p className="muted">Pridaj aspoň jednu položku s cenou. Záznam sa uloží do histórie rovnako ako bločky.</p>
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
            <h4>Grafy výdavkov</h4>
            <div className="chart-grid">
              <div className="chart-card">
                <p className="muted">Denne</p>
                <LineChart
                  data={totalsByDay}
                  ariaLabel="Graf výdavkov podľa dní"
                  valueFormatter={formatCurrency}
                />
              </div>
              <div className="chart-card">
                <p className="muted">Týždenne</p>
                <LineChart
                  data={totalsByWeek}
                  ariaLabel="Graf výdavkov podľa týždňov"
                  valueFormatter={formatCurrency}
                />
              </div>
              <div className="chart-card">
                <p className="muted">Mesačne</p>
                <LineChart
                  data={totalsByMonth}
                  ariaLabel="Graf výdavkov podľa mesiacov"
                  valueFormatter={formatCurrency}
                />
              </div>
              <div className="chart-card">
                <p className="muted">
                  Kategórie
                  {selectedMainCategory !== "all" && ` · ${selectedMainCategory}`}
                  {selectedSubCategory !== "all" && ` / ${selectedSubCategory}`}
                </p>
                <LineChart
                  data={categoryChartData}
                  ariaLabel="Graf výdavkov podľa kategórií"
                  valueFormatter={formatCurrency}
                />
              </div>
            </div>
          </div>

          <div className="receipt-section">
            <h4>Sumár podľa kategórií</h4>
            <div className="summary-filters">
              <label>
                <span className="field-label">Hlavná kategória</span>
                <select
                  value={selectedMainCategory}
                  onChange={(event) => onMainCategoryChange(event.target.value)}
                >
                  <option value="all">Všetky kategórie</option>
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
                  onChange={(event) => onSubCategoryChange(event.target.value)}
                  disabled={selectedMainCategory === "all"}
                >
                  <option value="all">
                    {selectedMainCategory === "all" ? "Najprv vyber hlavnú kategóriu" : "Všetky podkategórie"}
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
  );
}
