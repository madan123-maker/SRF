import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import app from './app.js';
import { seedDatabase } from './utils/seeder.js';

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[Server] Running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
