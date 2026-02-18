import TelegramBot, { Message, CallbackQuery } from 'node-telegram-bot-api';
import { AppDataSource } from './data-source.js';
import { Invoice } from './db/entity/Invoice.js';
import { InvoiceItem } from './db/entity/InvoiceItem.js';
import { getInvoiceDataFromUrl, isPairzonLink } from './invoicesBot.js';

const USAGE_OPTIONS = ['his', 'apartment', 'flatmate', 'friends', 'unknown'] as const;

const USAGE_SHORT: Record<string, string> = {
    his: 'his',
    apartment: 'apt',
    flatmate: 'flat',
    friends: 'fri',
    unknown: 'unk',
};

const USAGE_LABELS: Record<string, string> = {
    his: 'For his only',
    apartment: 'For the apartment',
    flatmate: 'For the flatmate',
    friends: 'For friends',
    unknown: 'Unknown',
};

export async function initTelegramBotManager() {
    const botToken = process.env['TELEGRAM_INVOICES_BOT_TOKEN'] || '';

    if (!botToken) {
        console.error('TELEGRAM_INVOICES_BOT_TOKEN is not set');
        return;
    }

    const bot = new TelegramBot(botToken, { polling: true });

    bot.onText(/\/start/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(chatId,
            'Welcome to Invoice Summary Bot!\n\n' +
            'Available commands:\n' +
            '/new <url> - Submit a new invoice URL\n' +
            '/classify - Classify unclassified items\n' +
            '/invoices - Browse & re-classify by month\n' +
            '/summary - View monthly summary'
        );
    });

    bot.onText(/\/new (.+)/, async (msg: Message, match) => {
        const chatId = msg.chat.id;
        const url = match?.[1]?.trim();

        if (!url) {
            await bot.sendMessage(chatId, 'Please provide a URL: /new <url>');
            return;
        }

        if (!isPairzonLink(url)) {
            await bot.sendMessage(chatId, 'Please provide a valid pairzon.com invoice link.');
            return;
        }

        try {
            await bot.sendMessage(chatId, 'Fetching invoice data...');

            const data = await getInvoiceDataFromUrl(url);

            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const existing = await invoiceRepo.findOneBy({ externalId: data.id });

            if (existing) {
                await bot.sendMessage(chatId, `Invoice already exists (${existing.storeName}, ${existing.items?.length ?? 0} items).`);
                return;
            }

            const invoice = invoiceRepo.create({
                externalId: data.id,
                storeName: data.storeName,
                invoiceDate: new Date(data.createdDate),
                total: data.items.reduce((sum, item) => sum + (item.total ?? 0), 0),
                sourceUrl: url,
                classified: false,
            });

            await invoiceRepo.save(invoice);

            const itemRepo = AppDataSource.getRepository(InvoiceItem);
            const items = data.items.map(item => itemRepo.create({
                name: item.name,
                price: item.price ?? 0,
                total: item.total ?? 0,
                quantity: item.quantity ?? 1,
                usage: 'unknown',
                invoiceId: invoice.id,
            }));

            await itemRepo.save(items);

            await bot.sendMessage(chatId, `Invoice saved: ${data.storeName} (${items.length} items). Use /classify to classify items.`);
        } catch (error) {
            console.error('Error processing invoice:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await bot.sendMessage(chatId, `Error: ${errorMessage}`);
        }
    });

    bot.onText(/\/classify/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await showNextUnclassifiedItem(bot, chatId);
    });

    bot.onText(/\/invoices/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await showMonthSelection(bot, chatId);
    });

    bot.onText(/\/summary/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await showFullSummary(bot, chatId);
    });

    bot.on('callback_query', async (query: CallbackQuery) => {
        const data = query.data;
        const message = query.message;

        if (!data || !message) return;

        await bot.answerCallbackQuery(query.id);

        if (data.startsWith('classify:')) {
            await handleClassifyCallback(bot, message.chat.id, data);
        } else if (data.startsWith('month:')) {
            const month = data.slice('month:'.length);
            await showInvoicesForMonth(bot, message.chat.id, month);
        } else if (data.startsWith('invoice:')) {
            const invoiceId = data.slice('invoice:'.length);
            await showNextItemInInvoice(bot, message.chat.id, invoiceId);
        } else if (data.startsWith('reclassify:')) {
            await handleReclassifyCallback(bot, message.chat.id, data);
        }
    });

    bot.on('error', (error) => {
        console.error('Summary bot error: ' + error);
    });

    bot.on('message', async (msg: Message) => {
        if (msg.from?.is_bot) return;
        if (!msg.text || msg.text.startsWith('/')) return;

        const chatId = msg.chat.id;
        const url = msg.text.trim();

        if (!isPairzonLink(url)) {
            return;
        }

        try {
            await bot.sendMessage(chatId, 'Fetching invoice data...');

            const data = await getInvoiceDataFromUrl(url);

            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const existing = await invoiceRepo.findOneBy({ externalId: data.id });

            if (existing) {
                await bot.sendMessage(chatId, `Invoice already exists (${existing.storeName}, ${existing.items?.length ?? 0} items).`);
                return;
            }

            const invoice = invoiceRepo.create({
                externalId: data.id,
                storeName: data.storeName,
                invoiceDate: new Date(data.createdDate),
                total: data.items.reduce((sum, item) => sum + (item.total ?? 0), 0),
                sourceUrl: url,
                classified: false,
            });

            await invoiceRepo.save(invoice);

            const itemRepo = AppDataSource.getRepository(InvoiceItem);
            const items = data.items.map(item => itemRepo.create({
                name: item.name,
                price: item.price ?? 0,
                total: item.total ?? 0,
                quantity: item.quantity ?? 1,
                usage: 'unknown',
                invoiceId: invoice.id,
            }));

            await itemRepo.save(items);

            await bot.sendMessage(chatId, `Invoice saved: ${data.storeName} (${items.length} items). Use /classify to classify items.`);
        } catch (error) {
            console.error('Error processing invoice:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            await bot.sendMessage(chatId, `Error: ${errorMessage}`);
        }
    });
}

