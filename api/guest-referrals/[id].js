const { handleUpdateGuestReferral } = require('../../lib/guest-referral-handlers');

module.exports = async (req, res) => {
    const id = (req.query && req.query.id) || req.url.split('?')[0].split('/').filter(Boolean).pop();

    if (req.method === 'PATCH') return handleUpdateGuestReferral(req, res, id);

    res.statusCode = 404;
    res.end('Not Found');
};
