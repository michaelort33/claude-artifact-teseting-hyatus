const { handleTranslate } = require('../../lib/translate-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleTranslate(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
