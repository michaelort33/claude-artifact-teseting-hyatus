const { handleGetSubmission, handleUpdateSubmission } = require('../../lib/submission-handlers');

module.exports = async (req, res) => {
    const id = (req.query && req.query.id) || req.url.split('?')[0].split('/').filter(Boolean).pop();

    if (req.method === 'GET') return handleGetSubmission(req, res, id);
    if (req.method === 'PATCH') return handleUpdateSubmission(req, res, id);

    res.statusCode = 404;
    res.end('Not Found');
};
