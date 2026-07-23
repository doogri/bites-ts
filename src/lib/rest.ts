import express from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { createInvoicesRouter } from './invoicesApi.js';

const app = express();

app.use(express.json());

app.use('/api', createInvoicesRouter());

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'healthy' });
});

app.post('/new-messsage', (req, res) => {
    console.log(`new-messsage: ${JSON.stringify(req.query)}`);
    res.status(200).send('ok');
});

const publicPath = join(process.cwd(), 'dist', 'public');
if (existsSync(publicPath)) {
    app.use(express.static(publicPath));
    app.get('*', (_req, res) => {
        res.sendFile(join(publicPath, 'index.html'));
    });
}

export default app;
