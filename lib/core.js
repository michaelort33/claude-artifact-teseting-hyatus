const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { put } = require('@vercel/blob');
const sgMail = require('@sendgrid/mail');

const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 7;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('localhost');
const COOKIE_SECURE = IS_PRODUCTION ? '; Secure' : '';
const DEV_ADMIN_COOKIE = 'dev_admin_session';
const DEV_ADMIN_EMAIL = process.env.DEV_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@example.com';
const DEV_ADMIN_LOGIN_ENABLED = process.env.DEV_ADMIN_LOGIN === 'true';
const DEV_ADMIN_TOKEN = process.env.DEV_ADMIN_TOKEN || '';

const dbUrl = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl?.includes('localhost') ? false : { rejectUnauthorized: false }
});

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) cookies[name] = value;
        });
    }
    return cookies;
}

function isLocalRequest(req) {
    const host = (req.headers.host || '').split(':')[0];
    const socketIp = req.socket?.remoteAddress;
    return host === 'localhost'
        || host === '127.0.0.1'
        || host === '::1'
        || socketIp === '127.0.0.1'
        || socketIp === '::1'
        || socketIp === '::ffff:127.0.0.1';
}

function getDevAdminUser(req) {
    if (!DEV_ADMIN_LOGIN_ENABLED || !isLocalRequest(req)) return null;
    const cookies = parseCookies(req.headers.cookie);
    if (!DEV_ADMIN_TOKEN || cookies[DEV_ADMIN_COOKIE] !== DEV_ADMIN_TOKEN) return null;
    return { id: 0, email: DEV_ADMIN_EMAIL };
}

async function getSessionUser(req) {
    const devAdmin = getDevAdminUser(req);
    if (devAdmin) return devAdmin;

    const cookies = parseCookies(req.headers.cookie);
    const sessionToken = cookies.session_token;
    if (!sessionToken) return null;

    try {
        const result = await pool.query(
            `SELECT u.id, u.email FROM users u
             JOIN sessions s ON u.id = s.user_id
             WHERE s.token = $1 AND s.expires_at > NOW()`,
            [sessionToken]
        );
        return result.rows[0] || null;
    } catch (err) {
        console.error('Session lookup error:', err);
        return null;
    }
}

async function isAdmin(email) {
    if (DEV_ADMIN_LOGIN_ENABLED && email === DEV_ADMIN_EMAIL) return true;

    try {
        const result = await pool.query('SELECT email FROM admins WHERE email = $1', [email]);
        return result.rows.length > 0;
    } catch (err) {
        console.error('Admin check error:', err);
        return false;
    }
}

const MAX_BODY_BYTES = 6 * 1024 * 1024; // 6 MB; screenshot uploads are the largest path

function parseBody(req, maxBytes = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let aborted = false;
        req.on('data', chunk => {
            if (aborted) return;
            size += chunk.length;
            if (size > maxBytes) {
                aborted = true;
                const err = new Error('Request body too large');
                err.statusCode = 413;
                reject(err);
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (aborted) return;
            try {
                const body = Buffer.concat(chunks).toString('utf8');
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', (err) => { if (!aborted) reject(err); });
    });
}

const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src-elem 'self' https://cdn.jsdelivr.net; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.vercel-storage.com; connect-src 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-XSS-Protection': '1; mode=block'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        ...securityHeaders
    });
    res.end(JSON.stringify(data));
}

/* ---------- Rate limiting (Redis-backed with in-memory fallback) ---------- */

const FORM_RATE_LIMIT = 5;
const FORM_RATE_WINDOW = 60000;
const REDIS_OP_TIMEOUT_MS = 2000;

const memoryBuckets = new Map();
let redisClient = null;
let redisClientPromise = null;

function getRedisClient() {
    if (!process.env.REDIS_URL) return null;
    if (redisClient) return redisClient;
    if (redisClientPromise) return redisClientPromise;

    const { createClient } = require('redis');
    redisClientPromise = (async () => {
        const client = createClient({
            url: process.env.REDIS_URL,
            socket: { connectTimeout: 2000, reconnectStrategy: (retries) => Math.min(retries * 50, 500) }
        });
        client.on('error', (err) => console.error('Redis error:', err.message));
        await client.connect();
        redisClient = client;
        return client;
    })().catch((err) => {
        console.error('Redis connect failed, falling back to in-memory rate limit:', err.message);
        redisClientPromise = null;
        return null;
    });

    return redisClientPromise;
}

function memoryBucketAllows(key, limit, windowMs) {
    const now = Date.now();
    const entry = memoryBuckets.get(key);
    if (!entry || now - entry.start > windowMs) {
        memoryBuckets.set(key, { count: 1, start: now });
        return true;
    }
    entry.count++;
    return entry.count <= limit;
}

