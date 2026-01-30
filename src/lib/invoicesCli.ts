// Usage:
//   npm run invoice:cli -- "https://osher.pairzon.com/1247/..."

import { getInvoiceDataFromUrl, Item } from './invoicesBot.js';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';

type Usage = 'his' | 'apartment' | 'flatmate' | 'friends';

const choices: { label: string; value: Usage }[] = [
    { label: 'For his only', value: 'his' },
    { label: 'For the apartment', value: 'apartment' },
    { label: 'For the flatmate', value: 'flatmate' },
    { label: 'For friends', value: 'friends' },
];

interface ItemWithUsage {
    item: Item;
    usage: Usage;
}

/**
 * Escape CSV value by wrapping in quotes and escaping internal quotes
 */
function escapeCsv(value: string | number): string {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Clear the current line and move cursor to beginning
 */
function clearLine(): void {
    process.stdout.write('\r\x1b[K');
}

/**
 * Ask user to select usage for an item using arrow keys and Enter
 */
function askUsageForItem(itemName: string, itemIndex: number, totalItems: number): Promise<Usage> {
    return new Promise((resolve, reject) => {
        let selectedIndex = 0;
        
        // Create readline interface to enable keypress events
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        // Emit keypress events on stdin (required for keypress events to work)
        readline.emitKeypressEvents(process.stdin);

        // Set raw mode to capture individual keypresses
        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        if (!stdin.isRaw) {
            stdin.setRawMode(true);
        }
        stdin.resume();

        const renderMenu = () => {
            // Clear screen and move to top
            process.stdout.write('\x1b[2J\x1b[H');
            process.stdout.write(`[${itemIndex + 1}/${totalItems}] ${itemName}\n`);
            choices.forEach((choice, index) => {
                const marker = index === selectedIndex ? '→' : ' ';
                process.stdout.write(`${marker} ${choice.label}\n`);
            });
            process.stdout.write('\nUse ↑↓ arrows to select, Enter to confirm\n');
        };

        renderMenu();

        const cleanup = () => {
            stdin.removeListener('keypress', onKeypress);
            if (stdin.isRaw && !wasRaw) {
                stdin.setRawMode(false);
            }
            stdin.pause();
            rl.close();
        };

        const onKeypress = (str: string, key: { name: string; ctrl: boolean }) => {
            if (key.ctrl && key.name === 'c') {
                cleanup();
                process.exit(1);
            }

            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
                renderMenu();
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % choices.length;
                renderMenu();
            } else if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                process.stdout.write(`\nSelected: ${choices[selectedIndex].label}\n`);
                resolve(choices[selectedIndex].value);
            }
        };

        // Attach keypress listener to stdin
        stdin.on('keypress', onKeypress);
    });
}

/**
 * Generate filename from invoice createdDate
 */
function generateFileName(createdDate: string): string {
    const date = new Date(createdDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `invoice_${year}-${month}-${day}_${hours}${minutes}.csv`;
}

async function main() {
    const [, , url] = process.argv;

    if (!url) {
        console.error('Usage: npm run invoice:cli -- "<pairzon invoice url>"');
        process.exitCode = 1;
        return;
    }

    console.log(`Processing invoice link: ${url}`);

    try {
        // Get invoice data
        const invoiceData = await getInvoiceDataFromUrl(url);
        console.log(`Found ${invoiceData.items.length} items in invoice from ${invoiceData.storeName}`);

        // Classify each item
        const results: ItemWithUsage[] = [];
        for (let i = 0; i < invoiceData.items.length; i++) {
            const item = invoiceData.items[i];
            const usage = await askUsageForItem(item.name, i, invoiceData.items.length);
            results.push({ item, usage });
        }

        // Generate CSV content
        const header = 'name,quantity,price,total,usage\n';
        const rows = results.map(({ item, usage }) => {
            const name = escapeCsv(item.name);
            const quantity = item.quantity ?? 1;
            const price = item.price ?? 0;
            const total = item.total ?? 0;
            return `${name},${quantity},${price},${total},${usage}`;
        });
        const csvContent = header + rows.join('\n');

        // Create invoices directory if it doesn't exist
        const invoicesDir = './invoices';
        try {
            await fs.access(invoicesDir);
        } catch {
            await fs.mkdir(invoicesDir, { recursive: true });
        }

        // Write CSV file
        const fileName = generateFileName(invoiceData.createdDate);
        const filePath = `${invoicesDir}/${fileName}`;
        await fs.writeFile(filePath, csvContent, 'utf8');

        console.log(`\nSaved invoice classification to ${filePath}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error processing invoice:', message);
        process.exitCode = 1;
    }
}

void main();
