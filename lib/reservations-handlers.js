const {
    checkFormRateLimit,
    getClientIp,
    getSessionUser,
    isAdmin,
    parseBody,
    securityHeaders,
    sendJson
} = require('./core');
const { lookupByEmail, lookupByToken } = require('./guest-portal');
const { getManualVerificationInput, verifyManualReservation } = require('./reservation-verification');

const VERIFY_RATE = { namespace: 'resv-verify', limit: 5, windowMs: 60000 };
const MANUAL_VERIFY_RATE = { namespace: 'resv-manual', limit: 5, windowMs: 60000 };

// Admin-only email proxy. Without this gate, anyone can enumerate emails
// against the Guest Portal reservation database.
async function handleReservationLookup(req, res) {
    try {
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        const body = await parseBody(req);
        if (!body.email || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
            return sendJson(res, 400, { error: 'Valid email is required' });
        }

        // API returns a list of {reservation_id, date_from, date_to, reservation_status}
        // sorted by date_to DESC. Proxied through to the admin UI verbatim.
        const reservations = await lookupByEmail(body.email);
        res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
        res.end(JSON.stringify(reservations));
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Reservation lookup error:', err);
        sendJson(res, 500, { error: 'Reservation lookup failed. Please try again.' });
    }
}

// Public, anonymous pre-verification for the token fast-path. The page JS
// calls this on load when ?token=X is in the URL to decide whether to show
// or hide the manual verification fallback.
//
// Response is intentionally minimal — { verified: true|false } — so that
// the endpoint cannot be used as a richer oracle than the token already is.
// Rate-limited aggressively because tokens are long random strings: any
// legitimate user only needs one lookup per page load.
async function handleVerifyToken(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!(await checkFormRateLimit(clientIp, VERIFY_RATE))) {
            return sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
        }

        const body = await parseBody(req);
        const token = body && typeof body.token === 'string' ? body.token.trim() : '';
        if (!token || token.length > 200) {
            return sendJson(res, 200, { verified: false });
        }

        const reservations = await lookupByToken(token);
        const verified = reservations.length > 0 && !!reservations[0].reservation_id;
        sendJson(res, 200, { verified });
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Verify token error:', err);
        // Fail closed — if we can't determine, say "not verified" so the user
        // is offered the manual path.
        sendJson(res, 200, { verified: false });
    }
}

// Public manual fallback. It intentionally returns the same body for matches,
// mismatches, malformed input, and Guest Portal misses so the endpoint cannot
// be used to enumerate reservation data.
async function handleVerifyManual(req, res) {
    try {
        const clientIp = getClientIp(req);
        if (!(await checkFormRateLimit(clientIp, MANUAL_VERIFY_RATE))) {
            return sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
        }

        const body = await parseBody(req);
        const input = getManualVerificationInput(body || {});
        await verifyManualReservation(input);
        sendJson(res, 200, { ok: true });
    } catch (err) {
        if (err.statusCode === 413) return sendJson(res, 413, { error: 'Request too large' });
        console.error('Manual verification error:', err);
        sendJson(res, 200, { ok: true });
    }
}

module.exports = {
    handleReservationLookup,
    handleVerifyManual,
    handleVerifyToken
};
