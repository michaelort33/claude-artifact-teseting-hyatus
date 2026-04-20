const { handleGetTaskLogs } = require('../../lib/tasks-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleGetTaskLogs(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
