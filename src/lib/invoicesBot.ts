import validator from 'validator';

// Type definitions based on JSON schema
interface KeyValue {
    key: string;
    value: string;
}

export interface Item {
    id: string;
    code: string;
    name: string;
    price: number;
    total: number;
    quantity?: number;
    index?: number;
    info?: string;
    weight?: number;
    category?: string[];
    additionalInfo?: KeyValue[];
}

export interface InvoiceItemWithMeta {
    id: string;
    createdDate: string;
    storeName: string;
    items: Item[];
}

interface Payment {
    id: string;
    name: string;
    amount: number;
    info?: string;
}

interface StoreBusiness {
    id: string;
    name: string;
    currency: string;
    englishName?: string;
    companyLeagalId?: string;
    language?: string;
    isActive?: boolean;
    address?: string;
}

interface Store {
    id: string;
    name: string;
    address: string;
    business: StoreBusiness;
    phone?: string;
    currency?: string;
    language?: string;
    geometry?: string;
}

interface InvoiceData {
    id: string;
    action: string;
    documentType: string;
    createdDate: string;
    items: Item[];
    payments: Payment[];
    store: Store;
    total: number;
    totalNoVat: number;
    totalVat: number;
    Vat?: number;
    barcode?: string;
    burn?: boolean;
    businessID?: string;
    cashierID?: string;
    cashierName?: string;
    document_url?: string;
    eCommerce?: boolean;
    hasdedIdentifier?: string;
    isLoyal?: boolean;
    notes?: string;
    numberOfItems?: number;
    open?: boolean;
    posID?: string;
    posInternalID?: string;
    storeID?: string;
    storeInternalID?: string;
    transactionID?: string;
    uploadedDate?: string;
    additionalInfo?: KeyValue[];
    discounts?: unknown[];
}

/**
 * Make HEAD request to get headers (equivalent to curl -I)
 */
