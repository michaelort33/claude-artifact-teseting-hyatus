const { handleGetMyReferrals } = require('../../lib/referral-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetMyReferrals(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
