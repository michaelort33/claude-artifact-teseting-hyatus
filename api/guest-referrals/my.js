const { handleGetMyGuestReferrals } = require('../../lib/guest-referral-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetMyGuestReferrals(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
