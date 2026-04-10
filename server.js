const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const { Translate } = require('@google-cloud/translate').v2;

const PORT = 5000;
const HOST = '0.0.0.0';
const TASKS_API_BASE = 'https://api.gptpricing.com';
const GUEST_PORTAL_API_BASE = 'https://8us502v406.execute-api.us-east-1.amazonaws.com/dev';
const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 7;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('localhost');
const COOKIE_SECURE = IS_PRODUCTION ? '; Secure' : '';

const translateClient = process.env.GOOGLE_TRANSLATE 
    ? new Translate({ key: process.env.GOOGLE_TRANSLATE })
    : null;

const translationCache = new Map();
const translateRateLimit = new Map();
const TRANSLATE_RATE_LIMIT = 30;
const TRANSLATE_RATE_WINDOW = 60000;
const TRANSLATION_CACHE_MAX_SIZE = 5000;
const TRANSLATION_CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 1000;

const dbUrl = process.env.DATABASE_URL;
const dbHost = dbUrl ? new URL(dbUrl).hostname : 'unknown';
console.log('Database host:', dbHost);

const pool = new Pool({
    connectionString: dbUrl,
    ssl: dbUrl?.includes('localhost') ? false : { rejectUnauthorized: false }
});

if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}


const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.txt': 'text/plain'
};

const formRateLimit = new Map();
const FORM_RATE_LIMIT = 5;
const FORM_RATE_WINDOW = 60000;

function checkFormRateLimit(ip) {
    const now = Date.now();
    const entry = formRateLimit.get(ip);
    if (!entry) {
        formRateLimit.set(ip, { count: 1, start: now });
        return true;
    }
    if (now - entry.start > FORM_RATE_WINDOW) {
        formRateLimit.set(ip, { count: 1, start: now });
        return true;
    }
    entry.count++;
    return entry.count <= FORM_RATE_LIMIT;
}

