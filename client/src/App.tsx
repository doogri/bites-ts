import { useState, useEffect } from 'react';
import { fetchInvoices, addInvoice, updateItemUsage, checkInvoice, deleteInvoice } from './api';
import type { Invoice, MonthGroup, Usage } from './types';

const USAGE_OPTIONS: Usage[] = ['his', 'apartment', 'flatmate', 'friends', 'unknown'];
const USAGE_LABELS: Record<Usage, string> = {
  his: 'His',
  apartment: 'Apt',
  flatmate: 'Flat',
  friends: 'Friends',
  unknown: '?',
};

function groupByMonth(invoices: Invoice[]): MonthGroup[] {
  const map = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const month = inv.invoiceDate.slice(0, 7);
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(inv);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, invs]) => ({
      month,
      invoices: invs,
      total: invs.reduce((s, inv) => s + Number(inv.total), 0),
    }));
}

function LoginGate({ onLogin }: { onLogin: () => void }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    localStorage.setItem('web_secret', pw);
    try {
      await fetchInvoices();
      onLogin();
    } catch {
      localStorage.removeItem('web_secret');
      setError('Wrong password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-gate">
      <form className="login-form" onSubmit={submit}>
        <h2>Invoices</h2>
        <input
          type="password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
        />
        <button type="submit" disabled={loading || !pw}>
          {loading ? 'Checking...' : 'Enter'}
        </button>
        {error && <p className="error-msg">{error}</p>}
      </form>
    </div>
  );
}

function AddInvoiceBar({ onAdd }: { onAdd: (inv: Invoice) => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const inv = await addInvoice(url.trim());
      onAdd(inv);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-bar">
      <form onSubmit={submit}>
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste pairzon invoice URL..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !url.trim()}>
          {loading ? 'Adding...' : 'Add'}
        </button>
      </form>
      {error && <p className="error-msg">{error}</p>}
    </div>
  );
}

function UsageButtons({
  itemId, current, onChange,
}: {
  itemId: string;
  current: string;
  onChange: (id: string, usage: Usage) => void;
}) {
  return (
    <div className="usage-buttons">
      {USAGE_OPTIONS.map(u => (
        <button
          key={u}
          className={`usage-btn usage-${u}${current === u ? ' active' : ''}`}
          onClick={() => onChange(itemId, u)}
          title={u}
        >
          {USAGE_LABELS[u]}
        </button>
      ))}
    </div>
  );
}

