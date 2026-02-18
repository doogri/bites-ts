// Usage:
//   npm run invoice:cli -- "https://osher.pairzon.com/1247/..."

import { getInvoiceDataFromUrl, Item, InvoiceItemWithMeta } from './invoicesBot.js';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import * as path from 'node:path';

export type Usage = 'his' | 'apartment' | 'flatmate' | 'friends' | 'unknown';

const choices: { label: string; value: Usage }[] = [
    { label: 'For his only', value: 'his' },
    { label: 'For the apartment', value: 'apartment' },
    { label: 'For the flatmate', value: 'flatmate' },
    { label: 'For friends', value: 'friends' },
    { label: 'Not known yet', value: 'unknown' },
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

/** Hebrew Unicode block (U+0590 to U+05FF) */
const HEBREW_REGEX = /[\u0590-\u05FF]/;

/**
 * Reverse the character order of Hebrew words so they display correctly in LTR terminals.
 * Non-Hebrew runs (English, numbers, punctuation) are left unchanged.
 */
function reverseHebrewText(text: string): string {
    if (!text || !text.trim()) return text;
    const result: string[] = [];
    let i = 0;
    while (i < text.length) {
        const isHebrew = HEBREW_REGEX.test(text[i]);
        let run = '';
        if (isHebrew) {
            while (i < text.length && HEBREW_REGEX.test(text[i])) {
                run += text[i];
                i++;
            }
            result.push([...run].reverse().join(''));
        } else {
            while (i < text.length && !HEBREW_REGEX.test(text[i])) {
                run += text[i];
                i++;
            }
            result.push(run);
        }
    }
    return result.join('');
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
            process.stdout.write(`[${itemIndex + 1}/${totalItems}] ${reverseHebrewText(itemName)}\n`);
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
 * Get the base directory for invoices in Windows Downloads (WSL2 path)
 */
export function getDownloadsInvoicesBaseDir(): string {
    return '/mnt/c/Users/Yehez/Downloads/invoices';
}

/**
 * Get the month folder path (YYYY-MM) for a given invoice date
 */
export function getMonthFolder(createdDate: string): string {
    const date = new Date(createdDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const yyyyMm = `${year}-${month}`;
    return path.join(getDownloadsInvoicesBaseDir(), yyyyMm);
}

/**
 * Generate filename from invoice createdDate and UUID
 */
function generateFileName(createdDate: string, uuid: string): string {
    const date = new Date(createdDate);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `invoice_${year}-${month}-${day}_${hours}${minutes}_${uuid}.csv`;
}

/**
 * Get the full file path for an invoice CSV
 */
function getInvoiceFilePath(createdDate: string, uuid: string): string {
    const monthFolder = getMonthFolder(createdDate);
    const fileName = generateFileName(createdDate, uuid);
    return path.join(monthFolder, fileName);
}

/**
 * Calculate days ago from a date string
 */
function calculateDaysAgo(createdDate: string): number {
    const date = new Date(createdDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Find CSV file by UUID in invoices directory structure
 * Searches in Downloads/month folders first, then falls back to legacy ./invoices folder
 * 
 * Migration note: Existing CSVs in ./invoices can be moved to the Downloads structure
 * by creating YYYY-MM folders based on the invoice date in the filename.
 */
async function findCsvFileByUuid(uuid: string): Promise<string | null> {
    // First, search in the new Downloads/month structure
    try {
        const baseDir = getDownloadsInvoicesBaseDir();
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Check if it's a YYYY-MM folder
                const folderName = entry.name;
                if (/^\d{4}-\d{2}$/.test(folderName)) {
                    const monthDir = path.join(baseDir, folderName);
                    try {
                        const files = await fs.readdir(monthDir);
                        for (const file of files) {
                            if (file.endsWith(`_${uuid}.csv`)) {
                                return path.join(monthDir, file);
                            }
                        }
                    } catch {
                        // Skip this folder if we can't read it
                        continue;
                    }
                }
            }
        }
    } catch {
        // Base directory doesn't exist yet, continue to fallback
    }
    
    // Fallback: search in legacy ./invoices folder
    try {
        const legacyDir = './invoices';
        const files = await fs.readdir(legacyDir);
        for (const file of files) {
            if (file.endsWith(`_${uuid}.csv`)) {
                return path.join(legacyDir, file);
            }
        }
    } catch {
        // Legacy folder doesn't exist
    }
    
    return null;
}

/**
 * Parse CSV value (handles quoted values)
 */
function parseCsvValue(value: string): string {
    if (value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1).replace(/""/g, '"');
    }
    return value;
}

/**
 * Parse a CSV line into parts, handling quoted values
 */
function parseCsvLine(line: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
            if (inQuotes && line[j + 1] === '"') {
                current += '"';
                j++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            parts.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    parts.push(current);
    return parts;
}

/**
 * Interface for parsed invoice row
 */
export interface InvoiceRow {
    name: string;
    quantity: number;
    price: number;
    total: number;
    usage: Usage;
}

/**
 * Parse CSV file and return array of invoice rows
 */
export async function parseInvoiceCsv(filePath: string): Promise<InvoiceRow[]> {
    const result: InvoiceRow[] = [];
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n');
        
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const parts = parseCsvLine(line);
            
            if (parts.length >= 5) {
                const name = parseCsvValue(parts[0]);
                const quantity = parseFloat(parts[1]) || 1;
                const price = parseFloat(parts[2]) || 0;
                const total = parseFloat(parts[3]) || 0;
                const usage = parseCsvValue(parts[4]) as Usage;
                
                if (name) {
                    result.push({ name, quantity, price, total, usage });
                }
            }
        }
    } catch (error) {
        // File doesn't exist or can't be read
        console.error('Error parsing CSV:', error);
    }
    return result;
}

/**
 * Read existing CSV file and return Map of item name -> usage
 */
async function readExistingCsv(filePath: string): Promise<Map<string, Usage>> {
    const result = new Map<string, Usage>();
    const rows = await parseInvoiceCsv(filePath);
    for (const row of rows) {
        result.set(row.name, row.usage);
    }
    return result;
}

/**
 * Save CSV file with current results
 */
async function saveCsvFile(filePath: string, results: ItemWithUsage[], invoiceData: InvoiceItemWithMeta): Promise<void> {
    const header = 'name,quantity,price,total,usage\n';
    const rows = results.map(({ item, usage }) => {
        const name = escapeCsv(item.name);
        const quantity = item.quantity ?? 1;
        const price = item.price ?? 0;
        const total = item.total ?? 0;
        return `${name},${quantity},${price},${total},${usage}`;
    });
    const csvContent = header + rows.join('\n');
    
    // Ensure invoices directory exists
    const invoicesDir = path.dirname(filePath);
    try {
        await fs.access(invoicesDir);
    } catch {
        await fs.mkdir(invoicesDir, { recursive: true });
    }
    
    await fs.writeFile(filePath, csvContent, 'utf8');
}

/**
 * Ask user for resume option
 */
function askResumeOption(): Promise<'all' | 'continue' | 'unknown'> {
    return new Promise((resolve) => {
        let selectedIndex = 0;
        const resumeChoices: { label: string; value: 'all' | 'continue' | 'unknown' }[] = [
            { label: 'All items', value: 'all' },
            { label: 'Continue from where stopped', value: 'continue' },
            { label: 'Only unknown items', value: 'unknown' },
        ];
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        readline.emitKeypressEvents(process.stdin);

        const stdin = process.stdin;
        const wasRaw = stdin.isRaw;
        if (!stdin.isRaw) {
            stdin.setRawMode(true);
        }
        stdin.resume();

        const renderMenu = () => {
            process.stdout.write('\x1b[2J\x1b[H');
            process.stdout.write('How would you like to proceed?\n');
            resumeChoices.forEach((choice, index) => {
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
                selectedIndex = (selectedIndex - 1 + resumeChoices.length) % resumeChoices.length;
                renderMenu();
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % resumeChoices.length;
                renderMenu();
            } else if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                process.stdout.write(`\nSelected: ${resumeChoices[selectedIndex].label}\n`);
                resolve(resumeChoices[selectedIndex].value);
            }
        };

        stdin.on('keypress', onKeypress);
    });
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
        console.log(`Found ${invoiceData.items.length} items in invoice from ${reverseHebrewText(invoiceData.storeName)}`);

        // Use new Downloads/month folder structure
        const filePath = getInvoiceFilePath(invoiceData.createdDate, invoiceData.id);

        // Check if CSV file already exists
        const existingCsvPath = await findCsvFileByUuid(invoiceData.id);
        let existingUsages = new Map<string, Usage>();
        let resumeOption: 'all' | 'continue' | 'unknown' = 'all';

        if (existingCsvPath) {
            existingUsages = await readExistingCsv(existingCsvPath);
            
            // Calculate statistics
            const daysAgo = calculateDaysAgo(invoiceData.createdDate);
            const classifiedCount = Array.from(existingUsages.values()).filter(u => u !== 'unknown').length;
            const unknownCount = Array.from(existingUsages.values()).filter(u => u === 'unknown').length;
            
            console.log(`\nFound existing classification file.`);
            console.log(`Purchase was ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago.`);
            console.log(`Already classified: ${classifiedCount} items`);
            console.log(`Unknown items: ${unknownCount} items`);
            console.log(`Total items: ${invoiceData.items.length}`);
            
            resumeOption = await askResumeOption();
        }

        // Initialize results array with all items
        const results: ItemWithUsage[] = [];
        
        // Populate results with existing data if resuming (except for 'all' option)
        if (existingCsvPath && resumeOption !== 'all') {
            for (const item of invoiceData.items) {
                const existingUsage = existingUsages.get(item.name);
                if (existingUsage) {
                    results.push({ item, usage: existingUsage });
                } else {
                    // Item not in existing CSV, will be classified
                    results.push({ item, usage: 'unknown' });
                }
            }
        } else {
            // Start fresh - initialize all items as unknown
            for (const item of invoiceData.items) {
                results.push({ item, usage: 'unknown' });
            }
        }

        // Determine which items need classification
        let itemsToClassify: { item: Item; index: number }[] = [];
        
        if (resumeOption === 'all') {
            // Classify all items
            itemsToClassify = invoiceData.items.map((item, index) => ({ item, index }));
        } else if (resumeOption === 'continue') {
            // Only classify items that don't have a usage yet
            itemsToClassify = invoiceData.items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => !existingUsages.has(item.name));
        } else if (resumeOption === 'unknown') {
            // Only classify items marked as unknown
            itemsToClassify = invoiceData.items
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => existingUsages.get(item.name) === 'unknown');
        }

        // Classify items with incremental saving
        for (const { item, index } of itemsToClassify) {
            const usage = await askUsageForItem(item.name, index, invoiceData.items.length);
            
            // Update or add result
            const existingIndex = results.findIndex(r => r.item.name === item.name);
            if (existingIndex >= 0) {
                results[existingIndex].usage = usage;
            } else {
                results.push({ item, usage });
            }
            
            // Save incrementally
            await saveCsvFile(filePath, results, invoiceData);
        }

        // Final save (in case of any edge cases)
        await saveCsvFile(filePath, results, invoiceData);

        console.log(`\nSaved invoice classification to ${filePath}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error processing invoice:', message);
        process.exitCode = 1;
    }
}

void main();
