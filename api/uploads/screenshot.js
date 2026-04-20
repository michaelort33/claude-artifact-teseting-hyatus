const { handleScreenshotUpload } = require('../../lib/submission-handlers');

module.exports = async (req, res) => {
    if (req.method === 'POST') return handleScreenshotUpload(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
