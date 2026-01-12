import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import modelsRouter from './routes/models.js';
import favoritesRouter from './routes/favorites.js';
import printedRouter from './routes/printed.js';
import queueRouter from './routes/queue.js';
import systemRouter from './routes/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// API Routes
app.use('/api/models', modelsRouter);
app.use('/api/favorites', favoritesRouter);
app.use('/api/printed', printedRouter);
app.use('/api/queue', queueRouter);
app.use('/api/system', systemRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
});
