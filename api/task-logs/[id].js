const { handleGetTaskLog } = require('../../lib/tasks-handlers');

module.exports = async (req, res) => {
    const id = (req.query && req.query.id) || req.url.split('?')[0].split('/').filter(Boolean).pop();

    if (req.method === 'GET') return handleGetTaskLog(req, res, id);

    res.statusCode = 404;
    res.end('Not Found');
};
