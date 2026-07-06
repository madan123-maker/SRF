import { PrismaClient } from '@prisma/client';
import "dotenv/config";
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdmin() {
    const su = process.env.SUPERADMIN_USERNAME || 'superadmin';
    const spRaw = process.env.SUPERADMIN_PASSWORD || '123456';
    const sp = await bcrypt.hash(spRaw, 10);

    const au = process.env.ADMIN_USERNAME || 'admin';
    const apRaw = process.env.ADMIN_PASSWORD || '123456';
    const ap = await bcrypt.hash(apRaw, 10);

    await prisma.admin.upsert({
        where: { username: su },
        update: { password: sp, role: 'SUPERADMIN' },
        create: { username: su, password: sp, role: 'SUPERADMIN', email: 'superadmin@srf.com' }
    });

    await prisma.admin.upsert({
        where: { username: au },
        update: { password: ap, role: 'ADMIN' },
        create: { username: au, password: ap, role: 'ADMIN', email: 'admin@srf.com' }
    });

    console.log('✅ Successfully pulled credentials from .env and seeded the POSTGRESQL [Admin] table natively!');
    await prisma.$disconnect();
}

seedAdmin().catch(console.error);
