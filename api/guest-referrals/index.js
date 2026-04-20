const { handleCreateGuestReferral, handleGetGuestReferrals } = require('../../lib/guest-referral-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetGuestReferrals(req, res);
    if (req.method === 'POST') return handleCreateGuestReferral(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
