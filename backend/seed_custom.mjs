import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function seedCustomAdmins() {
    console.log('Generating secure bcrypt hashes for custom admins...');
    const password = 'Jayaveer!@#1837';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('Upserting Super Admin (Jayaveer)...');
    await prisma.admin.upsert({
        where: { username: 'superadmin' },
        update: {
            email: 'ramanadhamjayaveer@gmail.com',
            password: hashedPassword,
            role: 'SUPERADMIN',
            name: 'Jayaveer',
            organization: 'AI/ML',
            state: 'Andra Pradesh',
            district: 'Category Random, Sector random', // Injecting these here since Admin doesn't natively have Sector
            refreshToken: crypto.randomBytes(32).toString('hex'),
            lastIp: 'Mangalagiri'
        },
        create: {
            username: 'superadmin',
            email: 'ramanadhamjayaveer@gmail.com',
            password: hashedPassword,
            role: 'SUPERADMIN',
            name: 'Jayaveer',
            organization: 'AI/ML',
            state: 'Andra Pradesh',
            district: 'Category Random, Sector random',
            refreshToken: crypto.randomBytes(32).toString('hex'),
            lastIp: 'Mangalagiri'
        }
    });

    console.log('Upserting standard Admin (Nani)...');
    await prisma.admin.upsert({
        where: { username: 'admin' },
        update: {
            email: 'ramanadhamjayaveer@mictech.edu.in',
            password: hashedPassword,
            role: 'ADMIN',
            name: 'Nani',
            organization: 'SRF',
            state: 'Andra Pradesh',
            refreshToken: crypto.randomBytes(32).toString('hex')
        },
        create: {
            username: 'admin',
            email: 'ramanadhamjayaveer@mictech.edu.in',
            password: hashedPassword,
            role: 'ADMIN',
            name: 'Nani',
            organization: 'SRF',
            state: 'Andra Pradesh',
            refreshToken: crypto.randomBytes(32).toString('hex')
        }
    });

    console.log('✅ Custom Admins successfully seeded into PostgreSQL database!');
}

seedCustomAdmins()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
