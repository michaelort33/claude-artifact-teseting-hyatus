const { handleTranslateHealth } = require('../../lib/translate-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleTranslateHealth(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
