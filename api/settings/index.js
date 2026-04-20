const { handleGetSettings, handleUpdateSettings } = require('../../lib/settings-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetSettings(req, res);
    if (req.method === 'PATCH') return handleUpdateSettings(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
