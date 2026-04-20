const {
    getSessionUser,
    isAdmin,
    parseBody,
    pool,
    sendJson,
    sgMail
} = require('./core');

async function handleRequestProof(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        if (!process.env.SENDGRID_API_KEY) {
            return sendJson(res, 500, { error: 'Email service not configured' });
        }

        const { submission_id } = await parseBody(req);
        if (!submission_id) {
            return sendJson(res, 400, { error: 'Submission ID is required' });
        }

        const result = await pool.query('SELECT * FROM review_rewards WHERE id = $1', [submission_id]);
        if (result.rows.length === 0) {
            return sendJson(res, 404, { error: 'Submission not found' });
        }

        const submission = result.rows[0];
        const email = submission.payment_handle;
        if (!email) {
            return sendJson(res, 400, { error: 'No email address on this submission' });
        }

        const giftName = submission.payment_method === 'amazon' ? 'Amazon Gift Card' :
                         submission.payment_method === 'starbucks' ? 'Starbucks Gift Card' :
                         'Gift Card';
        const amount = parseFloat(submission.award_amount) || 10;

        await sgMail.send({
            to: email,
            from: { name: 'Hyatus Living', email: 'feedback@hyatus.com' },
            subject: 'Quick Follow-Up — We Just Need One More Thing',
            text: `Dear Friend,\n\nThank you again for submitting your feedback — we truly appreciate you taking the time!\n\nWe're getting your $${amount} ${giftName} ready, but we need a small favor first. We weren't quite able to verify your review from the information provided.\n\nCould you please reply to this email with one of the following?\n\n• A direct link to your public review (Google, TripAdvisor, Booking.com, etc.)\n• A screenshot showing the review you posted\n\nOnce we can confirm your review, we'll have your gift card on its way within 48 hours.\n\nThank you so much — we really do value your feedback!\n\nWith gratitude,\nThe Hyatus Team\nhyatus.com`,
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
                            .proof-card { background: #2d2d2d !important; border-color: #444444 !important; }
                            .proof-title { color: #D96F52 !important; }
                            .proof-item { color: #e0e0e0 !important; }
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
                        <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                        <h2 class="subheader-text" style="font-family: 'Playfair Display', Georgia, serif; color: #0F2C1F; font-size: 24px; font-weight: 400; margin: 0 0 8px 0;">Just One Quick Thing</h2>
                        <p class="muted-text" style="color: #666; font-size: 15px; margin: 0;">We need a little help verifying your review</p>
                    </div>

                    <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">Dear Friend,</p>

                    <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">Thank you again for submitting your feedback — we truly appreciate you taking the time!</p>

                    <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">We're getting your <strong>$${amount} ${giftName}</strong> ready, but we need a small favor first. We weren't quite able to verify your review from the information provided.</p>

                    <div class="proof-card" style="background: linear-gradient(135deg, #F7F3EA 0%, #EDE8DC 100%); border-radius: 16px; padding: 28px; margin: 28px 0; border: 1px solid #E5DDD3;">
                        <p class="proof-title" style="color: #0F2C1F; font-size: 15px; font-weight: 600; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Please Reply With</p>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0;">
                                    <p class="proof-item" style="color: #2A2A2A; font-size: 15px; line-height: 1.6; margin: 0;">
                                        <span style="color: #D96F52; font-weight: 600; margin-right: 8px;">①</span>
                                        A <strong>direct link</strong> to your public review<br>
                                        <span style="color: #888; font-size: 13px; margin-left: 24px;">(Google, TripAdvisor, Booking.com, etc.)</span>
                                    </p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 12px 0 0 0;">
                                    <p style="color: #888; font-size: 14px; text-align: center; margin: 0;">— or —</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0;">
                                    <p class="proof-item" style="color: #2A2A2A; font-size: 15px; line-height: 1.6; margin: 0;">
                                        <span style="color: #D96F52; font-weight: 600; margin-right: 8px;">②</span>
                                        A <strong>screenshot</strong> showing the review you posted
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div style="background: #0F2C1F; border-radius: 12px; padding: 24px; margin: 28px 0;">
                        <p style="color: #D4C5A9; font-size: 13px; font-weight: 600; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 1px;">Your Gift Is Waiting</p>
                        <p style="color: #FDFCF8; font-size: 15px; line-height: 1.6; margin: 0;">Once we can confirm your review, we'll have your <strong>$${amount} ${giftName}</strong> on its way within <strong>48 hours</strong>.</p>
                    </div>

                    <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 20px;">Thank you so much — we really do value your feedback!</p>

                    <p class="body-text" style="color: #2A2A2A; font-size: 16px; line-height: 1.7; margin-bottom: 8px;">With gratitude,</p>
                    <p class="header-text" style="color: #0F2C1F; font-size: 16px; font-weight: 600; margin: 0;">The Hyatus Team</p>

                    <div class="divider" style="border-top: 1px solid #E5DDD3; margin: 32px 0 16px 0;"></div>
                    <p class="footer-text" style="color: #999; font-size: 12px; text-align: center; margin: 0;">
                        <a href="https://hyatus.com" style="color: #999; text-decoration: none;">hyatus.com</a>
                    </p>
                </div>
                </body>
                </html>
            `,
            replyTo: { name: 'Hyatus Living', email: 'feedback@hyatus.com' }
        });

        await pool.query('UPDATE review_rewards SET followup_sent_at = NOW() WHERE id = $1', [submission_id]);

        console.log(`Follow-up proof request sent to ${email} for submission #${submission_id}`);
        sendJson(res, 200, { success: true, message: 'Follow-up email sent' });

    } catch (err) {
        console.error('Request proof error:', err);
        sendJson(res, 500, { error: 'Failed to send follow-up email' });
    }
}

async function handleSendEmail(req, res) {
    try {
        // Admin-only. Without this gate, anyone can send mail from hello@hyatus.com
        // to any address via SendGrid, burning quota and damaging sender reputation.
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        if (!process.env.SENDGRID_API_KEY) {
            return sendJson(res, 500, { error: 'Email service not configured' });
        }

        const { to, subject, html, text } = await parseBody(req);
        const recipient = to || process.env.ADMIN_EMAIL;

        if (!recipient) {
            return sendJson(res, 400, { error: 'No recipient email specified' });
        }
        if (typeof recipient !== 'string' || recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
            return sendJson(res, 400, { error: 'Invalid recipient email' });
        }

        await sgMail.send({
            to: recipient,
            from: { name: 'Hyatus Living', email: 'hello@hyatus.com' },
            subject: subject || 'A Message from Hyatus',
            text: text || '',
            html: html || text || ''
        });

        console.log(`Admin email sent by ${user.email} to ${recipient}`);
        sendJson(res, 200, { success: true, message: 'Email sent successfully' });

    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('SendGrid error:', err.message);
        sendJson(res, 500, { error: 'Failed to send email. Please try again.' });
    }
}

async function handleEmailHealth(req, res) {
    const user = await getSessionUser(req);
    if (!user) return sendJson(res, 401, { error: 'Authentication required' });
    const admin = await isAdmin(user.email);
    if (!admin) return sendJson(res, 403, { error: 'Admin access required' });
    sendJson(res, 200, {
        status: 'ok',
        sendgridConfigured: !!process.env.SENDGRID_API_KEY,
        adminEmailConfigured: !!process.env.ADMIN_EMAIL
    });
}

module.exports = {
    handleEmailHealth,
    handleRequestProof,
    handleSendEmail
};
