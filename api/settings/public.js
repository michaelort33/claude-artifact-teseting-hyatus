const { handleGetPublicSettings } = require('../../lib/settings-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetPublicSettings(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