const SUSPICIOUS_PATTERNS = [
    /(\bSELECT\b.*\bFROM\b)/i,
    /(\bINSERT\b.*\bINTO\b)/i,
    /(\bDROP\b.*\bTABLE\b)/i,
    /(\bUNION\b.*\bSELECT\b)/i,
    /(\bDELETE\b.*\bFROM\b)/i,
    /(\bUPDATE\b.*\bSET\b)/i,
    /SLEEP\s*\(/i,
    /WAITFOR\s+DELAY/i,
    /PG_SLEEP/i,
    /DBMS_PIPE/i,
    /xp_cmdshell/i,
    /BENCHMARK\s*\(/i,
    /LOAD_FILE/i,
    /INTO\s+OUTFILE/i,
    /<script[\s>]/i,
    /javascript:/i,
    /on(error|load|click|mouseover)\s*=/i,
    /\'\s*(OR|AND)\s+\d+\s*=\s*\d+/i,
    /\'\s*;\s*(DROP|SELECT|INSERT|UPDATE|DELETE)/i,
    /CHAR\s*\(\s*\d+\s*\)/i,
    /CHR\s*\(\s*\d+\s*\)/i,
    /0x[0-9a-fA-F]{6,}/,
    /\\x[0-9a-fA-F]{2}/,
    /XOR\s*\(/i,
    /\bDUAL\b/i,
    /sysdate\s*\(/i,
];

function containsSuspiciousContent(value) {
    if (typeof value !== 'string') return false;
    return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(value));
}

function sanitizeInput(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function validateFormFields(fields) {
    for (const [key, value] of Object.entries(fields)) {
        if (typeof value === 'string' && containsSuspiciousContent(value)) {
            return { valid: false, field: key };
        }
    }
    return { valid: true };
}

function getClientIp(req) {
    const socketIp = req.socket.remoteAddress;
    const isFromProxy = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp?.startsWith('10.') || socketIp?.startsWith('172.');
    if (isFromProxy) {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.headers['x-real-ip'] || 
               socketIp;
    }
    return socketIp;
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
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

async function getSessionUser(req) {
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
    try {
        const result = await pool.query('SELECT email FROM admins WHERE email = $1', [email]);
        return result.rows.length > 0;
    } catch (err) {
        console.error('Admin check error:', err);
        return false;
    }
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (err) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 
        'Content-Type': 'application/json',
        'Content-Security-Policy': 'upgrade-insecure-requests',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    });
    res.end(JSON.stringify(data));
}

async function handleSignup(req, res) {
    try {
        const { email, password } = await parseBody(req);
        
        if (!email || !password) {
            return sendJson(res, 400, { error: 'Email and password required' });
        }
        if (password.length < 8) {
            return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
        }

        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        if (existing.rows.length > 0) {
            return sendJson(res, 400, { error: 'Email already registered' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email.toLowerCase(), passwordHash]
        );

        const user = result.rows[0];
        const token = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}`
        });
        res.end(JSON.stringify({ user: { id: user.id, email: user.email } }));

    } catch (err) {
        console.error('Signup error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleSignin(req, res) {
    try {
        const { email, password } = await parseBody(req);
        
        if (!email || !password) {
            return sendJson(res, 400, { error: 'Email and password required' });
        }

        const result = await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email.toLowerCase()]);
        if (result.rows.length === 0) {
            return sendJson(res, 401, { error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return sendJson(res, 401, { error: 'Invalid email or password' });
        }

        const token = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        const admin = await isAdmin(user.email);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax${COOKIE_SECURE}; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}`
        });
        res.end(JSON.stringify({ user: { id: user.id, email: user.email, is_admin: admin } }));

    } catch (err) {
        console.error('Signin error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleSignout(req, res) {
    try {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies.session_token;

        if (sessionToken) {
            await pool.query('DELETE FROM sessions WHERE token = $1', [sessionToken]);
        }

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_token=; Path=/; HttpOnly; SameSite=Lax${COOKIE_SECURE}; Max-Age=0`
        });
        res.end(JSON.stringify({ success: true }));

    } catch (err) {
        console.error('Signout error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetSession(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 200, { user: null });
        }

        const admin = await isAdmin(user.email);
        sendJson(res, 200, { user: { id: user.id, email: user.email, is_admin: admin } });

    } catch (err) {
        console.error('Get session error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handlePasswordResetRequest(req, res) {
    try {
        const { email } = await parseBody(req);
        
        if (!email) {
            return sendJson(res, 400, { error: 'Email required' });
        }

        const result = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
        
        sendJson(res, 200, { message: 'If an account exists, a reset email will be sent' });

        if (result.rows.length > 0 && process.env.SENDGRID_API_KEY) {
            const resetToken = generateToken();
            const hashedToken = await bcrypt.hash(resetToken, SALT_ROUNDS);
            const expires = new Date(Date.now() + 60 * 60 * 1000);

            await pool.query(
                'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
                [hashedToken, expires, email.toLowerCase()]
            );

            const resetUrl = `${req.headers.origin || 'https://feedback.hyatus.com'}/?reset_token=${resetToken}`;
            
            try {
                const [response] = await sgMail.send({
                    to: email.toLowerCase(),
                    from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
                    subject: 'Your Hyatus Account - Secure Access Link',
                    text: `Hi there,\n\nWe received a request to access your Hyatus guest account. Use the secure link below to set a new password:\n\n${resetUrl}\n\nThis link is valid for the next 60 minutes.\n\nDidn't request this? No worries - simply ignore this message and your account stays safe.\n\nWarmly,\nThe Hyatus Team\nhyatus.com`,
                    html: `
                        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; margin: 0;">Hyatus</h1>
                            </div>
                            <p style="color: #2A2A2A; font-size: 16px; line-height: 1.6;">Hi there,</p>
                            <p style="color: #2A2A2A; font-size: 16px; line-height: 1.6;">We received a request to access your Hyatus guest account. Use the button below to set a new password:</p>
                            <div style="text-align: center; margin: 32px 0;">
                                <a href="${resetUrl}" style="display: inline-block; background: #0F2C1F; color: #FDFCF8; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 500;">Set New Password</a>
                            </div>
                            <p style="color: #666; font-size: 14px; line-height: 1.6;">This link is valid for the next 60 minutes.</p>
                            <p style="color: #666; font-size: 14px; line-height: 1.6;">Didn't request this? No worries - simply ignore this message and your account stays safe.</p>
                            <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;" />
                            <p style="color: #999; font-size: 13px; text-align: center;">Warmly, The Hyatus Team<br/><a href="https://hyatus.com" style="color: #D96F52;">hyatus.com</a></p>
                        </div>
                    `
                });
                console.log(`Password reset email sent to ${email} - Status: ${response.statusCode}`);
            } catch (emailErr) {
                console.error('Failed to send reset email:', JSON.stringify(emailErr.response?.body || emailErr.message || emailErr, null, 2));
            }
        } else if (result.rows.length > 0) {
            console.log('Password reset not sent - SENDGRID_API_KEY not configured');
        }

    } catch (err) {
        console.error('Password reset request error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handlePasswordReset(req, res) {
    try {
        const { token, password } = await parseBody(req);
        
        if (!token || !password) {
            return sendJson(res, 400, { error: 'Token and new password required' });
        }
        if (password.length < 8) {
            return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
        }

        const result = await pool.query(
            'SELECT id, reset_token FROM users WHERE reset_token IS NOT NULL AND reset_token_expires > NOW()'
        );

        let matchedUser = null;
        for (const user of result.rows) {
            const isValid = await bcrypt.compare(token, user.reset_token);
            if (isValid) {
                matchedUser = user;
                break;
            }
        }

        if (!matchedUser) {
            return sendJson(res, 400, { error: 'Invalid or expired reset token' });
        }

        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [passwordHash, matchedUser.id]
        );

        await pool.query('DELETE FROM sessions WHERE user_id = $1', [matchedUser.id]);

        sendJson(res, 200, { message: 'Password reset successful' });

    } catch (err) {
        console.error('Password reset error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetSubmissions(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        const payment = url.searchParams.get('payment_method');
        const search = url.searchParams.get('search');
        const page = parseInt(url.searchParams.get('page')) || 0;
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const userOnly = url.searchParams.get('user_only') === 'true';
        
        const user = await getSessionUser(req);
        console.log('Get submissions - user:', user?.email || 'none', 'userOnly:', userOnly);

        if (userOnly) {
            if (!user) {
                return sendJson(res, 401, { error: 'Authentication required' });
            }
        } else {
            if (!user) {
                console.log('No user session found');
                return sendJson(res, 401, { error: 'Authentication required' });
            }
            const admin = await isAdmin(user.email);
            console.log('Admin check for', user.email, ':', admin);
            if (!admin) {
                return sendJson(res, 403, { error: 'Admin access required' });
            }
        }

        let query = `SELECT id, payment_method, payment_handle, review_link, status, 
                     awarded_at, notes, created_at, user_id, award_amount, paid_at, previous_guest,
                     CASE WHEN screenshot_url IS NOT NULL THEN true ELSE false END as has_screenshot
                     FROM review_rewards`;
        const params = [];
        const conditions = [];

        if (userOnly && user) {
            conditions.push(`(user_id = $${params.length + 1} OR LOWER(payment_handle) = $${params.length + 2})`);
            params.push(user.id, user.email.toLowerCase());
        }

        if (status && status !== 'all') {
            if (status === 'pending') {
                conditions.push(`(status = 'pending' OR status IS NULL)`);
            } else {
                conditions.push(`status = $${params.length + 1}`);
                params.push(status);
            }
        }

        if (payment && payment !== 'all') {
            conditions.push(`payment_method = $${params.length + 1}`);
            params.push(payment);
        }

        if (search) {
            conditions.push(`LOWER(payment_handle) LIKE $${params.length + 1}`);
            params.push(`%${search.toLowerCase()}%`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC';
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, page * limit);

        const result = await pool.query(query, params);
        sendJson(res, 200, { data: result.rows });

    } catch (err) {
        console.error('Get submissions error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetSubmission(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);

        const result = await pool.query(
            'SELECT * FROM review_rewards WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Submission not found' });
        }

        const submission = result.rows[0];
        
        if (!admin && submission.user_id !== user.id && submission.payment_handle?.toLowerCase() !== user.email.toLowerCase()) {
            return sendJson(res, 403, { error: 'Access denied' });
        }

        sendJson(res, 200, { data: submission });

    } catch (err) {
        console.error('Get submission error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleCreateSubmission(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!checkFormRateLimit(clientIp)) {
            return sendJson(res, 429, { error: 'Too many submissions. Please try again later.' });
        }

        const body = await parseBody(req);

        if (body._hp_email || body.website_url || body.fax_number) {
            console.log(`Honeypot triggered on submission from ${clientIp}`);
            return sendJson(res, 200, { data: { id: 0, status: 'pending' } });
        }

        if (!body._form_token) {
            console.log(`Missing form token on submission from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid form submission. Please reload the page and try again.' });
        }
        const elapsed = Date.now() - parseInt(body._form_token, 36);
        if (isNaN(elapsed) || elapsed < 3000 || elapsed > 86400000) {
            console.log(`Speed check failed on submission from ${clientIp}`);
            return sendJson(res, 400, { error: 'Please take your time filling out the form.' });
        }

        const { payment_method, payment_handle, review_link, screenshot_url, award_amount, previous_guest } = body;

        const validation = validateFormFields({ payment_method, payment_handle, review_link, award_amount: String(award_amount || '') });
        if (!validation.valid) {
            console.log(`Suspicious content blocked in submission field "${validation.field}" from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid input detected. Please use only standard text.' });
        }

        const validMethods = ['amazon', 'starbucks', 'surprise'];
        if (payment_method && !validMethods.includes(payment_method)) {
            return sendJson(res, 400, { error: 'Invalid gift selection' });
        }

        const user = await getSessionUser(req);
        const userId = user?.id || null;

        const result = await pool.query(
            `INSERT INTO review_rewards 
             (payment_method, payment_handle, review_link, screenshot_url, status, user_id, award_amount, previous_guest)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
             RETURNING *`,
            [sanitizeInput(payment_method), sanitizeInput(payment_handle), sanitizeInput(review_link) || null, screenshot_url || null, userId, award_amount || null, previous_guest || false]
        );

        const submission = result.rows[0];

        if (process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL) {
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
                    subject: `Guest Appreciation - New ${payment_method || 'Gift'} Request`,
                    text: `A guest just submitted a thank-you gift request!\n\nGift Choice: ${payment_method || 'N/A'}\nDelivery Email: ${payment_handle || 'N/A'}\nReturning Guest: ${previous_guest ? 'Yes' : 'No'}\nSubmitted: ${new Date().toLocaleString()}\n\nView details: https://feedback.hyatus.com/admin`,
                    html: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="color-scheme" content="light dark">
                            <meta name="supported-color-schemes" content="light dark">
                            <style>
                                :root { color-scheme: light dark; }
                                @media (prefers-color-scheme: dark) {
                                    .admin-wrapper { background-color: #1a1a1a !important; }
                                    .admin-header { color: #FDFCF8 !important; }
                                    .admin-card { background: #2d2d2d !important; }
                                    .admin-title { color: #D96F52 !important; }
                                    .admin-label { color: #cccccc !important; }
                                    .admin-value { color: #e0e0e0 !important; }
                                }
                            </style>
                        </head>
                        <body style="margin: 0; padding: 0;">
                        <div class="admin-wrapper" style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #FDFCF8;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 class="admin-header" style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; margin: 0;">Hyatus</h1>
                            </div>
                            <div class="admin-card" style="background: #F7F3EA; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                                <p class="admin-title" style="color: #0F2C1F; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">New Gift Request Received</p>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr><td class="admin-label" style="color: #666; padding: 8px 0;">Gift Choice</td><td class="admin-value" style="color: #2A2A2A; font-weight: 500; text-align: right;">${payment_method || 'N/A'}</td></tr>
                                    <tr><td class="admin-label" style="color: #666; padding: 8px 0;">Delivery Email</td><td class="admin-value" style="color: #2A2A2A; font-weight: 500; text-align: right;">${payment_handle || 'N/A'}</td></tr>
                                    <tr><td class="admin-label" style="color: #666; padding: 8px 0;">Returning Guest</td><td class="admin-value" style="color: #2A2A2A; font-weight: 500; text-align: right;">${previous_guest ? 'Yes' : 'No'}</td></tr>
                                    <tr><td class="admin-label" style="color: #666; padding: 8px 0;">Submitted</td><td class="admin-value" style="color: #2A2A2A; font-weight: 500; text-align: right;">${new Date().toLocaleString()}</td></tr>
                                </table>
                            </div>
                            <div style="text-align: center;">
                                <a href="https://feedback.hyatus.com/admin" style="display: inline-block; background: #0F2C1F; color: #FDFCF8; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 500;">View in Dashboard</a>
                            </div>
                        </div>
                        </body>
                        </html>
                    `
                });
                console.log(`Admin notification email sent to ${process.env.ADMIN_EMAIL}`);
            } catch (emailErr) {
                console.error('Failed to send admin notification:', emailErr.response?.body || emailErr.message || emailErr);
            }
        } else {
            console.log('Admin email not sent - missing SENDGRID_API_KEY or ADMIN_EMAIL');
        }

        // Send thank you confirmation email to guest
        if (process.env.SENDGRID_API_KEY && payment_handle) {
            const giftName = payment_method === 'amazon' ? 'Amazon' : 
                            payment_method === 'starbucks' ? 'Starbucks' : 
                            'a surprise';
            const giftDisplay = payment_method === 'amazon' ? 'Amazon Gift Card' : 
                               payment_method === 'starbucks' ? 'Starbucks Gift Card' : 
                               'Surprise Gift Card';
            const amount = award_amount || 10;
            
            try {
                await sgMail.send({
                    to: payment_handle,
                    from: { name: 'Hyatus Living', email: 'feedback@hyatus.com' },
                    subject: `We've Received Your Request - Your ${giftDisplay} Is On Its Way!`,
                    text: `Dear Friend,\n\nThank you so much for taking the time to share your experience with us! We are truly grateful for your thoughtful feedback - it means the world to our team.\n\nGreat news: We've received your request, and your $${amount} ${giftDisplay} is on its way to your inbox!\n\nHere's what to expect:\nOur team is preparing your ${giftName} gift card now. Within 48 hours, you'll receive a separate email with your $${amount} ${giftDisplay} delivered right to this inbox (${payment_handle}).\n\nPlease keep an eye out for it - and be sure to check your spam folder just in case!\n\nFrom all of us at Hyatus, thank you for being part of our community. Your kind words and honest feedback help us continue to create wonderful experiences for guests like you.\n\nWith warmth and gratitude,\nThe Hyatus Team\nhyatus.com`,
                    html: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="color-scheme" content="light dark">
                            <meta name="supported-color-schemes" content="light dark">
                            <style>
                                :root { color-scheme: light dark; }
                                @media (prefers-color-scheme: dark) {
                                    .email-wrapper { background-color: #1a1a1a !important; }
                                    .header-text { color: #FDFCF8 !important; }
                                    .subheader-text { color: #FDFCF8 !important; }
                                    .muted-text { color: #cccccc !important; }
                                    .body-text { color: #e0e0e0 !important; }
                                    .gift-card { background: #2d2d2d !important; border-color: #444444 !important; }
                                    .gift-title { color: #D96F52 !important; }
                                    .gift-name { color: #e0e0e0 !important; }
                                    .gift-amount { color: #D96F52 !important; }
                                    .tip-box { background: #2d2d2d !important; color: #cccccc !important; }
                                    .footer-text { color: #888888 !important; }
                                    .divider { border-top-color: #444444 !important; }
                                }
                            </style>
                        </head>
                        <body style="margin: 0; padding: 0;">
                        <div class="email-wrapper" style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #FDFCF8;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 class="header-text" style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 28px; margin: 0;">Hyatus</h1>
                            </div>
                            
                            <div style="text-align: center; margin-bottom: 32px;">
                                <div style="font-size: 48px; margin-bottom: 16px;">🎁</div>
                                <h2 class="subheader-text" style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; font-weight: 400; margin: 0 0 8px 0;">We've Got Your Request!</h2>
                                <p class="muted-text" style="color: #666; font-size: 15px; margin: 0;">Your ${giftDisplay} is on its way</p>
                            </div>
                            
                            <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">Dear Friend,</p>
                            
                            <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">Thank you so much for taking the time to share your experience with us! We are truly grateful for your thoughtful feedback — it means the world to our team.</p>
                            
                            <div class="gift-card" style="background: linear-gradient(135deg, #F7F3EA 0%, #EDE8DC 100%); border-radius: 16px; padding: 28px; margin: 28px 0; border: 1px solid #E5DDD3;">
                                <p class="gift-title" style="color: #0F2C1F; font-size: 15px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Your Gift Is Coming</p>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td class="gift-name" style="color: #2A2A2A; font-size: 16px; text-align: left; vertical-align: middle;">${giftDisplay}</td>
                                        <td class="gift-amount" style="color: #0F2C1F; font-size: 24px; font-family: 'Playfair Display', Georgia, serif; font-weight: 600; text-align: right; vertical-align: middle;">$${amount}</td>
                                    </tr>
                                </table>
                            </div>
                            
                            <div style="background: #0F2C1F; border-radius: 12px; padding: 24px; margin: 28px 0;">
                                <p style="color: #D4C5A9; font-size: 13px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">What Happens Next</p>
                                <p style="color: #FDFCF8; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Our team is preparing your ${giftName} gift card now. Within <strong>48 hours</strong>, you'll receive a <strong>separate email</strong> with your <strong>$${amount} ${giftDisplay}</strong> delivered right to this inbox.</p>
                                <p style="color: #D4C5A9; font-size: 14px; line-height: 1.5; margin: 0;">📬 Sending to: <strong style="color: #FDFCF8;">${payment_handle}</strong></p>
                            </div>
                            
                            <p class="tip-box" style="color: #666; font-size: 14px; line-height: 1.6; margin-bottom: 20px; background: #F7F3EA; padding: 16px; border-radius: 8px; text-align: center;">
                                💡 <em>Tip: Keep an eye on your inbox (and check spam, just in case!)</em>
                            </p>
                            
                            <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">From all of us at Hyatus, thank you for being part of our community. Your kind words and honest feedback help us continue to create wonderful experiences for guests like you.</p>
                            
                            <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 8px;">With warmth and gratitude,</p>
                            <p class="header-text" style="color: #0F2C1F; font-size: 16px; font-weight: 600; margin: 0;">The Hyatus Team</p>
                            
                            <hr class="divider" style="border: none; border-top: 1px solid #E5DDD3; margin: 32px 0;" />
                            
                            <p class="footer-text" style="color: #999; font-size: 13px; text-align: center; line-height: 1.6;">
                                Questions? We're here to help.<br/>
                                <a href="mailto:hello@hyatus.com" style="color: #D96F52; text-decoration: none;">hello@hyatus.com</a> · <a href="https://hyatus.com" style="color: #D96F52; text-decoration: none;">hyatus.com</a>
                            </p>
                        </div>
                        </body>
                        </html>
                    `
                });
                console.log(`Thank you confirmation email sent to ${payment_handle}`);
            } catch (emailErr) {
                console.error('Failed to send guest confirmation:', emailErr.response?.body || emailErr.message || emailErr);
            }
        }

        sendJson(res, 200, { data: submission });

    } catch (err) {
        console.error('Create submission error:', err.message, err.stack);
        sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
}

async function handleUpdateSubmission(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Unauthorized' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const body = await parseBody(req);
        const { status, notes, award_amount } = body;

        const updates = [];
        const params = [];
        let paramCount = 1;

        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            params.push(status);
            if (status === 'awarded') {
                updates.push(`awarded_at = NOW()`);
            }
            if (status === 'paid') {
                updates.push(`paid_at = NOW()`);
            }
        }
        if (notes !== undefined) {
            updates.push(`notes = $${paramCount++}`);
            params.push(notes);
        }
        if (award_amount !== undefined) {
            updates.push(`award_amount = $${paramCount++}`);
            params.push(award_amount);
        }

        if (updates.length === 0) {
            return sendJson(res, 400, { error: 'No updates provided' });
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE review_rewards SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            params
        );

        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Submission not found' });
        }

        sendJson(res, 200, { data: result.rows[0] });

    } catch (err) {
        console.error('Update submission error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleCreateReferral(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!checkFormRateLimit(clientIp)) {
            return sendJson(res, 429, { error: 'Too many submissions. Please try again later.' });
        }

        const body = await parseBody(req);

        if (body._hp_email || body.website_url || body.fax_number) {
            console.log(`Honeypot triggered on referral from ${clientIp}`);
            return sendJson(res, 201, { data: { id: 0 }, message: 'Referral submitted successfully' });
        }

        if (!body._form_token) {
            console.log(`Missing form token on referral from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid form submission. Please reload the page and try again.' });
        }
        const elapsed = Date.now() - parseInt(body._form_token, 36);
        if (isNaN(elapsed) || elapsed < 3000 || elapsed > 86400000) {
            console.log(`Speed check failed on referral from ${clientIp}`);
            return sendJson(res, 400, { error: 'Please take your time filling out the form.' });
        }

        const {
            referrer_name,
            referrer_email,
            company_name,
            org_type,
            contact_name,
            contact_role,
            contact_email,
            contact_phone,
            relationship,
            notes
        } = body;

        const validation = validateFormFields({ referrer_name, referrer_email, company_name, org_type, contact_name, contact_role, contact_email, contact_phone, relationship, notes });
        if (!validation.valid) {
            console.log(`Suspicious content blocked in referral field "${validation.field}" from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid input detected. Please use only standard text.' });
        }

        if (!referrer_name || !referrer_email || !company_name || !org_type || !contact_name || !contact_email) {
            return sendJson(res, 400, { error: 'Missing required fields' });
        }

        if (referrer_name.length > 200 || company_name.length > 300 || contact_name.length > 200) {
            return sendJson(res, 400, { error: 'Input exceeds maximum length' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(referrer_email) || !emailRegex.test(contact_email)) {
            return sendJson(res, 400, { error: 'Invalid email format' });
        }

        const existingReferral = await pool.query(
            'SELECT id FROM referrals WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))',
            [company_name]
        );

        if (existingReferral.rows.length > 0) {
            return sendJson(res, 400, { error: 'This company has already been referred by another user' });
        }

        const approvedCount = await pool.query(
            `SELECT COUNT(*) FROM referrals 
             WHERE LOWER(referrer_email) = LOWER($1) 
             AND (status = 'approved' OR reward_paid = true)`,
            [referrer_email]
        );

        if (parseInt(approvedCount.rows[0].count) >= 5) {
            return sendJson(res, 400, { error: 'You have reached the maximum of 5 approved referrals' });
        }

        const result = await pool.query(
            `INSERT INTO referrals (referrer_name, referrer_email, company_name, org_type, contact_name, contact_role, contact_email, contact_phone, relationship, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [sanitizeInput(referrer_name), sanitizeInput(referrer_email), sanitizeInput(company_name), sanitizeInput(org_type), sanitizeInput(contact_name), sanitizeInput(contact_role) || null, sanitizeInput(contact_email), sanitizeInput(contact_phone) || null, sanitizeInput(relationship) || null, sanitizeInput(notes) || null]
        );

        const referral = result.rows[0];

        if (process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL) {
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Connect', email: 'hello@hyatus.com' },
                    subject: `New Referral: ${company_name} (${org_type})`,
                    text: `New referral submitted!\n\nReferrer: ${referrer_name} (${referrer_email})\n\nCompany: ${company_name}\nType: ${org_type}\n\nContact: ${contact_name}\nRole: ${contact_role || 'Not specified'}\nEmail: ${contact_email}\nPhone: ${contact_phone || 'Not provided'}\n\nRelationship: ${relationship || 'Not specified'}\nNotes: ${notes || 'None'}`,
                    html: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="color-scheme" content="light dark">
                            <meta name="supported-color-schemes" content="light dark">
                        </head>
                        <body style="margin: 0; padding: 0;">
                        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #FDFCF8;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; margin: 0;">Hyatus Connect</h1>
                            </div>
                            <div style="background: linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%); border: 1px solid #FCD34D; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                                <p style="color: #92400E; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">New Referral Received</p>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr><td style="color: #666; padding: 8px 0;">Company</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${company_name}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Type</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${org_type}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Contact</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${contact_name}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Contact Email</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${contact_email}</td></tr>
                                </table>
                            </div>
                            <div style="background: #F7F3EA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                                <p style="color: #0F2C1F; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Referred By</p>
                                <p style="color: #2A2A2A; font-size: 15px; margin: 0;">${referrer_name} (${referrer_email})</p>
                                ${relationship ? `<p style="color: #666; font-size: 13px; margin: 8px 0 0 0;">Relationship: ${relationship}</p>` : ''}
                            </div>
                            ${notes ? `<div style="background: #F7F3EA; border-radius: 12px; padding: 20px; margin-bottom: 24px;"><p style="color: #0F2C1F; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Notes</p><p style="color: #2A2A2A; font-size: 14px; margin: 0; line-height: 1.6;">${notes}</p></div>` : ''}
                        </div>
                        </body>
                        </html>
                    `
                });
                console.log('Referral notification email sent');
            } catch (emailErr) {
                console.error('Failed to send referral notification:', emailErr.response?.body || emailErr.message || emailErr);
            }
        }

        sendJson(res, 201, { data: referral, message: 'Referral submitted successfully' });

    } catch (err) {
        console.error('Create referral error:', err.message, err.stack);
        sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
    }
}

const DEFAULT_REFERRAL_REWARD = 250;
const MAX_REFERRAL_EARNINGS = 1000;

async function handleGetMyReferrals(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const referralsResult = await pool.query(
            `SELECT id, company_name, org_type, status, approved_reward_amount, created_at, approved_at
             FROM referrals
             WHERE LOWER(referrer_email) = LOWER($1)
             ORDER BY created_at DESC`,
            [user.email]
        );

        const referrals = referralsResult.rows;

        const totalSubmitted = referrals.length;
        const approvedReferrals = referrals.filter(r => r.status === 'approved' || r.status === 'paid');
        const totalApproved = approvedReferrals.length;
        const totalEarnings = approvedReferrals.reduce((sum, r) => sum + (parseFloat(r.approved_reward_amount) || 0), 0);
        const remainingEligible = Math.max(0, MAX_REFERRAL_EARNINGS - totalEarnings);

        sendJson(res, 200, {
            data: {
                summary: {
                    total_submitted: totalSubmitted,
                    total_approved: totalApproved,
                    total_earnings: totalEarnings,
                    remaining_eligible: remainingEligible
                },
                referrals: referrals
            }
        });

    } catch (err) {
        console.error('Get my referrals error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetReferrals(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query = 'SELECT * FROM referrals';
        const params = [];

        if (status) {
            query += ' WHERE status = $1';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC';
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        const countQuery = status 
            ? 'SELECT COUNT(*) FROM referrals WHERE status = $1'
            : 'SELECT COUNT(*) FROM referrals';
        const countParams = status ? [status] : [];
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count);

        sendJson(res, 200, {
            data: result.rows,
            pagination: {
                total,
                limit,
                offset
            }
        });

    } catch (err) {
        console.error('Get referrals error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleUpdateReferral(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const existingResult = await pool.query('SELECT * FROM referrals WHERE id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return sendJson(res, 404, { error: 'Referral not found' });
        }

        const existing = existingResult.rows[0];
        const body = await parseBody(req);
        const { status, approved_reward_amount, admin_notes } = body;

        const updates = ['updated_at = NOW()'];
        const params = [];
        let paramCount = 1;

        if (admin_notes !== undefined) {
            updates.push(`admin_notes = $${paramCount++}`);
            params.push(admin_notes);
        }

        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            params.push(status);

            if (status === 'approved' && existing.status !== 'approved') {
                updates.push('approved_at = NOW()');

                const approvedCountResult = await pool.query(
                    `SELECT COUNT(*) FROM referrals 
                     WHERE LOWER(referrer_email) = LOWER($1) 
                     AND status IN ('approved', 'paid')
                     AND id != $2`,
                    [existing.referrer_email, id]
                );
                const approvedCount = parseInt(approvedCountResult.rows[0].count);

                if (approvedCount >= 4) {
                    updates.push(`approved_reward_amount = $${paramCount++}`);
                    params.push(0);
                    const capNote = 'User has reached the maximum of 4 paid referrals ($1000 cap). No reward for this referral.';
                    const existingNotes = admin_notes !== undefined ? admin_notes : (existing.admin_notes || '');
                    const newNotes = existingNotes ? `${existingNotes}\n${capNote}` : capNote;
                    const noteIndex = updates.findIndex(u => u.startsWith('admin_notes'));
                    if (noteIndex !== -1) {
                        params[noteIndex] = newNotes;
                    } else {
                        updates.push(`admin_notes = $${paramCount++}`);
                        params.push(newNotes);
                    }
                } else {
                    const rewardAmount = approved_reward_amount !== undefined ? approved_reward_amount : DEFAULT_REFERRAL_REWARD;
                    updates.push(`approved_reward_amount = $${paramCount++}`);
                    params.push(rewardAmount);
                }
            } else if (approved_reward_amount !== undefined) {
                updates.push(`approved_reward_amount = $${paramCount++}`);
                params.push(approved_reward_amount);
            }

            if (status === 'paid' && existing.status !== 'paid') {
                updates.push('paid_at = NOW()');
            }
        } else if (approved_reward_amount !== undefined) {
            updates.push(`approved_reward_amount = $${paramCount++}`);
            params.push(approved_reward_amount);
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE referrals SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            params
        );

        sendJson(res, 200, { data: result.rows[0] });

    } catch (err) {
        console.error('Update referral error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetSettings(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const result = await pool.query('SELECT key, value, description FROM settings ORDER BY key');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = { value: row.value, description: row.description };
        });
        
        sendJson(res, 200, { data: settings });
    } catch (err) {
        console.error('Get settings error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleUpdateSettings(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const body = await parseBody(req);
        const updates = [];
        
        for (const [key, value] of Object.entries(body)) {
            await pool.query(
                'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
                [String(value), key]
            );
            updates.push(key);
        }
        
        sendJson(res, 200, { success: true, updated: updates });
    } catch (err) {
        console.error('Update settings error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetPublicSettings(req, res) {
    try {
        const result = await pool.query(
            "SELECT key, value FROM settings WHERE key IN ('company_referral_reward', 'company_referral_max', 'guest_referral_reward', 'guest_referral_max')"
        );
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        
        sendJson(res, 200, settings);
    } catch (err) {
        console.error('Get public settings error:', err);
        sendJson(res, 200, {
            company_referral_reward: '250',
            company_referral_max: '5',
            guest_referral_reward: '50',
            guest_referral_max: '10'
        });
    }
}

async function handleGetMyGuestReferrals(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const result = await pool.query(
            `SELECT * FROM guest_referrals WHERE LOWER(referrer_email) = LOWER($1) ORDER BY created_at DESC`,
            [user.email]
        );

        const referrals = result.rows;
        const approved = referrals.filter(r => r.status === 'approved' || r.status === 'paid').length;
        const totalEarned = referrals.reduce((sum, r) => {
            if ((r.status === 'approved' || r.status === 'paid') && r.approved_reward_amount) {
                return sum + parseFloat(r.approved_reward_amount);
            }
            return sum;
        }, 0);

        sendJson(res, 200, {
            data: referrals,
            summary: {
                total: referrals.length,
                approved,
                total_earned: totalEarned
            }
        });
    } catch (err) {
        console.error('Get my guest referrals error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetGuestReferrals(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        
        let query = 'SELECT * FROM guest_referrals';
        const params = [];
        
        if (status && status !== 'all') {
            query += ' WHERE status = $1';
            params.push(status);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        sendJson(res, 200, { data: result.rows });
    } catch (err) {
        console.error('Get guest referrals error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleCreateGuestReferral(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!checkFormRateLimit(clientIp)) {
            return sendJson(res, 429, { error: 'Too many submissions. Please try again later.' });
        }

        const body = await parseBody(req);

        if (body._hp_email || body.website_url || body.fax_number) {
            console.log(`Honeypot triggered on guest referral from ${clientIp}`);
            return sendJson(res, 201, { data: { id: 0 } });
        }

        if (!body._form_token) {
            console.log(`Missing form token on guest referral from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid form submission. Please reload the page and try again.' });
        }
        const grElapsed = Date.now() - parseInt(body._form_token, 36);
        if (isNaN(grElapsed) || grElapsed < 3000 || grElapsed > 86400000) {
            console.log(`Speed check failed on guest referral from ${clientIp}`);
            return sendJson(res, 400, { error: 'Please take your time filling out the form.' });
        }

        const { referrer_name, referrer_email, friend_name, friend_email, friend_phone, city, timeframe, notes } = body;

        const validation = validateFormFields({ referrer_name, referrer_email, friend_name, friend_email, friend_phone, city, timeframe, notes });
        if (!validation.valid) {
            console.log(`Suspicious content blocked in guest referral field "${validation.field}" from ${clientIp}`);
            return sendJson(res, 400, { error: 'Invalid input detected. Please use only standard text.' });
        }

        if (!referrer_name || !referrer_email || !friend_name || !friend_email) {
            return sendJson(res, 400, { error: 'Missing required fields' });
        }

        if (referrer_name.length > 200 || friend_name.length > 200) {
            return sendJson(res, 400, { error: 'Input exceeds maximum length' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(referrer_email) || !emailRegex.test(friend_email)) {
            return sendJson(res, 400, { error: 'Invalid email format' });
        }

        const existingReferral = await pool.query(
            'SELECT id FROM guest_referrals WHERE LOWER(TRIM(friend_email)) = LOWER(TRIM($1))',
            [friend_email]
        );

        if (existingReferral.rows.length > 0) {
            return sendJson(res, 400, { error: 'This person has already been referred' });
        }

        const maxResult = await pool.query("SELECT value FROM settings WHERE key = 'guest_referral_max'");
        const maxReferrals = parseInt(maxResult.rows[0]?.value || '10');

        const countResult = await pool.query(
            'SELECT COUNT(*) FROM guest_referrals WHERE LOWER(referrer_email) = LOWER($1)',
            [referrer_email]
        );

        if (parseInt(countResult.rows[0].count) >= maxReferrals) {
            return sendJson(res, 400, { error: `You have reached the maximum of ${maxReferrals} referrals` });
        }

        const result = await pool.query(
            `INSERT INTO guest_referrals (referrer_name, referrer_email, friend_name, friend_email, friend_phone, city, timeframe, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [sanitizeInput(referrer_name), sanitizeInput(referrer_email), sanitizeInput(friend_name), sanitizeInput(friend_email), sanitizeInput(friend_phone) || null, sanitizeInput(city) || null, sanitizeInput(timeframe) || null, sanitizeInput(notes) || null]
        );

        if (process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL) {
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Referrals', email: 'hello@hyatus.com' },
                    subject: `New Guest Referral: ${friend_name}`,
                    text: `New guest referral submitted!\n\nReferrer: ${referrer_name} (${referrer_email})\n\nFriend: ${friend_name}\nEmail: ${friend_email}\nPhone: ${friend_phone || 'Not provided'}\nCity: ${city || 'Not specified'}\nTimeframe: ${timeframe || 'Not specified'}\n\nNotes: ${notes || 'None'}`
                });
            } catch (emailErr) {
                console.error('Failed to send admin notification:', emailErr);
            }
        }

        sendJson(res, 201, { data: result.rows[0] });
    } catch (err) {
        console.error('Create guest referral error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleUpdateGuestReferral(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }

        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const existingResult = await pool.query('SELECT * FROM guest_referrals WHERE id = $1', [id]);
        if (existingResult.rows.length === 0) {
            return sendJson(res, 404, { error: 'Referral not found' });
        }

        const existing = existingResult.rows[0];
        const body = await parseBody(req);
        const { status, approved_reward_amount, admin_notes } = body;

        const updates = ['updated_at = NOW()'];
        const params = [];
        let paramCount = 1;

        if (admin_notes !== undefined) {
            updates.push(`admin_notes = $${paramCount++}`);
            params.push(admin_notes);
        }

        if (status !== undefined) {
            updates.push(`status = $${paramCount++}`);
            params.push(status);

            if (status === 'approved' && existing.status !== 'approved') {
                const rewardResult = await pool.query("SELECT value FROM settings WHERE key = 'guest_referral_reward'");
                const rewardAmount = approved_reward_amount !== undefined ? approved_reward_amount : parseFloat(rewardResult.rows[0]?.value || '50');
                updates.push(`approved_reward_amount = $${paramCount++}`);
                params.push(rewardAmount);
            } else if (approved_reward_amount !== undefined) {
                updates.push(`approved_reward_amount = $${paramCount++}`);
                params.push(approved_reward_amount);
            }

            if (status === 'paid' && existing.status !== 'paid') {
                updates.push('paid_at = NOW()');
            }
        } else if (approved_reward_amount !== undefined) {
            updates.push(`approved_reward_amount = $${paramCount++}`);
            params.push(approved_reward_amount);
        }

        params.push(id);
        const result = await pool.query(
            `UPDATE guest_referrals SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            params
        );

        sendJson(res, 200, { data: result.rows[0] });
    } catch (err) {
        console.error('Update guest referral error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

function getTasksApiKey() {
    const apiKey = process.env.GPTGPTBACKEND_X_API_KEY;
    if (!apiKey) {
        throw new Error('Tasks API key not configured (GPTGPTBACKEND_X_API_KEY)');
    }
    return apiKey;
}

async function handleReservationLookup(req, res) {
    try {
        const apiKey = process.env.GUEST_PORTAL_API_KEY;
        if (!apiKey) {
            return sendJson(res, 500, { error: 'Guest Portal API key not configured' });
        }

        const body = await parseBody(req);
        if (!body.email) {
            return sendJson(res, 400, { error: 'Email is required' });
        }

        const response = await fetch(`${GUEST_PORTAL_API_BASE}/reservations/id-by-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({ email: body.email })
        });

        const responseText = await response.text();
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            data = { raw: responseText };
        }

        if (!response.ok) {
            console.error('Reservation lookup failed:', response.status, data);
            return sendJson(res, 502, { error: 'Reservation lookup failed. Please try again.' });
        }

        // API returns string | null directly
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseText);
    } catch (err) {
        console.error('Reservation lookup error:', err);
        sendJson(res, 500, { error: 'Reservation lookup failed. Please try again.' });
    }
}

async function handleTasksApi(req, res) {
    let body = null;
    let submissionId = null;
    
    try {
        body = await parseBody(req);
        
        if (body.external_id && body.external_id.startsWith('reward-')) {
            submissionId = parseInt(body.external_id.replace('reward-', ''), 10) || null;
        }
        
        const apiKey = getTasksApiKey();
        
        const response = await fetch(`${TASKS_API_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const responseText = await response.text();
        let responsePayload = null;
        try {
            responsePayload = JSON.parse(responseText);
        } catch (e) {
            responsePayload = { raw: responseText };
        }
        
        if (!response.ok) {
            const isDuplicate = responseText.includes('uniq_external_id_subcategory');
            const status = isDuplicate ? 'duplicate' : 'error';
            const errorMessage = isDuplicate ? 'Duplicate external_id' : `Task API error: ${response.status}`;
            
            try {
                await pool.query(
                    `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status, error_message)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [submissionId, body, responsePayload, status, response.status, errorMessage]
                );
            } catch (logErr) {
                console.error('Failed to log task API call:', logErr);
            }
            
            if (isDuplicate) {
                return sendJson(res, 200, { duplicate: true });
            }
            return sendJson(res, 502, { error: 'Failed to create task. Please try again.' });
        }

        try {
            await pool.query(
                `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status)
                 VALUES ($1, $2, $3, $4, $5)`,
                [submissionId, body, responsePayload, 'success', response.status]
            );
        } catch (logErr) {
            console.error('Failed to log task API call:', logErr);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseText);

    } catch (err) {
        console.error('Task API error:', err);
        
        try {
            await pool.query(
                `INSERT INTO task_logs (submission_id, request_payload, response_payload, status, http_status, error_message)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [submissionId, body, null, 'error', null, err.message]
            );
        } catch (logErr) {
            console.error('Failed to log task API error:', logErr);
        }
        
        sendJson(res, 500, { error: 'Failed to create task. Please try again.' });
    }
}

async function handleGetTaskLogs(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }
        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        const status = url.searchParams.get('status');
        const submissionId = url.searchParams.get('submission_id');
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        let query = `
            SELECT tl.id, tl.submission_id, tl.request_payload, tl.response_payload, 
                   tl.status, tl.http_status, tl.error_message, tl.created_at,
                   rr.payment_handle
            FROM task_logs tl
            LEFT JOIN review_rewards rr ON tl.submission_id = rr.id
        `;
        const params = [];
        const conditions = [];

        if (status) {
            conditions.push(`tl.status = $${params.length + 1}`);
            params.push(status);
        }
        if (submissionId) {
            conditions.push(`tl.submission_id = $${params.length + 1}`);
            params.push(parseInt(submissionId, 10));
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM');
        const countResult = await pool.query(countQuery, params);
        const total = parseInt(countResult.rows[0].count, 10);

        query += ' ORDER BY tl.created_at DESC';
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        sendJson(res, 200, { data: { logs: result.rows, total } });

    } catch (err) {
        console.error('Get task logs error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleGetTaskLog(req, res, id) {
    try {
        const user = await getSessionUser(req);
        if (!user) {
            return sendJson(res, 401, { error: 'Authentication required' });
        }
        const admin = await isAdmin(user.email);
        if (!admin) {
            return sendJson(res, 403, { error: 'Admin access required' });
        }

        const result = await pool.query(`
            SELECT tl.id, tl.submission_id, tl.request_payload, tl.response_payload, 
                   tl.status, tl.http_status, tl.error_message, tl.created_at,
                   rr.payment_handle
            FROM task_logs tl
            LEFT JOIN review_rewards rr ON tl.submission_id = rr.id
            WHERE tl.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Task log not found' });
        }

        sendJson(res, 200, { data: result.rows[0] });

    } catch (err) {
        console.error('Get task log error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

function handleTasksHealth(req, res) {
    const hasApiKey = !!process.env.GPTGPTBACKEND_X_API_KEY;
    sendJson(res, 200, { status: 'ok', tasksApiConfigured: hasApiKey });
}

async function handleTasksOptions(req, res) {
    try {
        const apiKey = getTasksApiKey();
        
        const response = await fetch(`${TASKS_API_BASE}/tasks/options/dropdown`, {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Tasks options API error:', response.status, errorText);
            return sendJson(res, 502, { error: 'Failed to load task options. Please try again.' });
        }

        const options = await response.json();
        sendJson(res, 200, options);
    } catch (err) {
        console.error('Tasks options error:', err);
        sendJson(res, 500, { error: 'Failed to load task options. Please try again.' });
    }
}

async function handleSendEmail(req, res) {
    try {
        if (!process.env.SENDGRID_API_KEY) {
            return sendJson(res, 500, { error: 'SendGrid API key not configured' });
        }

        const { to, subject, html, text } = await parseBody(req);
        const recipient = to || process.env.ADMIN_EMAIL;
        
        if (!recipient) {
            return sendJson(res, 400, { error: 'No recipient email specified' });
        }

        await sgMail.send({
            to: recipient,
            from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
            subject: subject || 'A Message from Hyatus',
            text: text || '',
            html: html || text || ''
        });
        
        console.log(`Email sent to ${recipient}: ${subject}`);
        sendJson(res, 200, { success: true, message: 'Email sent successfully' });
        
    } catch (err) {
        console.error('SendGrid error:', err);
        console.error('Email send error details:', err.message);
        sendJson(res, 500, { error: 'Failed to send email. Please try again.' });
    }
}

function handleEmailHealth(req, res) {
    sendJson(res, 200, { 
        status: 'ok', 
        sendgridConfigured: !!process.env.SENDGRID_API_KEY,
        adminEmailConfigured: !!process.env.ADMIN_EMAIL
    });
}

function getClientIP(req) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}

function cleanupRateLimitMap() {
    const now = Date.now();
    const windowStart = now - TRANSLATE_RATE_WINDOW;
    for (const [ip, requests] of translateRateLimit.entries()) {
        const validRequests = requests.filter(t => t > windowStart);
        if (validRequests.length === 0) {
            translateRateLimit.delete(ip);
        } else {
            translateRateLimit.set(ip, validRequests);
        }
    }
}

setInterval(cleanupRateLimitMap, TRANSLATE_RATE_WINDOW);

function checkTranslateRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - TRANSLATE_RATE_WINDOW;
    
    if (!translateRateLimit.has(ip)) {
        translateRateLimit.set(ip, []);
    }
    
    const requests = translateRateLimit.get(ip).filter(t => t > windowStart);
    translateRateLimit.set(ip, requests);
    
    if (requests.length >= TRANSLATE_RATE_LIMIT) {
        return false;
    }
    
    requests.push(now);
    return true;
}

function evictOldCacheEntries() {
    if (translationCache.size > TRANSLATION_CACHE_MAX_SIZE) {
        const entriesToDelete = translationCache.size - Math.floor(TRANSLATION_CACHE_MAX_SIZE * 0.8);
        let deleted = 0;
        for (const key of translationCache.keys()) {
            if (deleted >= entriesToDelete) break;
            translationCache.delete(key);
            deleted++;
        }
    }
}

async function handleTranslate(req, res) {
    try {
        if (!translateClient) {
            return sendJson(res, 500, { error: 'Translation service not configured' });
        }

        const clientIP = getClientIP(req);
        if (!checkTranslateRateLimit(clientIP)) {
            return sendJson(res, 429, { error: 'Rate limit exceeded. Please try again later.' });
        }

        const { texts, targetLang, sourceLang } = await parseBody(req);
        
        if (!texts || !Array.isArray(texts) || texts.length === 0) {
            return sendJson(res, 400, { error: 'texts array is required' });
        }
        if (!targetLang) {
            return sendJson(res, 400, { error: 'targetLang is required' });
        }
        if (texts.length > 100) {
            return sendJson(res, 400, { error: 'Maximum 100 texts per request' });
        }
        
        for (const text of texts) {
            if (typeof text !== 'string' || text.length > MAX_TEXT_LENGTH) {
                return sendJson(res, 400, { error: `Each text must be a string under ${MAX_TEXT_LENGTH} characters` });
            }
        }

        const results = [];
        const textsToTranslate = [];
        const textsToTranslateIndices = [];

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${text}`;
            
            if (translationCache.has(cacheKey)) {
                results[i] = translationCache.get(cacheKey);
            } else {
                textsToTranslate.push(text);
                textsToTranslateIndices.push(i);
            }
        }

        if (textsToTranslate.length > 0) {
            const options = sourceLang 
                ? { from: sourceLang, to: targetLang }
                : targetLang;
            
            const [translations] = await translateClient.translate(textsToTranslate, options);
            const translatedArray = Array.isArray(translations) ? translations : [translations];
            
            for (let j = 0; j < translatedArray.length; j++) {
                const originalIndex = textsToTranslateIndices[j];
                const originalText = textsToTranslate[j];
                const translatedText = translatedArray[j];
                const cacheKey = `${sourceLang || 'auto'}:${targetLang}:${originalText}`;
                
                translationCache.set(cacheKey, translatedText);
                results[originalIndex] = translatedText;
            }
            
            evictOldCacheEntries();
        }

        sendJson(res, 200, { translations: results });
        
    } catch (err) {
        console.error('Translation error:', err);
        console.error('Translation error details:', err.message);
        sendJson(res, 500, { error: 'Translation failed. Please try again.' });
    }
}

function handleTranslateHealth(req, res) {
    sendJson(res, 200, { 
        status: 'ok', 
        configured: !!translateClient,
        cacheSize: translationCache.size
    });
}

const securityHeaders = {
    'Content-Security-Policy': "upgrade-insecure-requests",
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
};

function serveStaticFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html', ...securityHeaders });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500, securityHeaders);
                res.end('Server Error', 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                ...securityHeaders
            });
            res.end(content, 'utf-8');
        }
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;
    const method = req.method;

    if (pathname === '/api/auth/signup' && method === 'POST') {
        return handleSignup(req, res);
    }
    if (pathname === '/api/auth/signin' && method === 'POST') {
        return handleSignin(req, res);
    }
    if (pathname === '/api/auth/signout' && method === 'POST') {
        return handleSignout(req, res);
    }
    if (pathname === '/api/auth/session' && method === 'GET') {
        return handleGetSession(req, res);
    }
    if (pathname === '/api/auth/reset-password-request' && method === 'POST') {
        return handlePasswordResetRequest(req, res);
    }
    if (pathname === '/api/auth/reset-password' && method === 'POST') {
        return handlePasswordReset(req, res);
    }

    if (pathname === '/api/submissions' && method === 'GET') {
        return handleGetSubmissions(req, res);
    }
    if (pathname === '/api/submissions' && method === 'POST') {
        return handleCreateSubmission(req, res);
    }
    
    const submissionMatch = pathname.match(/^\/api\/submissions\/(\d+)$/);
    if (submissionMatch) {
        const id = submissionMatch[1];
        if (method === 'GET') {
            return handleGetSubmission(req, res, id);
        }
        if (method === 'PATCH') {
            return handleUpdateSubmission(req, res, id);
        }
    }

    if (pathname === '/api/tasks' && method === 'POST') {
        return handleTasksApi(req, res);
    }
    if (pathname === '/api/tasks/health' && method === 'GET') {
        return handleTasksHealth(req, res);
    }
    if (pathname === '/api/tasks/options' && method === 'GET') {
        return handleTasksOptions(req, res);
    }
    if (pathname === '/api/reservations/lookup-by-email' && method === 'POST') {
        return handleReservationLookup(req, res);
    }
    if (pathname === '/api/task-logs' && method === 'GET') {
        return handleGetTaskLogs(req, res);
    }
    
    const taskLogMatch = pathname.match(/^\/api\/task-logs\/(\d+)$/);
    if (taskLogMatch && method === 'GET') {
        return handleGetTaskLog(req, res, taskLogMatch[1]);
    }

    if (pathname === '/api/email/send' && method === 'POST') {
        return handleSendEmail(req, res);
    }
    if (pathname === '/api/email/health' && method === 'GET') {
        return handleEmailHealth(req, res);
    }

    if (pathname === '/api/translate' && method === 'POST') {
        return handleTranslate(req, res);
    }
    if (pathname === '/api/translate/health' && method === 'GET') {
        return handleTranslateHealth(req, res);
    }

    if (pathname === '/api/referrals/my' && method === 'GET') {
        return handleGetMyReferrals(req, res);
    }
    if (pathname === '/api/referrals' && method === 'GET') {
        return handleGetReferrals(req, res);
    }
    if (pathname === '/api/referrals' && method === 'POST') {
        return handleCreateReferral(req, res);
    }

    const referralMatch = pathname.match(/^\/api\/referrals\/(\d+)$/);
    if (referralMatch) {
        const id = referralMatch[1];
        if (method === 'PATCH') {
            return handleUpdateReferral(req, res, id);
        }
    }

    if (pathname === '/api/settings' && method === 'GET') {
        return handleGetSettings(req, res);
    }
    if (pathname === '/api/settings' && method === 'PATCH') {
        return handleUpdateSettings(req, res);
    }
    if (pathname === '/api/settings/public' && method === 'GET') {
        return handleGetPublicSettings(req, res);
    }

    if (pathname === '/api/guest-referrals/my' && method === 'GET') {
        return handleGetMyGuestReferrals(req, res);
    }
    if (pathname === '/api/guest-referrals' && method === 'GET') {
        return handleGetGuestReferrals(req, res);
    }
    if (pathname === '/api/guest-referrals' && method === 'POST') {
        return handleCreateGuestReferral(req, res);
    }
    const guestReferralMatch = pathname.match(/^\/api\/guest-referrals\/(\d+)$/);
    if (guestReferralMatch) {
        const id = guestReferralMatch[1];
        if (method === 'PATCH') {
            return handleUpdateGuestReferral(req, res, id);
        }
    }

    let filePath = '.' + pathname;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    // Clean URL routing - serve HTML files without .html extension
    if (pathname === '/admin') {
        filePath = './admin.html';
    } else if (pathname === '/referral') {
        filePath = './referral.html';
    } else if (pathname === '/guest-referral') {
        filePath = './guest-referral.html';
    }
    
    // Redirect .html URLs to clean versions (optional but professional)
    if (pathname.endsWith('.html') && pathname !== '/index.html') {
        const cleanPath = pathname.replace('.html', '');
        res.writeHead(301, { 'Location': cleanPath });
        return res.end();
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, HOST, async () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Database configured: ${!!process.env.DATABASE_URL}`);
    console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
    console.log(`Admin email configured: ${!!process.env.ADMIN_EMAIL}`);
    console.log(`Translation API configured: ${!!translateClient}`);

    if (process.env.DATABASE_URL) {
        try {
            const tables = ['review_rewards', 'referrals', 'guest_referrals', 'users', 'sessions', 'task_logs'];
            for (const table of tables) {
                try {
                    await pool.query(`SELECT setval('${table}_id_seq', COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)`);
                } catch (e) {}
            }
            console.log('Primary key sequences synchronized');
        } catch (err) {
            console.error('Failed to sync sequences:', err.message);
        }
    }
});
