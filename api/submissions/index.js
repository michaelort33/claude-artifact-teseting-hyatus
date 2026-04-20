const { handleCreateSubmission, handleGetSubmissions } = require('../../lib/submission-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetSubmissions(req, res);
    if (req.method === 'POST') return handleCreateSubmission(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
