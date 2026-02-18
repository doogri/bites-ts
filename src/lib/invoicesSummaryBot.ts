import TelegramBot, { Message, CallbackQuery } from 'node-telegram-bot-api';
import { AppDataSource } from './data-source.js';
import { Invoice } from './db/entity/Invoice.js';
import { InvoiceItem } from './db/entity/InvoiceItem.js';
import { getInvoiceDataFromUrl, isPairzonLink } from './invoicesBot.js';

const USAGE_OPTIONS = ['his', 'apartment', 'flatmate', 'friends', 'unknown'] as const;

const USAGE_LABELS: Record<string, string> = {
    his: 'For his only',
    apartment: 'For the apartment',
    flatmate: 'For the flatmate',
    friends: 'For friends',
    unknown: 'Unknown',
};

export async function initTelegramBotManager() {
    const botToken = process.env['TELEGRAM_SUMMARY_BOT_TOKEN'] || '';

    if (!botToken) {
        console.error('TELEGRAM_SUMMARY_BOT_TOKEN is not set');
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

    bot.onText(/\/summary/, async (msg: Message) => {
        const chatId = msg.chat.id;
        await showMonthSelection(bot, chatId);
    });

    bot.on('callback_query', async (query: CallbackQuery) => {
        const data = query.data;
        const message = query.message;

        if (!data || !message) return;

        await bot.answerCallbackQuery(query.id);

        if (data.startsWith('classify:')) {
            await handleClassifyCallback(bot, message.chat.id, data);
        } else if (data.startsWith('summary:')) {
            await handleSummaryCallback(bot, message.chat.id, data);
        }
    });

    bot.on('error', (error) => {
        console.error('Summary bot error: ' + error);
    });

    bot.on('message', async (msg: Message) => {
        if (msg.from?.is_bot) return;
        if (!msg.text || msg.text.startsWith('/')) return;
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

async function showMonthSelection(bot: TelegramBot, chatId: number) {
    const invoiceRepo = AppDataSource.getRepository(Invoice);

    const months: { month: string }[] = await invoiceRepo
        .createQueryBuilder('invoice')
        .select("to_char(date_trunc('month', invoice.invoiceDate), 'YYYY-MM')", 'month')
        .distinct(true)
        .orderBy("1", 'DESC')
        .getRawMany();

    if (months.length === 0) {
        await bot.sendMessage(chatId, 'No invoices found.');
        return;
    }

    const keyboard: TelegramBot.InlineKeyboardButton[][] = [];
    for (let i = 0; i < months.length; i += 2) {
        const row = months.slice(i, i + 2).map(m => ({
            text: m.month,
            callback_data: `summary:${m.month}`,
        }));
        keyboard.push(row);
    }

    await bot.sendMessage(chatId, 'Select a month:', {
        reply_markup: { inline_keyboard: keyboard },
    });
}

async function handleSummaryCallback(bot: TelegramBot, chatId: number, data: string) {
    const month = data.replace('summary:', '');

    const itemRepo = AppDataSource.getRepository(InvoiceItem);
    const invoiceRepo = AppDataSource.getRepository(Invoice);

    // Get invoices for this month
    const invoices = await invoiceRepo
        .createQueryBuilder('invoice')
        .where("to_char(date_trunc('month', invoice.invoiceDate), 'YYYY-MM') = :month", { month })
        .getMany();

    if (invoices.length === 0) {
        await bot.sendMessage(chatId, `No invoices found for ${month}.`);
        return;
    }

    const invoiceIds = invoices.map(inv => inv.id);

    // Get totals grouped by usage
    const results: { usage: string; total: string }[] = await itemRepo
        .createQueryBuilder('item')
        .select('item.usage', 'usage')
        .addSelect('SUM(item.total)', 'total')
        .where('item.invoiceId IN (:...ids)', { ids: invoiceIds })
        .groupBy('item.usage')
        .getRawMany();

    const totals: Record<string, number> = {};
    let grandTotal = 0;
    for (const r of results) {
        totals[r.usage] = parseFloat(r.total) || 0;
        grandTotal += totals[r.usage];
    }

    // Build formatted table
    let table = `<b>Monthly Summary: ${month}</b>\n`;
    table += `<i>${invoices.length} invoice(s) processed</i>\n\n`;
    table += `<pre>\n`;
    table += `Category           | Total\n`;
    table += `───────────────────┼────────\n`;

    for (const usage of USAGE_OPTIONS) {
        const label = USAGE_LABELS[usage];
        const total = (totals[usage] ?? 0).toFixed(2);
        table += `${label.padEnd(19)}| ${total}\n`;
    }

    table += `───────────────────┼────────\n`;
    table += `${'Grand Total'.padEnd(19)}| ${grandTotal.toFixed(2)}\n`;
    table += `</pre>`;

    await bot.sendMessage(chatId, table, { parse_mode: 'HTML' });
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
