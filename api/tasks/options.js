const { handleTasksOptions } = require('../../lib/tasks-handlers');

module.exports = async (req, res) => {
    if (req.method === 'GET') return handleTasksOptions(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
