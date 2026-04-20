const { handleEmailHealth } = require('../../lib/email-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleEmailHealth(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
