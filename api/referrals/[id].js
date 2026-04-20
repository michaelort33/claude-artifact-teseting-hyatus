const { handleUpdateReferral } = require('../../lib/referral-handlers');

module.exports = async (req, res) => {
    const id = (req.query && req.query.id) || req.url.split('?')[0].split('/').filter(Boolean).pop();

    if (req.method === 'PATCH') return handleUpdateReferral(req, res, id);

    res.statusCode = 404;
    res.end('Not Found');
};
