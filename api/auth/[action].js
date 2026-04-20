const {
    handleGetSession,
    handlePasswordReset,
    handlePasswordResetRequest,
    handleSignin,
    handleSignout,
    handleSignup
} = require('../../lib/auth-handlers');

module.exports = async (req, res) => {
    const action = (req.query && req.query.action) || req.url.split('?')[0].split('/').filter(Boolean).pop();

    if (action === 'signup' && req.method === 'POST') return handleSignup(req, res);
    if (action === 'signin' && req.method === 'POST') return handleSignin(req, res);
    if (action === 'signout' && req.method === 'POST') return handleSignout(req, res);
    if (action === 'session' && req.method === 'GET') return handleGetSession(req, res);
    if (action === 'reset-password-request' && req.method === 'POST') return handlePasswordResetRequest(req, res);
    if (action === 'reset-password' && req.method === 'POST') return handlePasswordReset(req, res);

    res.statusCode = 404;
    res.end('Not Found');
};
