import type { Invoice, Usage } from './types';

function getToken() {
  return localStorage.getItem('web_secret') ?? '';
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error('Unauthorized');
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchInvoices(): Promise<Invoice[]> {
  return apiFetch<Invoice[]>('/api/invoices');
}

export async function addInvoice(url: string): Promise<Invoice> {
  return apiFetch<Invoice>('/api/invoices', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function updateItemUsage(itemId: string, usage: Usage): Promise<void> {
  await apiFetch(`/api/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ usage }),
  });
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  await apiFetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' });
}

export async function checkInvoice(invoiceId: string, checked: boolean): Promise<void> {
  await apiFetch(`/api/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ checked }),
  });
}
