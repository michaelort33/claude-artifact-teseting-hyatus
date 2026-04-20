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
    sgMail
} = require('./core');

async function handleCreateReferral(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!(await checkFormRateLimit(clientIp))) {
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

        if (!referrer_name || !referrer_email || !company_name || !org_type || !contact_name || !contact_email) {
            return sendJson(res, 400, { error: 'Missing required fields' });
        }

        const stringFields = { referrer_name, referrer_email, company_name, org_type, contact_name, contact_email };
        for (const [k, v] of Object.entries(stringFields)) {
            if (typeof v !== 'string') return sendJson(res, 400, { error: `Invalid ${k}` });
        }
        if (referrer_name.length > 200 || company_name.length > 300 || contact_name.length > 200) {
            return sendJson(res, 400, { error: 'Input exceeds maximum length' });
        }
        if (notes && (typeof notes !== 'string' || notes.length > 2000)) {
            return sendJson(res, 400, { error: 'Notes exceed maximum length' });
        }
        if (relationship && (typeof relationship !== 'string' || relationship.length > 500)) {
            return sendJson(res, 400, { error: 'Relationship exceeds maximum length' });
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
            // Every ${…} interpolation MUST be escapeHtml'd — the admin inbox receives
            // HTML rendered as-is. Without escaping, submitters can inject phishing <a>,
            // <style>, <img> tags that render inside a trusted Hyatus email template.
            // Plain-text `subject` and `text` fields are not HTML but avoid newline
            // injection by trimming CR/LF.
            const stripCtl = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 500);
            const eSubject = `New Referral: ${stripCtl(company_name)} (${stripCtl(org_type)})`;
            const eCompany = escapeHtml(company_name);
            const eOrgType = escapeHtml(org_type);
            const eContact = escapeHtml(contact_name);
            const eContactEmail = escapeHtml(contact_email);
            const eReferrer = escapeHtml(referrer_name);
            const eReferrerEmail = escapeHtml(referrer_email);
            const eRelationship = escapeHtml(relationship);
            const eNotes = escapeHtml(notes);
            try {
                await sgMail.send({
                    to: process.env.ADMIN_EMAIL,
                    from: { name: 'Hyatus Connect', email: 'hello@hyatus.com' },
                    subject: eSubject,
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
                                    <tr><td style="color: #666; padding: 8px 0;">Company</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${eCompany}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Type</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${eOrgType}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Contact</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${eContact}</td></tr>
                                    <tr><td style="color: #666; padding: 8px 0;">Contact Email</td><td style="color: #2A2A2A; font-weight: 500; text-align: right;">${eContactEmail}</td></tr>
                                </table>
                            </div>
                            <div style="background: #F7F3EA; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                                <p style="color: #0F2C1F; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Referred By</p>
                                <p style="color: #2A2A2A; font-size: 15px; margin: 0;">${eReferrer} (${eReferrerEmail})</p>
                                ${eRelationship ? `<p style="color: #666; font-size: 13px; margin: 8px 0 0 0;">Relationship: ${eRelationship}</p>` : ''}
                            </div>
                            ${eNotes ? `<div style="background: #F7F3EA; border-radius: 12px; padding: 20px; margin-bottom: 24px;"><p style="color: #0F2C1F; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Notes</p><p style="color: #2A2A2A; font-size: 14px; margin: 0; line-height: 1.6;">${eNotes}</p></div>` : ''}
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

module.exports = {
    handleCreateReferral,
    handleGetMyReferrals,
    handleGetReferrals,
    handleUpdateReferral
};
