import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';

import cookieParser from 'cookie-parser';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

app.use('/', routes);

export default app;
