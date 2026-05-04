import { useState, useEffect } from 'react';
import { fetchInvoices, addInvoice, updateItemUsage } from './api';
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
  invoice, onUsageChange,
}: {
  invoice: Invoice;
  onUsageChange: (itemId: string, usage: Usage) => void;
}) {
  const d = new Date(invoice.invoiceDate);
  const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  const unclassified = invoice.items.filter(i => i.usage === 'unknown').length;

  return (
    <div className={`invoice-card${invoice.classified ? ' classified' : ''}`}>
      <div className="invoice-header">
        <span className="store-name">{invoice.storeName}</span>
        <span className="invoice-date">{dateStr}</span>
        {unclassified > 0 && (
          <span className="badge">{unclassified} left</span>
        )}
        <span className="invoice-total">₪{Number(invoice.total).toFixed(0)}</span>
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
          {invoice.items.map(item => (
            <tr key={item.id} className={item.usage === 'unknown' ? 'row-unknown' : ''}>
              <td className="cell-name">{item.name}</td>
              <td className="cell-qty">{item.quantity}</td>
              <td className="cell-price">{Number(item.total).toFixed(2)}</td>
              <td>
                <UsageButtons itemId={item.id} current={item.usage} onChange={onUsageChange} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthSection({
  group, onUsageChange,
}: {
  group: MonthGroup;
  onUsageChange: (itemId: string, usage: Usage) => void;
}) {
  const [open, setOpen] = useState(true);
  const unclassified = group.invoices.reduce(
    (n, inv) => n + inv.items.filter(i => i.usage === 'unknown').length,
    0,
  );

  return (
    <section className="month-section">
      <button className="month-header" onClick={() => setOpen(o => !o)}>
        <span className="chevron">{open ? '▼' : '▶'}</span>
        <span className="month-label">{group.month}</span>
        <span className="month-meta">
          {group.invoices.length} invoice{group.invoices.length !== 1 ? 's' : ''}
          {unclassified > 0 && <span className="badge">{unclassified} left</span>}
        </span>
        <span className="month-total">₪{group.total.toFixed(0)}</span>
      </button>
      {open && (
        <div className="month-invoices">
          {group.invoices.map(inv => (
            <InvoiceCard key={inv.id} invoice={inv} onUsageChange={onUsageChange} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!localStorage.getItem('web_secret'));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

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

  if (!authed) return <LoginGate onLogin={() => setAuthed(true)} />;

  const groups = groupByMonth(invoices);

  return (
    <div className="app">
      <header className="top-bar">
        <h1>Invoices</h1>
        <AddInvoiceBar onAdd={handleAdd} />
      </header>
      <main className="main-content">
        {loading && <p className="status-msg">Loading...</p>}
        {!loading && groups.length === 0 && (
          <p className="status-msg">No invoices yet. Paste a URL above to add one.</p>
        )}
        {groups.map(group => (
          <MonthSection key={group.month} group={group} onUsageChange={handleUsageChange} />
        ))}
      </main>
    </div>
  );
}
