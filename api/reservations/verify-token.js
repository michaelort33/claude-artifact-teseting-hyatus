const { handleVerifyToken } = require('../../lib/reservations-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleVerifyToken(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
