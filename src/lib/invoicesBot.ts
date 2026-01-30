import TelegramBot, { Message } from "node-telegram-bot-api";
import validator from 'validator';

// Type definitions based on JSON schema
interface KeyValue {
    key: string;
    value: string;
}

interface Item {
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
function isPairzonLink(url: string): boolean {
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

export async function runInvoiceFromUrl(url: string): Promise<string> {
    if (!isPairzonLink(url)) {
        throw new Error('Please provide a valid pairzon.com invoice link');
    }
    return await processInvoiceLink(url);
}

export async function initTelegramBotManager() {
    const botToken = process.env["TELEGRAM_INVOICES_BOT_TOKEN"] || '';
    
    if (!botToken) {
        console.error('TELEGRAM_INVOICES_BOT_TOKEN is not set');
        return;
    }

    const bot = new TelegramBot(botToken, { polling: true });

    bot.onText(/\/start/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId, 'Welcome! Send me a pairzon.com invoice link to extract items.');
    });

    bot.on('error', (error) => {
        console.error('Invoices bot error: ' + error);
    });

    bot.on('message', async (msg: Message) => {
        const chatId = msg.chat.id;
        console.log('Invoices bot message:', JSON.stringify(msg));

        if (msg.from?.is_bot) {
            console.log('Message from bot. Ignoring.');
            return;
        }

        if (!msg.text) {
            await bot.sendMessage(chatId, 'Please send a pairzon.com invoice link.');
            return;
        }

        if (msg.text.startsWith('/')) {
            // Commands are handled separately
            return;
        }

        // Validate URL
        if (!isPairzonLink(msg.text)) {
            await bot.sendMessage(chatId, 'Please send a valid pairzon.com invoice link.');
            return;
        }

        // Process invoice
        try {
            await bot.sendMessage(chatId, 'Processing invoice...');
            const table = await processInvoiceLink(msg.text);
            await bot.sendMessage(chatId, table, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Error processing invoice:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            await bot.sendMessage(chatId, `Error processing invoice: ${errorMessage}`);
        }
    });
}
