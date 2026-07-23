export type Usage = 'his' | 'apartment' | 'flatmate' | 'friends' | 'unknown';

export interface InvoiceItem {
  id: string;
  name: string;
  price: number;
  total: number;
  discount: number;
  quantity: number;
  usage: Usage;
  invoiceId: string;
}

export interface Invoice {
  id: string;
  externalId: string;
  storeName: string;
  invoiceDate: string;
  total: number;
  sourceUrl: string;
  classified: boolean;
  checked: boolean;
  items: InvoiceItem[];
}

export interface MonthGroup {
  month: string;
  invoices: Invoice[];
  total: number;
}
