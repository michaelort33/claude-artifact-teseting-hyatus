const {
    bcrypt,
    checkFormRateLimit,
    COOKIE_SECURE,
    DEV_ADMIN_COOKIE,
    DEV_ADMIN_EMAIL,
    DEV_ADMIN_LOGIN_ENABLED,
    DEV_ADMIN_TOKEN,
    escapeHtml,
    generateToken,
    getClientIp,
    getSessionUser,
    isLocalRequest,
    isAdmin,
    parseBody,
    pool,
    SALT_ROUNDS,
    securityHeaders,
    sendJson,
    SESSION_EXPIRY_DAYS,
    sgMail,
    sha256
} = require('./core');

const RESET_URL_ORIGIN = 'https://feedback.hyatus.com';
const AUTH_RATE = { namespace: 'auth', limit: 10, windowMs: 60000 };
// Dummy bcrypt hash — valid format, but will never match a real password.
// Used to keep signin response time constant when the account doesn't exist.
const DUMMY_BCRYPT = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Bt6nD2Mv/IKqv4g2F1JJzQZX.6Ab.';
const RESET_TTL_MS = 60 * 60 * 1000;

async function enforceAuthRateLimit(req, res) {
    const ip = getClientIp(req);
    if (!(await checkFormRateLimit(ip, AUTH_RATE))) {
        sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
        return false;
    }
    return true;
}

async function handleSignup(req, res) {
    try {
        if (!(await enforceAuthRateLimit(req, res))) return;
        const { email, password } = await parseBody(req);

        if (!email || !password) {
            return sendJson(res, 400, { error: 'Email and password required' });
        }
        if (password.length < 8) {
            return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
        }
        if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, { error: 'Invalid email' });
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
            'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax${COOKIE_SECURE}; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}`,
            ...securityHeaders
        });
        res.end(JSON.stringify({ user: { id: user.id, email: user.email } }));
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Signup error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleSignin(req, res) {
    try {
        if (!(await enforceAuthRateLimit(req, res))) return;
        const { email, password } = await parseBody(req);

        if (!email || !password) {
            return sendJson(res, 400, { error: 'Email and password required' });
        }

        const result = await pool.query(
            'SELECT id, email, password_hash FROM users WHERE email = $1',
            [typeof email === 'string' ? email.toLowerCase() : '']
        );

        // Always run a bcrypt compare so response time does not reveal whether the email exists.
        let validPassword = false;
        if (result.rows.length === 0) {
            await bcrypt.compare(password, DUMMY_BCRYPT);
        } else {
            validPassword = await bcrypt.compare(password, result.rows[0].password_hash);
        }
        if (!validPassword) {
            return sendJson(res, 401, { error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const token = generateToken();
        const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        await pool.query(
            'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
            [user.id, token, expiresAt]
        );

        const admin = await isAdmin(user.email);

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': `session_token=${token}; Path=/; HttpOnly; SameSite=Lax${COOKIE_SECURE}; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}`,
            ...securityHeaders
        });
        res.end(JSON.stringify({ user: { id: user.id, email: user.email, is_admin: admin } }));
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Signin error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handleDevAdminSignin(req, res) {
    if (!DEV_ADMIN_LOGIN_ENABLED || !isLocalRequest(req)) {
        return sendJson(res, 404, { error: 'Not found' });
    }

    const { token } = await parseBody(req);
    if (!DEV_ADMIN_TOKEN || token !== DEV_ADMIN_TOKEN) {
        return sendJson(res, 401, { error: 'Invalid dev admin token' });
    }

    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `${DEV_ADMIN_COOKIE}=${DEV_ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_EXPIRY_DAYS * 24 * 60 * 60}`,
        ...securityHeaders
    });
    res.end(JSON.stringify({ user: { id: 0, email: DEV_ADMIN_EMAIL, is_admin: true } }));
}

async function handleSignout(req, res) {
    try {
        const sessionToken = req.headers.cookie
            ?.split(';')
            .map(cookie => cookie.trim())
            .find(cookie => cookie.startsWith('session_token='))
            ?.split('=')[1];

        if (sessionToken) {
            await pool.query('DELETE FROM sessions WHERE token = $1', [sessionToken]);
        }

        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': [
                `session_token=; Path=/; HttpOnly; SameSite=Lax${COOKIE_SECURE}; Max-Age=0`,
                `${DEV_ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
            ],
            ...securityHeaders
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
        if (!(await enforceAuthRateLimit(req, res))) return;
        const { email } = await parseBody(req);

        if (!email) {
            return sendJson(res, 400, { error: 'Email required' });
        }

        const result = await pool.query('SELECT id FROM users WHERE email = $1', [typeof email === 'string' ? email.toLowerCase() : '']);
        sendJson(res, 200, { message: 'If an account exists, a reset email will be sent' });

        if (result.rows.length > 0 && process.env.SENDGRID_API_KEY) {
            const resetToken = generateToken();
            const hashedToken = sha256(resetToken);
            const expires = new Date(Date.now() + RESET_TTL_MS);

            await pool.query(
                'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE email = $3',
                [hashedToken, expires, email.toLowerCase()]
            );

            // ORIGIN is hard-coded — never trust request headers here (prevents host-header
            // injection where attackers could redirect the reset link to their own domain).
            const resetUrl = `${RESET_URL_ORIGIN}/?reset_token=${encodeURIComponent(resetToken)}`;
            const safeUrl = escapeHtml(resetUrl);

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
                                <a href="${safeUrl}" style="display: inline-block; background: #0F2C1F; color: #FDFCF8; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 500;">Set New Password</a>
                            </div>
                            <p style="color: #666; font-size: 14px; line-height: 1.6;">This link is valid for the next 60 minutes.</p>
                            <p style="color: #666; font-size: 14px; line-height: 1.6;">Didn't request this? No worries - simply ignore this message and your account stays safe.</p>
                        </div>
                    `
                });
                console.log(`Password reset email sent - Status: ${response.statusCode}`);
            } catch (emailErr) {
                console.error('Failed to send reset email:', emailErr.message || emailErr);
            }
        }
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Password reset request error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

async function handlePasswordReset(req, res) {
    try {
        if (!(await enforceAuthRateLimit(req, res))) return;
        const { token, password } = await parseBody(req);

        if (!token || !password) {
            return sendJson(res, 400, { error: 'Token and new password required' });
        }
        if (password.length < 8) {
            return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
        }
        if (typeof token !== 'string' || token.length > 256) {
            return sendJson(res, 400, { error: 'Invalid token' });
        }

        // Direct index lookup instead of scanning all unexpired rows and bcrypt-comparing each.
        const hashedInput = sha256(token);
        const result = await pool.query(
            'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [hashedInput]
        );

        if (result.rows.length === 0) {
            return sendJson(res, 400, { error: 'Invalid or expired reset token' });
        }

        const matchedUser = result.rows[0];
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        await pool.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
            [passwordHash, matchedUser.id]
        );

        await pool.query('DELETE FROM sessions WHERE user_id = $1', [matchedUser.id]);
        sendJson(res, 200, { message: 'Password reset successful' });
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Password reset error:', err);
        sendJson(res, 500, { error: 'Server error' });
    }
}

module.exports = {
    handleDevAdminSignin,
    handleGetSession,
    handlePasswordReset,
    handlePasswordResetRequest,
    handleSignin,
    handleSignout,
    handleSignup
};
