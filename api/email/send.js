const { handleSendEmail } = require('../../lib/email-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleSendEmail(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
