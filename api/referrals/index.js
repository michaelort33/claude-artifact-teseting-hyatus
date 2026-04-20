const { handleCreateReferral, handleGetReferrals } = require('../../lib/referral-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetReferrals(req, res);
    if (req.method === 'POST') return handleCreateReferral(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