async function showNextUnclassifiedItem(bot: TelegramBot, chatId: number) {
    const itemRepo = AppDataSource.getRepository(InvoiceItem);

    const totalUnclassified = await itemRepo.count({ where: { usage: 'unknown' } });

    if (totalUnclassified === 0) {
        await bot.sendMessage(chatId, 'All items are classified!');
        return;
    }

    const item = await itemRepo.findOne({
        where: { usage: 'unknown' },
        relations: ['invoice'],
        order: { createdAt: 'ASC' },
    });

    if (!item) {
        await bot.sendMessage(chatId, 'All items are classified!');
        return;
    }

    const totalItems = await itemRepo.count({ where: { invoiceId: item.invoiceId } });
    const classifiedItems = await itemRepo.count({
        where: { invoiceId: item.invoiceId, usage: undefined },
    });
    // Count items that are NOT unknown for this invoice
    const classifiedCount = totalItems - await itemRepo.count({
        where: { invoiceId: item.invoiceId, usage: 'unknown' },
    });

    const buttons = USAGE_OPTIONS.map(usage => ({
        text: USAGE_LABELS[usage],
        callback_data: `classify:${item.id}:${usage}`,
    }));

    // 2 buttons per row + last row
    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
    }

    const storeName = item.invoice?.storeName ?? 'Unknown store';

    await bot.sendMessage(chatId,
        `📦 ${storeName} (${classifiedCount}/${totalItems} classified)\n` +
        `Remaining across all invoices: ${totalUnclassified}\n\n` +
        `Item: <b>${escapeHtml(item.name)}</b>\n` +
        `Price: ${Number(item.total).toFixed(2)} (qty: ${item.quantity})`,
        {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
        }
    );
}

