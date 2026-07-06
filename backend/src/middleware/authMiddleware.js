import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function verifySession(req, res, next) {
    let token = req.cookies?.accessToken;
    if (!token) {
        const authHeader = req.header('Authorization');
        token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    }

    if (!token) {
        return res.status(401).json({ error: 'Session credentials required' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'srf_super_secret_key_2026');

        // Native Prisma identity verification
        let foundUser = null;
        if (decoded.role === 'admin' || decoded.role === 'superadmin') {
            foundUser = await prisma.admin.findUnique({ where: { id: decoded.id } });
        } else {
            foundUser = await prisma.user.findUnique({ where: { id: decoded.id } });
        }

        if (!foundUser) {
            return res.status(403).json({ error: 'Access denied: Invalid session' });
        }
        req.user = foundUser;
        if (req.user.role) req.user.role = String(req.user.role).toLowerCase();
        next();
    } catch (err) {
        // Mute terrifying stack trace dumps and only print the message cleanly
        console.error(`[Auth] JWT Validation Failed: ${err.message}`);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

export async function verifySessionOptional(req, res, next) {
    let token = req.cookies?.accessToken;
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'srf_super_secret_key_2026');
            let foundUser = null;
            if (decoded.role === 'admin' || decoded.role === 'superadmin') {
                foundUser = await prisma.admin.findUnique({ where: { id: decoded.id } });
            } else {
                foundUser = await prisma.user.findUnique({ where: { id: decoded.id } });
            }
            if (foundUser) {
                req.user = foundUser;
                if (req.user.role) req.user.role = String(req.user.role).toLowerCase();
            }
        } catch (e) {
            console.log(`[Optional Auth] Token skipped: ${e.message}`);
        }
    }

    next();
}
