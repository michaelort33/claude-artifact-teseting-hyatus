const { handleRequestProof } = require('../../lib/email-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleRequestProof(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