async function handleClassifyCallback(bot: TelegramBot, chatId: number, data: string) {
    const parts = data.split(':');
    if (parts.length !== 3) return;

    const [, itemId, usage] = parts;

    const itemRepo = AppDataSource.getRepository(InvoiceItem);
    const item = await itemRepo.findOneBy({ id: itemId });

    if (!item) {
        await bot.sendMessage(chatId, 'Item not found.');
        return;
    }

    item.usage = usage;
    await itemRepo.save(item);

    // Check if all items in the invoice are classified
    const remainingInInvoice = await itemRepo.count({
        where: { invoiceId: item.invoiceId, usage: 'unknown' },
    });

    if (remainingInInvoice === 0) {
        const invoiceRepo = AppDataSource.getRepository(Invoice);
        await invoiceRepo.update(item.invoiceId, { classified: true });
        await bot.sendMessage(chatId, `✅ Invoice fully classified!`);
    }

    // Show next item
    await showNextUnclassifiedItem(bot, chatId);
}

async function showFullSummary(bot: TelegramBot, chatId: number) {
    const itemRepo = AppDataSource.getRepository(InvoiceItem);

    const rows: { month: string; usage: string; total: string }[] = await itemRepo
        .createQueryBuilder('item')
        .select("to_char(date_trunc('month', i.invoiceDate), 'YYYY-MM')", 'month')
        .addSelect('item.usage', 'usage')
        .addSelect('SUM(item.total)', 'total')
        .innerJoin('item.invoice', 'i')
        .groupBy("to_char(date_trunc('month', i.invoiceDate), 'YYYY-MM')")
        .addGroupBy('item.usage')
        .orderBy("to_char(date_trunc('month', i.invoiceDate), 'YYYY-MM')", 'DESC')
        .getRawMany();

    if (rows.length === 0) {
        await bot.sendMessage(chatId, 'No invoices found.');
        return;
    }

    // Build cross-table: month -> usage -> total
    const months: string[] = [];
    const data: Record<string, Record<string, number>> = {};
    const colTotals: Record<string, number> = {};

    for (const usage of USAGE_OPTIONS) {
        colTotals[usage] = 0;
    }

    for (const row of rows) {
        if (!data[row.month]) {
            data[row.month] = {};
            months.push(row.month);
        }
        const val = parseFloat(row.total) || 0;
        data[row.month][row.usage] = val;
        colTotals[row.usage] = (colTotals[row.usage] ?? 0) + val;
    }

    const W = 7; // column width
    const cols = USAGE_OPTIONS.map(u => USAGE_SHORT[u]);
    const header = 'Month  ' + cols.map(c => '|' + c.padStart(W)).join('') + '|' + 'Total'.padStart(W);
    const sep = '───────' + cols.map(() => '┼' + '─'.repeat(W)).join('') + '┼' + '─'.repeat(W);

    let table = `<pre>\n${header}\n${sep}\n`;

    let grandTotal = 0;
    for (const month of months) {
        let rowTotal = 0;
        let line = month.padEnd(7);
        for (const usage of USAGE_OPTIONS) {
            const val = data[month][usage] ?? 0;
            rowTotal += val;
            line += '|' + val.toFixed(0).padStart(W);
        }
        grandTotal += rowTotal;
        line += '|' + rowTotal.toFixed(0).padStart(W);
        table += line + '\n';
    }

    table += sep + '\n';

    let totalLine = 'Total  ';
    let allColSum = 0;
    for (const usage of USAGE_OPTIONS) {
        allColSum += colTotals[usage];
        totalLine += '|' + colTotals[usage].toFixed(0).padStart(W);
    }
    totalLine += '|' + grandTotal.toFixed(0).padStart(W);
    table += totalLine + '\n</pre>';

    await bot.sendMessage(chatId, table, { parse_mode: 'HTML' });
}

