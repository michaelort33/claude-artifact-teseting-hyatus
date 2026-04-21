// Thin client for the Guest Portal reservation-lookup endpoints. All three
// share the same request/response shape:
//   Request : POST with x-api-key header + JSON body
//   Response: 200 with a JSON array of
//     { reservation_id, date_from, date_to, reservation_status }
//     sorted by date_to DESC; empty array if no match.
//
// Every helper here returns the RAW list so callers can inspect length
// (email/phone can legitimately return multiple reservations). A caller that
// only needs the most recent reservation can do `list[0]` safely.
//
// No function throws on API errors — a transient failure returns `[]` and
// logs so a blip in the Guest Portal never blocks the feedback submission.

const GUEST_PORTAL_API_BASE = 'https://8us502v406.execute-api.us-east-1.amazonaws.com/dev';

function getApiKey() {
    return process.env.GUEST_PORTAL_API_KEY || null;
}

async function callLookup(pathname, body) {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.warn(`[guest-portal] ${pathname}: GUEST_PORTAL_API_KEY not configured`);
        return [];
    }
    try {
        const res = await fetch(`${GUEST_PORTAL_API_BASE}${pathname}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            console.error(`[guest-portal] ${pathname} HTTP ${res.status}`);
            return [];
        }
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error(`[guest-portal] ${pathname} error:`, err.message);
        return [];
    }
}

function lookupByToken(token) {
    return callLookup('/reservations/id-by-token', { token });
}

function lookupByEmail(email) {
    return callLookup('/reservations/id-by-email', { email });
}

function lookupByPhone(phone) {
    return callLookup('/reservations/id-by-phone', { phone });
}

module.exports = {
    GUEST_PORTAL_API_BASE,
    lookupByToken,
    lookupByEmail,
    lookupByPhone
};
