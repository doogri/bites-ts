import { Router, Request, Response } from 'express';
import { AppDataSource } from './data-source.js';
import { Invoice } from './db/entity/Invoice.js';
import { InvoiceItem } from './db/entity/InvoiceItem.js';
import { getInvoiceDataFromUrl, isSupportedInvoiceLink } from './invoicesBot.js';

const VALID_USAGES = ['his', 'apartment', 'flatmate', 'friends', 'unknown'] as const;

function authMiddleware(req: Request, res: Response, next: () => void) {
    const secret = process.env['WEB_SECRET'];
    if (!secret) {
        res.status(503).json({ error: 'WEB_SECRET not configured' });
        return;
    }
    if (req.headers['authorization'] !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    next();
}

export function createInvoicesRouter(): Router {
    const router = Router();
    router.use(authMiddleware);

    router.get('/invoices', async (_req: Request, res: Response) => {
        try {
            const invoices = await AppDataSource.getRepository(Invoice).find({
                relations: ['items'],
                order: { invoiceDate: 'DESC' },
            });
            res.json(invoices);
        } catch {
            res.status(500).json({ error: 'Failed to fetch invoices' });
        }
    });

    router.post('/invoices', async (req: Request, res: Response) => {
        const { url } = req.body as { url?: string };

        if (!url || !isSupportedInvoiceLink(url)) {
            res.status(400).json({ error: 'Invalid invoice URL (must be pairzon.com or rami-levy.co.il)' });
            return;
        }

        try {
            const data = await getInvoiceDataFromUrl(url);

            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const existing = await invoiceRepo.findOneBy({ externalId: data.id });
            if (existing) {
                res.status(409).json({ error: 'Invoice already exists' });
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
                discount: item.discount ?? 0,
                quantity: item.quantity ?? 1,
                usage: 'unknown',
                invoiceId: invoice.id,
            }));
            await itemRepo.save(items);

            const saved = await invoiceRepo.findOne({
                where: { id: invoice.id },
                relations: ['items'],
            });
            res.status(201).json(saved);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            res.status(500).json({ error: message });
        }
    });

    router.delete('/invoices/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        try {
            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const invoice = await invoiceRepo.findOne({ where: { id }, relations: ['items'] });
            if (!invoice) {
                res.status(404).json({ error: 'Invoice not found' });
                return;
            }
            await AppDataSource.getRepository(InvoiceItem).delete({ invoiceId: id });
            await invoiceRepo.delete(id);
            res.status(204).send();
        } catch {
            res.status(500).json({ error: 'Failed to delete invoice' });
        }
    });

    router.patch('/invoices/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        const { checked } = req.body as { checked?: boolean };

        if (typeof checked !== 'boolean') {
            res.status(400).json({ error: 'Invalid checked value' });
            return;
        }

        try {
            const invoiceRepo = AppDataSource.getRepository(Invoice);
            const invoice = await invoiceRepo.findOneBy({ id });
            if (!invoice) {
                res.status(404).json({ error: 'Invoice not found' });
                return;
            }
            invoice.checked = checked;
            await invoiceRepo.save(invoice);
            res.json(invoice);
        } catch {
            res.status(500).json({ error: 'Failed to update invoice' });
        }
    });

    router.patch('/items/:id', async (req: Request, res: Response) => {
        const { id } = req.params;
        const { usage } = req.body as { usage?: string };

        if (!usage || !VALID_USAGES.includes(usage as typeof VALID_USAGES[number])) {
            res.status(400).json({ error: 'Invalid usage value' });
            return;
        }

        try {
            const itemRepo = AppDataSource.getRepository(InvoiceItem);
            const item = await itemRepo.findOneBy({ id });
            if (!item) {
                res.status(404).json({ error: 'Item not found' });
                return;
            }

            item.usage = usage;
            await itemRepo.save(item);

            const remaining = await itemRepo.count({
                where: { invoiceId: item.invoiceId, usage: 'unknown' },
            });
            if (remaining === 0) {
                await AppDataSource.getRepository(Invoice).update(item.invoiceId, { classified: true });
            }

            res.json(item);
        } catch {
            res.status(500).json({ error: 'Failed to update item' });
        }
    });

    return router;
}