async function showMonthSelection(bot: TelegramBot, chatId: number) {
    const invoiceRepo = AppDataSource.getRepository(Invoice);

    const rows: { month: string }[] = await invoiceRepo
        .createQueryBuilder('i')
        .select("to_char(date_trunc('month', i.invoiceDate), 'YYYY-MM')", 'month')
        .groupBy("date_trunc('month', i.invoiceDate)")
        .orderBy("date_trunc('month', i.invoiceDate)", 'DESC')
        .getRawMany();

    if (rows.length === 0) {
        await bot.sendMessage(chatId, 'No invoices found.');
        return;
    }

    const keyboard = rows.map(row => ([{
        text: row.month,
        callback_data: `month:${row.month}`,
    }]));

    await bot.sendMessage(chatId, 'Select a month:', {
        reply_markup: { inline_keyboard: keyboard },
    });
}

async function showInvoicesForMonth(bot: TelegramBot, chatId: number, month: string) {
    const invoiceRepo = AppDataSource.getRepository(Invoice);

    const invoices = await invoiceRepo
        .createQueryBuilder('i')
        .where("to_char(date_trunc('month', i.invoiceDate), 'YYYY-MM') = :month", { month })
        .orderBy('i.invoiceDate', 'ASC')
        .getMany();

    if (invoices.length === 0) {
        await bot.sendMessage(chatId, 'No invoices found for this month.');
        return;
    }

    const keyboard = invoices.map(inv => {
        const day = new Date(inv.invoiceDate).getDate().toString().padStart(2, '0');
        const total = Number(inv.total).toFixed(0);
        return [{
            text: `${inv.storeName} - ${day} (₪${total})`,
            callback_data: `invoice:${inv.id}`,
        }];
    });

    await bot.sendMessage(chatId, `Invoices for ${month}:`, {
        reply_markup: { inline_keyboard: keyboard },
    });
}

async function showNextItemInInvoice(bot: TelegramBot, chatId: number, invoiceId: string, afterItemId?: string) {
    const itemRepo = AppDataSource.getRepository(InvoiceItem);

    const allItems = await itemRepo.find({
        where: { invoiceId },
        relations: ['invoice'],
        order: { createdAt: 'ASC' },
    });

    if (allItems.length === 0) {
        await bot.sendMessage(chatId, 'No items in this invoice.');
        return;
    }

    let item: InvoiceItem | undefined;
    if (afterItemId) {
        const idx = allItems.findIndex(i => i.id === afterItemId);
        item = idx >= 0 && idx + 1 < allItems.length ? allItems[idx + 1] : undefined;
    } else {
        item = allItems[0];
    }

    if (!item) {
        await bot.sendMessage(chatId, '✅ All items re-classified!');
        return;
    }

    const itemIndex = allItems.findIndex(i => i.id === item!.id) + 1;

    const buttons = USAGE_OPTIONS.map(usage => ({
        text: USAGE_LABELS[usage],
        callback_data: `reclassify:${item!.id}:${usage}`,
    }));

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
        keyboard.push(buttons.slice(i, i + 2));
    }

    const storeName = item.invoice?.storeName ?? 'Unknown store';
    const currentUsage = USAGE_LABELS[item.usage] ?? item.usage;

    await bot.sendMessage(chatId,
        `📦 ${storeName} (${itemIndex}/${allItems.length})\n\n` +
        `Item: <b>${escapeHtml(item.name)}</b>\n` +
        `Price: ${Number(item.total).toFixed(2)} (qty: ${item.quantity})\n` +
        `Current: ${currentUsage}`,
        {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard },
        }
    );
}

async function handleReclassifyCallback(bot: TelegramBot, chatId: number, data: string) {
    const parts = data.split(':');
    if (parts.length !== 3) return;

    const [, itemId, usage] = parts;

    const itemRepo = AppDataSource.getRepository(InvoiceItem);
    const item = await itemRepo.findOneBy({ id: itemId });

    if (!item) {
        await bot.sendMessage(chatId, 'Item not found.');
        return;
    }

    item.usage = usage;
    await itemRepo.save(item);

    await showNextItemInInvoice(bot, chatId, item.invoiceId, itemId);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
