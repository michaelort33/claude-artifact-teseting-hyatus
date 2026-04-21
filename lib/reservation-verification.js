const { lookupByEmail, lookupByPhone } = require('./guest-portal');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function dateOnly(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
    return trimmed.slice(0, 10);
}

function getManualVerificationInput(body) {
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const checkin = dateOnly(body.checkin || body.provided_checkin);
    const checkout = dateOnly(body.checkout || body.provided_checkout);

    if (email) {
        if (email.length > 254 || !EMAIL_RE.test(email)) return null;
        if (!checkin || !checkout) return null;
        return { type: 'email', value: email, checkin, checkout };
    }

    if (phone) {
        if (phone.length > 40) return null;
        if (!checkin || !checkout) return null;
        return { type: 'phone', value: phone, checkin, checkout };
    }

    return null;
}

async function verifyManualReservation(input) {
    if (!input) {
        return {
            attempted: false,
            status: 'unverified',
            reservationId: null,
            actualCheckin: null,
            actualCheckout: null,
            providedCheckin: null,
            providedCheckout: null
        };
    }

    const matches = input.type === 'phone'
        ? await lookupByPhone(input.value)
        : await lookupByEmail(input.value);

    const exactMatch = matches.find((reservation) => (
        reservation.reservation_id
        && dateOnly(reservation.date_from) === input.checkin
        && dateOnly(reservation.date_to) === input.checkout
    ));
    const bestReservation = exactMatch || matches[0] || null;

    return {
        attempted: true,
        status: exactMatch ? 'verified' : 'mismatch',
        reservationId: exactMatch ? String(exactMatch.reservation_id) : null,
        actualCheckin: bestReservation ? dateOnly(bestReservation.date_from) : null,
        actualCheckout: bestReservation ? dateOnly(bestReservation.date_to) : null,
        providedCheckin: input.checkin,
        providedCheckout: input.checkout
    };
}

module.exports = {
    dateOnly,
    getManualVerificationInput,
    verifyManualReservation
};
