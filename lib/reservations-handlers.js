const {
    getSessionUser,
    isAdmin,
    parseBody,
    securityHeaders,
    sendJson
} = require('./core');

const GUEST_PORTAL_API_BASE = 'https://8us502v406.execute-api.us-east-1.amazonaws.com/dev';

async function handleReservationLookup(req, res) {
    try {
        // Admin-only. Without this gate, anyone can enumerate emails against the
        // Guest Portal reservation database (privacy leak + downstream attack surface).
        const user = await getSessionUser(req);
        if (!user) return sendJson(res, 401, { error: 'Authentication required' });
        const admin = await isAdmin(user.email);
        if (!admin) return sendJson(res, 403, { error: 'Admin access required' });

        const apiKey = process.env.GUEST_PORTAL_API_KEY;
        if (!apiKey) {
            return sendJson(res, 500, { error: 'Guest Portal API key not configured' });
        }

        const body = await parseBody(req);
        if (!body.email || typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
            return sendJson(res, 400, { error: 'Valid email is required' });
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
        res.writeHead(200, { 'Content-Type': 'application/json', ...securityHeaders });
        res.end(responseText);
    } catch (err) {
        console.error('Reservation lookup error:', err);
        sendJson(res, 500, { error: 'Reservation lookup failed. Please try again.' });
    }
}

module.exports = {
    handleReservationLookup
};
