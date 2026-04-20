const {
    checkFormRateLimit,
    getClientIp,
    getSessionUser,
    isAdmin,
    parseBody,
    pool,
    sanitizeInput,
    sendJson,
    sgMail
} = require('./core');

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
        if (!(await checkFormRateLimit(clientIp))) {
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

        if (!referrer_name || !referrer_email || !friend_name || !friend_email) {
            return sendJson(res, 400, { error: 'Missing required fields' });
        }

        const required = { referrer_name, referrer_email, friend_name, friend_email };
        for (const [k, v] of Object.entries(required)) {
            if (typeof v !== 'string') return sendJson(res, 400, { error: `Invalid ${k}` });
        }
        if (referrer_name.length > 200 || friend_name.length > 200) {
            return sendJson(res, 400, { error: 'Input exceeds maximum length' });
        }
        if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
            return sendJson(res, 400, { error: 'Notes exceed maximum length' });
        }
        for (const [k, v] of Object.entries({ friend_phone, city, timeframe })) {
            if (v && (typeof v !== 'string' || v.length > 200)) {
                return sendJson(res, 400, { error: `Invalid ${k}` });
            }
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
                // Strip CR/LF from subject line to block header injection.
                const subjectSafe = `New Guest Referral: ${String(friend_name || '').replace(/[\r\n]+/g, ' ').slice(0, 200)}`;
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Referrals', email: 'hello@hyatus.com' },
                    subject: subjectSafe,
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

module.exports = {
    handleCreateGuestReferral,
    handleGetGuestReferrals,
    handleGetMyGuestReferrals,
    handleUpdateGuestReferral
};
