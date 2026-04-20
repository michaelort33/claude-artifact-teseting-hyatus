const { handleTasksApi } = require('../../lib/tasks-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleTasksApi(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
