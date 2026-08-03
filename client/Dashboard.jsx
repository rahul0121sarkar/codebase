// Dashboard.jsx - payments dashboard header
// summary cards + mode toggle + filters. React port of dashboard.js.
import React, { useState, useEffect } from 'react';

const BASE_URL = '/';

function formatMoney(n) {
  n = parseFloat(n || 0);
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const [mode, setMode] = useState('gross'); // 'gross' | 'actual'
  const [filters, setFilters] = useState({ from: '', to: '', trainer_id: '' });
  const [cards, setCards] = useState({ headline: 0, gross: 0, actual: 0, retained: 0, count: 0 });

  function loadSummary() {
    const params = new URLSearchParams({
      from: filters.from,
      to: filters.to,
      trainer_id: filters.trainer_id,
      mode: mode,
    });

    fetch(BASE_URL + 'payments/summary?' + params.toString())
      .then(function (r) { return r.json(); })
      .then(function (res) {
        setCards({
          headline: res.headline,
          gross: res.gross,
          actual: res.actual,
          retained: res.retained,
          count: res.count,
        });
      })
      .catch(function () {});
  }

  useEffect(function () {
    loadSummary();

    // keep the numbers fresh
    const t = setInterval(function () {
      loadSummary();
    }, 60000);

    return function () { clearInterval(t); };
  }, [mode, filters]);

  function onToggle(e) {
    setMode(e.target.checked ? 'actual' : 'gross');
  }

  function onFilter(field, value) {
    setFilters(function (f) {
      const next = Object.assign({}, f);
      next[field] = value;
      return next;
    });
  }

  return (
    <div className="dashboard-header">
      <div className="filters">
        <input id="f_from" type="date" className="filter"
          value={filters.from} onChange={function (e) { onFilter('from', e.target.value); }} />
        <input id="f_to" type="date" className="filter"
          value={filters.to} onChange={function (e) { onFilter('to', e.target.value); }} />
        <input id="f_trainer" type="text" placeholder="Instructor" className="filter"
          value={filters.trainer_id} onChange={function (e) { onFilter('trainer_id', e.target.value); }} />

        <label className="mode">
          <input id="mode_toggle" type="checkbox"
            checked={mode === 'actual'} onChange={onToggle} />
          Actual incoming
        </label>
      </div>

      <div className="cards">
        <div className="card headline">
          <span className="label">Headline</span>
          <span id="card_headline" className="value">{formatMoney(cards.headline)}</span>
        </div>
        <div className="card">
          <span className="label">Gross</span>
          <span id="card_gross" className="value">{formatMoney(cards.gross)}</span>
        </div>
        <div className="card">
          <span className="label">Actual</span>
          <span id="card_actual" className="value">{formatMoney(cards.actual)}</span>
        </div>
        <div className="card">
          <span className="label">Retained after refund</span>
          <span id="card_retained" className="value">{formatMoney(cards.retained)}</span>
        </div>
        <div className="card">
          <span className="label">Count</span>
          <span id="card_count" className="value">{cards.count}</span>
        </div>
      </div>
    </div>
  );
}
