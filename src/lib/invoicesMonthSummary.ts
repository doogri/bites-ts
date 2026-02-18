// Usage:
//   npm run invoice:month -- [YYYY-MM]
//   npm run invoice:month -- 2025-12

import { getDownloadsInvoicesBaseDir, parseInvoiceCsv, InvoiceRow, Usage } from './invoicesCli.js';
import * as fs from 'node:fs/promises';
import * as readline from 'node:readline';
import * as path from 'node:path';

export const categoryLabels: Record<Usage, string> = {
    his: 'For his only',
    apartment: 'For the apartment',
    flatmate: 'For the flatmate',
    friends: 'For friends',
    unknown: 'Unknown',
};

export interface MonthlySummaryResult {
    month: string;
    totals: Record<Usage, number>;
    grandTotal: number;
    invoiceCount: number;
}

/**
 * List all available months (YYYY-MM folders) that contain invoice CSV files
 */
export async function listAvailableMonths(): Promise<string[]> {
    const months: string[] = [];
    try {
        const baseDir = getDownloadsInvoicesBaseDir();
        const entries = await fs.readdir(baseDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const folderName = entry.name;
                // Check if it's a YYYY-MM folder
                if (/^\d{4}-\d{2}$/.test(folderName)) {
                    const monthDir = path.join(baseDir, folderName);
                    try {
                        const files = await fs.readdir(monthDir);
                        // Check if there's at least one invoice CSV file
                        const hasInvoice = files.some(file => file.startsWith('invoice_') && file.endsWith('.csv'));
                        if (hasInvoice) {
                            months.push(folderName);
                        }
                    } catch {
                        // Skip this folder if we can't read it
                        continue;
                    }
                }
            }
        }
    } catch (error) {
        // Base directory doesn't exist yet
        console.error('Error reading invoices directory:', error);
    }

    // Sort months descending (newest first)
    return months.sort((a, b) => b.localeCompare(a));
}

/**
 * Ask user to select a month using arrow keys and Enter
 */
function askMonthSelection(months: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        let selectedIndex = 0;

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
            process.stdout.write('Select a month:\n');
            months.forEach((month, index) => {
                const marker = index === selectedIndex ? '→' : ' ';
                process.stdout.write(`${marker} ${month}\n`);
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
                selectedIndex = (selectedIndex - 1 + months.length) % months.length;
                renderMenu();
            } else if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % months.length;
                renderMenu();
            } else if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                process.stdout.write(`\nSelected: ${months[selectedIndex]}\n`);
                resolve(months[selectedIndex]);
            }
        };

        stdin.on('keypress', onKeypress);
    });
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
 * Get monthly summary data without printing or saving (reusable by bot)
 */
export async function getMonthlySummaryData(month: string): Promise<MonthlySummaryResult | null> {
    const baseDir = getDownloadsInvoicesBaseDir();
    const monthDir = path.join(baseDir, month);

    const files = await fs.readdir(monthDir);
    const invoiceFiles = files.filter(file => file.startsWith('invoice_') && file.endsWith('.csv'));

    if (invoiceFiles.length === 0) {
        return null;
    }

    const totals: Record<Usage, number> = {
        his: 0,
        apartment: 0,
        flatmate: 0,
        friends: 0,
        unknown: 0,
    };

    for (const file of invoiceFiles) {
        const filePath = path.join(monthDir, file);
        const rows = await parseInvoiceCsv(filePath);

        for (const row of rows) {
            totals[row.usage] += row.total;
        }
    }

    let grandTotal = 0;
    for (const total of Object.values(totals)) {
        grandTotal += total;
    }

    return { month, totals, grandTotal, invoiceCount: invoiceFiles.length };
}

/**
 * Calculate monthly summary for a given month (CLI version - prints and saves CSV)
 */
async function calculateMonthlySummary(month: string): Promise<void> {
    const baseDir = getDownloadsInvoicesBaseDir();
    const monthDir = path.join(baseDir, month);

    try {
        const result = await getMonthlySummaryData(month);

        if (!result) {
            console.log(`No invoice files found for month ${month}`);
            return;
        }

        console.log(`\nProcessing ${result.invoiceCount} invoice file(s) for ${month}...\n`);

        // Print summary table
        console.log('Monthly Summary by Category:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('Category          | Total');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        for (const [usage, total] of Object.entries(result.totals) as [Usage, number][]) {
            const label = categoryLabels[usage];
            console.log(`${label.padEnd(18)} | ${total.toFixed(2)}`);
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`${'Grand Total'.padEnd(18)} | ${result.grandTotal.toFixed(2)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Save summary CSV
        const summaryFilePath = path.join(monthDir, `summary_${month}.csv`);
        const summaryLines = ['usage,total'];
        for (const [usage, total] of Object.entries(result.totals) as [Usage, number][]) {
            summaryLines.push(`${usage},${total.toFixed(2)}`);
        }
        summaryLines.push(`grand_total,${result.grandTotal.toFixed(2)}`);

        await fs.writeFile(summaryFilePath, summaryLines.join('\n') + '\n', 'utf8');
        console.log(`Summary saved to: ${summaryFilePath}`);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Error calculating summary for ${month}:`, message);
        process.exitCode = 1;
    }
}

async function main() {
    const [, , monthArg] = process.argv;

    let selectedMonth: string;

    if (monthArg) {
        // Validate month format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(monthArg)) {
            console.error('Invalid month format. Use YYYY-MM (e.g., 2025-12)');
            process.exitCode = 1;
            return;
        }
        selectedMonth = monthArg;
    } else {
        // Show interactive menu
        const months = await listAvailableMonths();

        if (months.length === 0) {
            console.log('No months with invoice files found.');
            console.log(`Make sure invoices are stored in: ${getDownloadsInvoicesBaseDir()}`);
            process.exitCode = 1;
            return;
        }

        selectedMonth = await askMonthSelection(months);
    }

    await calculateMonthlySummary(selectedMonth);
}

void main();
