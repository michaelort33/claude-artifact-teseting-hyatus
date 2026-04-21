const { handleVerifyManual } = require('../../lib/reservations-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleVerifyManual(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
