const {
    checkFormRateLimit,
    escapeHtml,
    getClientIp,
    getSessionUser,
    isAdmin,
    parseBody,
    pool,
    sanitizeInput,
    sendJson,
    sgMail,
    uploadScreenshotToBlob
} = require('./core');

const GUEST_PORTAL_API_BASE = 'https://8us502v406.execute-api.us-east-1.amazonaws.com/dev';
const VALID_PAYMENT_METHODS = ['amazon', 'starbucks', 'surprise'];

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

        if (userOnly) {
            if (!user) {
                return sendJson(res, 401, { error: 'Authentication required' });
            }
        } else {
            if (!user) {
                return sendJson(res, 401, { error: 'Authentication required' });
            }
            const admin = await isAdmin(user.email);
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
            // Ownership is verified by user_id only. Matching on payment_handle would be
            // an IDOR because signup does not verify email ownership — an attacker could
            // register victim@x.com and claim all submissions paid to that address.
            conditions.push(`user_id = $${params.length + 1}`);
            params.push(user.id);
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
        const result = await pool.query('SELECT * FROM review_rewards WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Submission not found' });
        }

        const submission = result.rows[0];
        if (!admin && submission.user_id !== user.id) {
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
        if (!(await checkFormRateLimit(clientIp))) {
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

        if (payment_method && !VALID_PAYMENT_METHODS.includes(payment_method)) {
            return sendJson(res, 400, { error: 'Invalid gift selection' });
        }

        // payment_handle becomes the SendGrid `to:` on the confirmation email.
        // Validate it to avoid turning the form into an open mail relay.
        if (!payment_handle || typeof payment_handle !== 'string' || payment_handle.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payment_handle)) {
            return sendJson(res, 400, { error: 'Please provide a valid email address' });
        }
        if (review_link && (typeof review_link !== 'string' || review_link.length > 2000 || !/^https?:\/\//i.test(review_link))) {
            return sendJson(res, 400, { error: 'Review link must be a valid URL' });
        }

        const user = await getSessionUser(req);
        const userId = user?.id || null;

        let reservationId = null;
        if (payment_handle) {
            try {
                const apiKey = process.env.GUEST_PORTAL_API_KEY;
                if (apiKey) {
                    const lookupRes = await fetch(`${GUEST_PORTAL_API_BASE}/reservations/id-by-email`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
                        body: JSON.stringify({ email: payment_handle })
                    });
                    if (lookupRes.ok) {
                        const lookupData = await lookupRes.json();
                        // New list shape: [{reservation_id, date_from, date_to, reservation_status}, ...]
                        // sorted by date_to DESC. Take the most recent reservation for this email.
                        if (Array.isArray(lookupData) && lookupData.length > 0 && lookupData[0].reservation_id) {
                            reservationId = String(lookupData[0].reservation_id);
                        }
                    }
                }
            } catch (e) {
                console.error('Reservation lookup during submission:', e.message);
            }
        }

        const result = await pool.query(
            `INSERT INTO review_rewards
             (payment_method, payment_handle, review_link, screenshot_url, status, user_id, award_amount, previous_guest, reservation_id)
             VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8)
             RETURNING *`,
            [sanitizeInput(payment_method), sanitizeInput(payment_handle), sanitizeInput(review_link) || null, screenshot_url || null, userId, award_amount || null, previous_guest || false, reservationId]
        );

        const submission = result.rows[0];

        if (process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL) {
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
                    subject: `Guest Appreciation - New ${payment_method || 'Gift'} Request`,
                    text: `A guest just submitted a thank-you gift request!\n\nGift Choice: ${payment_method || 'N/A'}\nDelivery Email: ${payment_handle || 'N/A'}\nReturning Guest: ${previous_guest ? 'Yes' : 'No'}\nSubmitted: ${new Date().toLocaleString()}\n\nView details: https://feedback.hyatus.com/admin`
                });
            } catch (emailErr) {
                console.error('Failed to send admin notification:', emailErr.response?.body || emailErr.message || emailErr);
            }
        }

        if (process.env.SENDGRID_API_KEY && payment_handle) {
            const giftName = payment_method === 'amazon' ? 'Amazon' : payment_method === 'starbucks' ? 'Starbucks' : 'a surprise';
            const giftDisplay = payment_method === 'amazon' ? 'Amazon Gift Card' : payment_method === 'starbucks' ? 'Starbucks Gift Card' : 'Surprise Gift Card';
            const amount = award_amount || 10;

            try {
                await sgMail.send({
                    to: payment_handle,
                    from: { name: 'Hyatus Living', email: 'feedback@hyatus.com' },
                    subject: `We've Received Your Request - Your ${giftDisplay} Is On Its Way!`,
                    text: `Dear Friend,\n\nThank you so much for taking the time to share your experience with us!\n\nWithin 48 hours, you'll receive your $${amount} ${giftDisplay} at ${payment_handle}.`
                });
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

async function handleScreenshotUpload(req, res) {
    // Endpoint is intentionally anonymous (submission flow runs before signup), so every
    // defense-in-depth layer matters: rate limit, MIME magic-byte check, size cap, safe
    // filename, generic error. See core.js parseDataUrl + uploadScreenshotToBlob.
    try {
        const clientIp = getClientIp(req);
        if (!(await checkFormRateLimit(clientIp, { namespace: 'upload', limit: 10, windowMs: 60000 }))) {
            return sendJson(res, 429, { error: 'Too many uploads. Please try again later.' });
        }

        const { fileData, filename } = await parseBody(req);
        if (!fileData) {
            return sendJson(res, 400, { error: 'fileData is required' });
        }

        const blob = await uploadScreenshotToBlob(fileData, filename || 'screenshot');
        sendJson(res, 200, { url: blob.url });
    } catch (err) {
        // Preserve explicit 4xx from parseDataUrl/parseBody (size/type/format). Everything
        // else collapses to a generic 500 — never leak Blob SDK error internals to clients.
        if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
            return sendJson(res, err.statusCode, { error: err.message });
        }
        console.error('Screenshot upload error:', err.message);
        sendJson(res, 500, { error: 'Upload failed' });
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
            if (status === 'awarded') updates.push('awarded_at = NOW()');
            if (status === 'paid') updates.push('paid_at = NOW()');
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

module.exports = {
    handleCreateSubmission,
    handleGetSubmission,
    handleGetSubmissions,
    handleScreenshotUpload,
    handleUpdateSubmission
};