async function rateLimitAllows(key, { limit, windowMs }) {
    const client = await getRedisClient();
    if (!client) return memoryBucketAllows(key, limit, windowMs);

    const ttlSeconds = Math.ceil(windowMs / 1000);
    try {
        const count = await Promise.race([
            (async () => {
                const c = await client.incr(key);
                if (c === 1) await client.expire(key, ttlSeconds);
                return c;
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), REDIS_OP_TIMEOUT_MS))
        ]);
        return count <= limit;
    } catch (err) {
        console.error(`Redis rate-limit check failed for ${key}, falling back to memory: ${err.message}`);
        return memoryBucketAllows(key, limit, windowMs);
    }
}

async function checkFormRateLimit(ip, options = {}) {
    const namespace = options.namespace || 'form';
    const limit = options.limit || FORM_RATE_LIMIT;
    const windowMs = options.windowMs || FORM_RATE_WINDOW;
    return rateLimitAllows(`rl:${namespace}:${ip}`, { limit, windowMs });
}

/* ---------- Input hygiene ---------- */

function sanitizeInput(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

const HTML_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPE[ch]);
}

/* ---------- Client IP (Vercel-aware) ---------- */

// On Vercel, `x-vercel-forwarded-for` is set by the edge and cannot be spoofed by the client.
// `x-forwarded-for` CAN be spoofed (client may prepend entries), so only trust it in local dev
// (loopback socket). See docs: https://vercel.com/docs/edge-network/headers/request-headers
function getClientIp(req) {
    const vercelFwd = req.headers['x-vercel-forwarded-for'];
    if (typeof vercelFwd === 'string' && vercelFwd.length > 0) {
        return vercelFwd.split(',')[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string' && realIp.length > 0) {
        return realIp;
    }
    const socketIp = req.socket?.remoteAddress;
    if (socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1') {
        const xff = req.headers['x-forwarded-for'];
        if (typeof xff === 'string' && xff.length > 0) {
            return xff.split(',')[0].trim();
        }
    }
    return socketIp || 'unknown';
}

/* ---------- Screenshot upload ---------- */

const ALLOWED_IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function detectImageMagic(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
        buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return 'image/webp';
    return null;
}

function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') {
        const err = new Error('Invalid screenshot payload');
        err.statusCode = 400;
        throw err;
    }
    const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
        const err = new Error('Invalid screenshot payload');
        err.statusCode = 400;
        throw err;
    }
    const contentType = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
        const err = new Error('Unsupported image type');
        err.statusCode = 415;
        throw err;
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) {
        const err = new Error('Empty image payload');
        err.statusCode = 400;
        throw err;
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        const err = new Error('Image exceeds maximum size');
        err.statusCode = 413;
        throw err;
    }
    const magic = detectImageMagic(buffer);
    if (!magic || magic !== contentType) {
        const err = new Error('Image contents do not match declared type');
        err.statusCode = 400;
        throw err;
    }
    return { contentType, buffer };
}

function getExtensionForContentType(contentType) {
    const extensionMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif'
    };
    return extensionMap[contentType] || 'bin';
}

const SAFE_FILENAME_RE = /[^A-Za-z0-9._-]/g;

async function uploadScreenshotToBlob(dataUrl, filename = 'screenshot') {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        throw new Error('Blob storage not configured');
    }

    const { contentType, buffer } = parseDataUrl(dataUrl);
    const extension = getExtensionForContentType(contentType);
    const rawStem = path.basename(String(filename || 'screenshot'), path.extname(String(filename || ''))) || 'screenshot';
    const safeStem = rawStem.replace(SAFE_FILENAME_RE, '_').slice(0, 60) || 'screenshot';
    const pathname = `screenshots/${Date.now()}-${safeStem}.${extension}`;

    return put(pathname, buffer, {
        access: 'public',
        addRandomSuffix: true,
        contentType,
        token
    });
}

module.exports = {
    bcrypt,
    COOKIE_SECURE,
    DEV_ADMIN_COOKIE,
    DEV_ADMIN_EMAIL,
    DEV_ADMIN_LOGIN_ENABLED,
    DEV_ADMIN_TOKEN,
    SALT_ROUNDS,
    SESSION_EXPIRY_DAYS,
    checkFormRateLimit,
    escapeHtml,
    generateToken,
    getClientIp,
    getSessionUser,
    isLocalRequest,
    isAdmin,
    parseBody,
    pool,
    sanitizeInput,
    securityHeaders,
    sendJson,
    sgMail,
    sha256,
    uploadScreenshotToBlob
};