async function getInvoiceHeaders(url: string): Promise<Headers> {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            redirect: 'manual' // Don't follow redirects automatically
        });

        if (!response.ok && response.status !== 302) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log(`Response headers: ${JSON.stringify(response.headers)}`);
        return response.headers;
    } catch (error) {
        console.error('Error fetching headers:', error);
        throw new Error(`Failed to fetch headers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extract UUID from Location header filename
 * Example: https://osher.pairzon.com/dba51f17-81ac-41f8-b76d-64e62fb13df4.html?id=e2b28913-6671-471b-8889-8989f7fa5c08&p=1247
 * Returns: e2b28913-6671-471b-8889-8989f7fa5c08
 */
function extractUuidFromLocation(location: string): string {
    try {
        const url = new URL(location);
        const uuid = url.searchParams.get('id');

        if (!uuid) {
            throw new Error('Query parameter "id" not found in URL');
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        
        // Note: Using a slightly more flexible regex if the source isn't strictly v4
        const simpleUuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (!simpleUuidRegex.test(uuid)) {
            throw new Error(`Invalid UUID format: ${uuid}`);
        }

        return uuid;
    } catch (error) {
        console.error('Error extracting UUID:', error);
        throw new Error(`Failed to extract UUID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Extract p parameter from Location header query string
 * Example: ...?id=...&p=1247
 * Returns: 1247
 */
function extractPParameter(location: string): string {
    try {
        const url = new URL(location);
        const p = url.searchParams.get('p');
        if (!p) {
            throw new Error('p parameter not found in Location header');
        }
        return p;
    } catch (error) {
        console.error('Error extracting p parameter:', error);
        throw new Error(`Failed to extract p parameter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Fetch invoice data from API
 */
async function fetchInvoiceData(uuid: string, p: string): Promise<InvoiceData> {
    try {
        const apiUrl = `https://osher.pairzon.com/v1.0/documents/${uuid}?p=${p}`;
        console.log(`Fetching invoice data from: ${apiUrl}`);
        
        const response = await fetch(apiUrl, {
            method: 'GET',
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json() as InvoiceData;
        
        // Validate required fields
        if (!data.items || !Array.isArray(data.items)) {
            throw new Error('Invalid invoice data: items array is missing or invalid');
        }

        return data;
    } catch (error) {
        console.error('Error fetching invoice data:', error);
        throw new Error(`Failed to fetch invoice data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Format items as markdown table
 */
function formatItemsAsTable(items: Item[]): string {
    if (items.length === 0) {
        return 'No items found in invoice.';
    }

    // Build table header
    let table = '| Name | Quantity | Price | Total |\n';
    table += '|------|----------|-------|-------|\n';

    // Add rows
    for (const item of items) {
        const name = (item.name || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
        const quantity = (item.quantity ?? 1).toString();
        const price = (item.price ?? 0).toFixed(2);
        const total = (item.total ?? 0).toFixed(2);
        
        table += `| ${name} | ${quantity} | ${price} | ${total} |\n`;
    }

    return table;
}

/**
 * Process invoice link through all steps
 */
async function processInvoiceLink(url: string): Promise<string> {
    try {
        console.log(`Processing invoice link: ${url}`);
        // Step 1: Get headers
        const headers = await getInvoiceHeaders(url);
        const location = headers.get('location');
        
        if (!location) {
            throw new Error('Location header not found in response');
        }

        console.log(`Location header: ${location}`);

        // Step 2: Extract UUID
        const uuid = extractUuidFromLocation(location);
        console.log(`Extracted UUID: ${uuid}`);

        // Step 3: Extract p parameter
        const p = extractPParameter(location);
        console.log(`Extracted p parameter: ${p}`);

        // Step 4: Fetch invoice data
        const invoiceData = await fetchInvoiceData(uuid, p);
        console.log(`Fetched invoice with ${invoiceData.items.length} items`);

        // Step 5 & 6: Format and return table
        const table = formatItemsAsTable(invoiceData.items);
        return table;
    } catch (error) {
        console.error('Error processing invoice:', error);
        throw error;
    }
}

/**
 * Validate if URL is a pairzon.com link
 */
export function isPairzonLink(url: string): boolean {
    try {
        if (!validator.isURL(url, {
            protocols: ['http', 'https'],
            require_protocol: true,
            require_valid_protocol: true,
            allow_underscores: false,
            allow_trailing_dot: false,
            allow_protocol_relative_urls: false
        })) {
            return false;
        }

        const urlObj = new URL(url);
        return urlObj.hostname.includes('pairzon.com');
    } catch {
        return false;
    }
}

export function isRamiLevyLink(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.includes('rami-levy.co.il') || urlObj.hostname.includes('digi.rami-levy');
    } catch {
        return false;
    }
}

export function isSupportedInvoiceLink(url: string): boolean {
    return isPairzonLink(url) || isRamiLevyLink(url);
}

// Nuxt SSR payload resolver: flat index-reference array → plain object
function resolveNuxtPayload(arr: unknown[], i: number): unknown {
    const item = arr[i];
    if (Array.isArray(item)) {
        if (item[0] === 'ShallowReactive' || item[0] === 'Reactive') return resolveNuxtPayload(arr, item[1] as number);
        if (item[0] === 'Set') return [];
        return item.map((j: unknown) => resolveNuxtPayload(arr, j as number));
    }
    if (item !== null && typeof item === 'object') {
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(item as Record<string, number>)) {
            result[k] = resolveNuxtPayload(arr, v);
        }
        return result;
    }
    return item;
}

async function getRamiLevyInvoiceData(url: string): Promise<InvoiceItemWithMeta> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch Rami Levy invoice: ${response.status}`);

    const html = await response.text();
    const match = html.match(/<script[^>]+id="__NUXT_DATA__"[^>]*>(\[[\s\S]*?\])<\/script>/);
    if (!match) throw new Error('Could not find invoice data in page');

    const payload = JSON.parse(match[1]) as unknown[];
    const root = resolveNuxtPayload(payload, 0) as Record<string, unknown>;
    const dataMap = (root['data'] as Record<string, unknown>);
    const doc = Object.values(dataMap)[0] as Record<string, unknown>;

    const branch = doc['branch'] as Record<string, unknown> | null;
    const storeName = branch ? `רמי לוי ${branch['name'] as string}` : 'רמי לוי';
    const createdAt = doc['created_at'] as string;
    const id = doc['id'] as string;
    const payments = doc['payments'] as Record<string, unknown>;

    const rawItems = doc['items'] as Record<string, unknown>[];
    const items: Item[] = rawItems.map((item, index) => ({
        id: String(item['code'] ?? index),
        code: String(item['code'] ?? ''),
        name: String(item['name'] ?? ''),
        price: Number(item['price'] ?? 0),
        total: Number(item['total'] ?? 0),
        quantity: Number(item['quantity'] ?? 1) || 1,
    }));

    return {
        id,
        createdDate: createdAt,
        storeName,
        items,
    };
}

export async function runInvoiceFromUrl(url: string): Promise<string> {
    if (!isPairzonLink(url)) {
        throw new Error('Please provide a valid pairzon.com invoice link');
    }
    return await processInvoiceLink(url);
}

export async function getInvoiceDataFromUrl(url: string): Promise<InvoiceItemWithMeta> {
    if (isRamiLevyLink(url)) {
        return getRamiLevyInvoiceData(url);
    }

    if (!isPairzonLink(url)) {
        throw new Error('Please provide a valid pairzon.com or rami-levy.co.il invoice link');
    }

    const headers = await getInvoiceHeaders(url);
    const location = headers.get('location');

    if (!location) {
        throw new Error('Location header not found in response');
    }

    const uuid = extractUuidFromLocation(location);
    const p = extractPParameter(location);
    const invoice = await fetchInvoiceData(uuid, p);

    return {
        id: invoice.id,
        createdDate: invoice.createdDate,
        storeName: invoice.store?.name ?? '',
        items: invoice.items,
    };
}

