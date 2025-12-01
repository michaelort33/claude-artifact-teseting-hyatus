const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');

const PORT = 5000;
const HOST = '0.0.0.0';
const TASKS_API_BASE = 'https://api.gptpricing.com';
const SALT_ROUNDS = 10;
const SESSION_EXPIRY_DAYS = 7;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.includes('localhost');
const COOKIE_SECURE = IS_PRODUCTION ? '; Secure' : '';

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

let cachedToken = null;
let tokenExpiry = null;

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
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
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
        const body = await parseBody(req);
        const { payment_method, payment_handle, review_link, screenshot_url, award_amount, previous_guest } = body;

        const user = await getSessionUser(req);
        const userId = user?.id || null;

        const result = await pool.query(
            `INSERT INTO review_rewards 
             (payment_method, payment_handle, review_link, screenshot_url, status, user_id, award_amount, previous_guest)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
             RETURNING *`,
            [payment_method, payment_handle, review_link || null, screenshot_url || null, userId, award_amount || null, previous_guest || false]
        );

        const submission = result.rows[0];

        if (process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL) {
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
                    subject: `Guest Appreciation - New ${payment_method || 'Gift'} Request`,
                    text: `A guest just submitted a thank-you gift request!\n\nGift Choice: ${payment_method || 'N/A'}\nDelivery Email: ${payment_handle || 'N/A'}\nReturning Guest: ${previous_guest ? 'Yes' : 'No'}\nSubmitted: ${new Date().toLocaleString()}\n\nView details: https://feedback.hyatus.com/admin.html`,
                    html: `
                        <div style="font-family: Inter, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
                            <div style="text-align: center; margin-bottom: 32px;">
                                <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; margin: 0;">Hyatus</h1>
                            </div>
                            <div style="background: #F7F3EA; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                                <p style="color: #0F2C1F; font-size: 18px; font-weight: 600; margin: 0 0 16px 0;">New Gift Request Received</p>
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr><td style="color: #666; padding: 8px 0;">Gift Choice</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${payment_method || 'N/A'}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Delivery Email</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${payment_handle || 'N/A'}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Returning Guest</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${previous_guest ? 'Yes' : 'No'}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Submitted</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${new Date().toLocaleString()}</td></tr>
                                </table>
                            </div>
                            <div style="text-align: center;">
                                <a href="https://feedback.hyatus.com/admin.html" style="display: inline-block; background: #0F2C1F; color: #FDFCF8; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 500;">View in Dashboard</a>
                            </div>
                        </div>
                    `
                });
                console.log(`Admin notification email sent to ${process.env.ADMIN_EMAIL}`);
            } catch (emailErr) {
                console.error('Failed to send admin notification:', emailErr.response?.body || emailErr.message || emailErr);
            }
        } else {
            console.log('Admin email not sent - missing SENDGRID_API_KEY or ADMIN_EMAIL');
        }

        sendJson(res, 200, { data: submission });

    } catch (err) {
        console.error('Create submission error:', err.message, err.stack);
        sendJson(res, 500, { error: 'Server error: ' + err.message });
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

async function getTasksApiToken() {
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const email = process.env.TASKS_API_EMAIL;
    const password = process.env.TASKS_API_PASSWORD;

    if (!email || !password) {
        throw new Error('Task API credentials not configured');
    }

    const response = await fetch(`${TASKS_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Auth failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.data?.access_token || data.access_token;
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    return cachedToken;
}

async function handleTasksApi(req, res) {
    try {
        const body = await parseBody(req);
        const token = await getTasksApiToken();
        
        const response = await fetch(`${TASKS_API_BASE}/tasks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const responseText = await response.text();
        
        if (!response.ok) {
            if (responseText.includes('uniq_external_id_subcategory')) {
                return sendJson(res, 200, { duplicate: true });
            }
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: `Task API error: ${response.status}`,
                details: responseText 
            }));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(responseText);

    } catch (err) {
        console.error('Task API error:', err);
        sendJson(res, 500, { error: err.message });
    }
}

function handleTasksHealth(req, res) {
    const hasCredentials = !!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD);
    sendJson(res, 200, { status: 'ok', tasksApiConfigured: hasCredentials });
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
        sendJson(res, 500, { error: 'Failed to send email', details: err.message });
    }
}

function handleEmailHealth(req, res) {
    sendJson(res, 200, { 
        status: 'ok', 
        sendgridConfigured: !!process.env.SENDGRID_API_KEY,
        adminEmailConfigured: !!process.env.ADMIN_EMAIL
    });
}

function serveStaticFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
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

    if (pathname === '/api/email/send' && method === 'POST') {
        return handleSendEmail(req, res);
    }
    if (pathname === '/api/email/health' && method === 'GET') {
        return handleEmailHealth(req, res);
    }

    let filePath = '.' + pathname;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Database configured: ${!!process.env.DATABASE_URL}`);
    console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
    console.log(`SendGrid configured: ${!!process.env.SENDGRID_API_KEY}`);
    console.log(`Admin email configured: ${!!process.env.ADMIN_EMAIL}`);
});
