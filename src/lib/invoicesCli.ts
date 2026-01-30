// Usage:
//   npm run invoice:cli -- "https://osher.pairzon.com/1247/..."

import { runInvoiceFromUrl } from './invoicesBot.js';

async function main() {
    const [, , url] = process.argv;

    if (!url) {
        console.error('Usage: npm run invoice:cli -- "<pairzon invoice url>"');
        process.exitCode = 1;
        return;
    }

    console.log(`Processing invoice link: ${url}`);

    try {
        const table = await runInvoiceFromUrl(url);
        console.log(table);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error processing invoice:', message);
        process.exitCode = 1;
    }
}

void main();