function InvoiceCard({
  invoice, onUsageChange, onCheck, onDelete,
}: {
  invoice: Invoice;
  onUsageChange: (itemId: string, usage: Usage) => void;
  onCheck: (invoiceId: string, checked: boolean) => void;
  onDelete: (invoiceId: string) => void;
}) {
  const d = new Date(invoice.invoiceDate);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const hebrewWeekday = new Intl.DateTimeFormat('he-IL', { weekday: 'long' }).format(d);
  const hebrewCalDate = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric', month: 'long' }).format(d);
  const unclassified = invoice.items.filter(i => i.usage === 'unknown').length;

  return (
    <div className={`invoice-card${invoice.classified ? ' classified' : ''}${invoice.checked ? ' checked' : ''}`}>
      <div className="invoice-header">
        <span className="store-name">{invoice.storeName}</span>
        <div className="invoice-date-block">
          <span className="invoice-date">{dateStr}</span>
          <span className="invoice-date-hebrew">{hebrewWeekday} · {hebrewCalDate}</span>
        </div>
        {unclassified > 0 && (
          <span className="badge">{unclassified} left</span>
        )}
        <a
          className="invoice-link"
          href={invoice.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={invoice.sourceUrl}
        >↗</a>
        <span className="invoice-total">₪{Number(invoice.total).toFixed(0)}</span>
        <button
          className={`check-btn${invoice.checked ? ' active' : ''}`}
          onClick={() => onCheck(invoice.id, !invoice.checked)}
          title={invoice.checked ? 'Mark as unchecked' : 'Mark as checked'}
        >✓</button>
        <button
          className="delete-btn"
          onClick={() => {
            if (window.confirm(`Delete ${invoice.storeName}?`)) onDelete(invoice.id);
          }}
          title="Delete invoice"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
      <table className="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>₪</th>
            <th>Usage</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map(item => {
            const discount = Number(item.discount);
            const gross = Number(item.total) - discount;
            return (
              <tr key={item.id} className={item.usage === 'unknown' ? 'row-unknown' : ''}>
                <td className="cell-name">{item.name}</td>
                <td className="cell-qty">{item.quantity}</td>
                <td className="cell-price">
                  {discount < 0 ? (
                    <>
                      <span className="price-gross">₪{gross.toFixed(2)}</span>
                      <span className="price-discount">{discount.toFixed(2)}</span>
                    </>
                  ) : `₪${Number(item.total).toFixed(2)}`}
                </td>
                <td>
                  <UsageButtons itemId={item.id} current={item.usage} onChange={onUsageChange} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthSection({
  group, onUsageChange, onCheck, onDelete,
}: {
  group: MonthGroup;
  onUsageChange: (itemId: string, usage: Usage) => void;
  onCheck: (invoiceId: string, checked: boolean) => void;
  onDelete: (invoiceId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const unclassified = group.invoices.reduce(
    (n, inv) => n + inv.items.filter(i => i.usage === 'unknown').length,
    0,
  );
  const checkedCount = group.invoices.filter(inv => inv.checked).length;

  return (
    <section className="month-section">
      <button className="month-header" onClick={() => setOpen(o => !o)}>
        <span className="chevron">{open ? '▼' : '▶'}</span>
        <span className="month-label">{group.month}</span>
        <span className="month-meta">
          {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
          {unclassified > 0 && <span className="badge">{unclassified} left</span>}
          {checkedCount > 0 && <span className="badge badge-checked">✓ {checkedCount}</span>}
        </span>
        <span className="month-total">₪{group.total.toFixed(0)}</span>
      </button>
      {open && (
        <div className="month-invoices">
          {group.invoices.map(inv => (
            <InvoiceCard key={inv.id} invoice={inv} onUsageChange={onUsageChange} onCheck={onCheck} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryPanel({ invoices, excludedCount }: { invoices: Invoice[]; excludedCount: number }) {
  const months = Array.from(
    new Set(invoices.map(inv => inv.invoiceDate.slice(0, 7)))
  ).sort((a, b) => b.localeCompare(a));

  const data: Record<string, Record<string, number>> = {};
  for (const inv of invoices) {
    const month = inv.invoiceDate.slice(0, 7);
    if (!data[month]) data[month] = {};
    for (const item of inv.items) {
      data[month][item.usage] = (data[month][item.usage] ?? 0) + Number(item.total);
    }
  }

  const colTotals: Record<string, number> = {};
  for (const usage of USAGE_OPTIONS) {
    colTotals[usage] = months.reduce((s, m) => s + (data[m]?.[usage] ?? 0), 0);
  }
  const grandTotal = USAGE_OPTIONS.reduce((s, u) => s + colTotals[u], 0);

  return (
    <div className="summary-panel">
      {excludedCount > 0 && (
        <p className="summary-note">Excluding {excludedCount} checked invoice{excludedCount !== 1 ? 's' : ''}</p>
      )}
      <table className="summary-table">
        <thead>
          <tr>
            <th>Month</th>
            {USAGE_OPTIONS.map(u => <th key={u} className={`col-${u}`}>{USAGE_LABELS[u]}</th>)}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {months.map(month => {
            const rowTotal = USAGE_OPTIONS.reduce((s, u) => s + (data[month]?.[u] ?? 0), 0);
            return (
              <tr key={month}>
                <td className="summary-month">{month}</td>
                {USAGE_OPTIONS.map(u => (
                  <td key={u} className={`summary-val col-${u}`}>
                    {data[month]?.[u] ? `₪${data[month][u].toFixed(0)}` : '—'}
                  </td>
                ))}
                <td className="summary-row-total">₪{rowTotal.toFixed(0)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="summary-month">Total</td>
            {USAGE_OPTIONS.map(u => (
              <td key={u} className={`summary-val col-${u}`}>₪{colTotals[u].toFixed(0)}</td>
            ))}
            <td className="summary-row-total">₪{grandTotal.toFixed(0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('web_secret'));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    fetchInvoices()
      .then(setInvoices)
      .catch(() => {
        localStorage.removeItem('web_secret');
        setAuthed(false);
      })
      .finally(() => setLoading(false));
  }, [authed]);

  const handleUsageChange = async (itemId: string, usage: Usage) => {
    setInvoices(prev =>
      prev.map(inv => {
        const hasItem = inv.items.some(i => i.id === itemId);
        if (!hasItem) return inv;
        const updatedItems = inv.items.map(i => i.id === itemId ? { ...i, usage } : i);
        const classified = updatedItems.every(i => i.usage !== 'unknown');
        return { ...inv, items: updatedItems, classified };
      }),
    );
    await updateItemUsage(itemId, usage);
  };

  const handleAdd = (inv: Invoice) => {
    setInvoices(prev => [inv, ...prev]);
  };

  const handleDeleteInvoice = async (invoiceId: string) => {
    setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
    await deleteInvoice(invoiceId);
  };

  const handleCheckInvoice = async (invoiceId: string, checked: boolean) => {
    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, checked } : inv));
    await checkInvoice(invoiceId, checked);
  };

  if (!authed) return <LoginGate onLogin={() => setAuthed(true)} />;

  const groups = groupByMonth(invoices);
  const uncheckedInvoices = invoices.filter(inv => !inv.checked);
  const checkedCount = invoices.length - uncheckedInvoices.length;

  return (
    <div className="app">
      <header className="top-bar">
        <h1>Invoices</h1>
        <AddInvoiceBar onAdd={handleAdd} />
        <button
          className={`summary-toggle${showSummary ? ' active' : ''}`}
          onClick={() => setShowSummary(s => !s)}
          disabled={invoices.length === 0}
        >
          Summary
        </button>
      </header>
      {showSummary && <SummaryPanel invoices={uncheckedInvoices} excludedCount={checkedCount} />}
      <main className="main-content">
        {loading && <p className="status-msg">Loading...</p>}
        {!loading && groups.length === 0 && (
          <p className="status-msg">No invoices yet. Paste a URL above to add one.</p>
        )}
        {groups.map(group => (
          <MonthSection key={group.month} group={group} onUsageChange={handleUsageChange} onCheck={handleCheckInvoice} onDelete={handleDeleteInvoice} />
        ))}
      </main>
    </div>
  );
}
