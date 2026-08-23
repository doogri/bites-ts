import 'dotenv/config';
import { getInvoiceDataFromUrl, isSupportedInvoiceLink } from './invoicesBot.js';

const url = process.argv[2];
if (!url || !isSupportedInvoiceLink(url)) {
    console.error('Usage: npm run invoice:push -- "<pairzon-or-rami-levy-url>"');
    process.exit(1);
}

const prodApiUrl = process.env['PROD_API_URL'];
const secret = process.env['PROD_WEB_SECRET'];

if (!prodApiUrl) {
    console.error('PROD_API_URL env var is required (e.g. https://your-app.railway.app)');
    process.exit(1);
}
if (!secret) {
    console.error('PROD_WEB_SECRET env var is required (the WEB_SECRET configured on the deployed service — may differ from local WEB_SECRET)');
    process.exit(1);
}

console.log(`Fetching invoice from: ${url}`);
const data = await getInvoiceDataFromUrl(url);
console.log(`Fetched: ${data.storeName} — ${data.items.length} items`);

const response = await fetch(`${prodApiUrl}/api/invoices/import`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secret}`,
    },
    body: JSON.stringify({ ...data, sourceUrl: url }),
});

if (response.status === 409) {
    console.log('Invoice already exists on production — nothing to do.');
    process.exit(0);
}

if (!response.ok) {
    const body = await response.text();
    console.error(`Failed (${response.status}): ${body}`);
    process.exit(1);
}

const saved = await response.json();
console.log(`Saved invoice id=${(saved as { id: string }).id}`);
