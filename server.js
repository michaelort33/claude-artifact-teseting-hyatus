const http = require('http');
const fs = require('fs');
const path = require('path');
const sgMail = require('@sendgrid/mail');

const PORT = 5000;
const HOST = '0.0.0.0';
const TASKS_API_BASE = 'https://api.gptpricing.com';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

let cachedToken = null;
let tokenExpiry = null;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
};

async function getTasksApiToken() {
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const email = process.env.TASKS_API_EMAIL;
    const password = process.env.TASKS_API_PASSWORD;

    if (!email || !password) {
        throw new Error('Task API credentials not configured');
    }

    const response = await fetch(`${TASKS_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Auth failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    cachedToken = data.data?.access_token || data.access_token;
    tokenExpiry = Date.now() + (55 * 60 * 1000);
    return cachedToken;
}

async function handleTasksApi(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
        try {
            const token = await getTasksApiToken();
            const payload = JSON.parse(body);
            
            const response = await fetch(`${TASKS_API_BASE}/tasks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const responseText = await response.text();
            
            res.setHeader('Content-Type', 'application/json');
            
            if (!response.ok) {
                if (responseText.includes('uniq_external_id_subcategory')) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ duplicate: true }));
                    return;
                }
                res.writeHead(response.status);
                res.end(JSON.stringify({ 
                    error: `Task API error: ${response.status}`,
                    details: responseText 
                }));
                return;
            }

            res.writeHead(200);
            res.end(responseText);
        } catch (error) {
            console.error('Task API error:', error);
            res.writeHead(500);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
        }
    });
}

function handleTasksHealth(req, res) {
    const hasCredentials = !!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        status: 'ok', 
        tasksApiConfigured: hasCredentials 
    }));
}

async function handleSendEmail(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
        try {
            if (!process.env.SENDGRID_API_KEY) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'SendGrid API key not configured' }));
                return;
            }

            const payload = JSON.parse(body);
            const { to, subject, html, text } = payload;
            
            const adminEmail = process.env.ADMIN_EMAIL;
            const recipient = to || adminEmail;
            
            if (!recipient) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No recipient email specified' }));
                return;
            }

            const msg = {
                to: recipient,
                from: 'feedback@hyatus.com',
                subject: subject || 'Review Rewards Notification',
                text: text || '',
                html: html || text || ''
            };

            await sgMail.send(msg);
            
            console.log(`Email sent to ${recipient}: ${subject}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Email sent successfully' }));
            
        } catch (error) {
            console.error('SendGrid error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to send email',
                details: error.message 
            }));
        }
    });
}

async function handleAdminNotification(req, res) {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', async () => {
        try {
            if (!process.env.SENDGRID_API_KEY || !process.env.ADMIN_EMAIL) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'SendGrid or Admin email not configured' }));
                return;
            }

            const { record } = JSON.parse(body);
            
            const msg = {
                to: process.env.ADMIN_EMAIL,
                from: 'feedback@hyatus.com',
                subject: 'New Review Reward Submission!',
                html: `
                    <h2>New Submission Received</h2>
                    <p><strong>Reward Choice:</strong> ${record.payment_method || 'N/A'}</p>
                    <p><strong>Delivery Email:</strong> ${record.payment_handle || 'N/A'}</p>
                    <p><strong>Previous Guest:</strong> ${record.previous_guest ? 'Yes' : 'No'}</p>
                    <p><strong>Submitted:</strong> ${new Date(record.created_at).toLocaleString()}</p>
                    <p><a href="https://feedback.hyatus.com/admin.html">View in Admin Dashboard</a></p>
                `
            };

            await sgMail.send(msg);
            
            console.log(`Admin notification sent for submission: ${record.id || 'new'}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            
        } catch (error) {
            console.error('Admin notification error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                error: 'Failed to send admin notification',
                details: error.message 
            }));
        }
    });
}

function handleEmailHealth(req, res) {
    const hasConfig = !!(process.env.SENDGRID_API_KEY && process.env.ADMIN_EMAIL);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
        status: 'ok', 
        sendgridConfigured: !!process.env.SENDGRID_API_KEY,
        adminEmailConfigured: !!process.env.ADMIN_EMAIL
    }));
}

function serveStaticFile(filePath, res) {
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Task API endpoints
    if (url.pathname === '/api/tasks' && req.method === 'POST') {
        handleTasksApi(req, res);
        return;
    }
    
    if (url.pathname === '/api/tasks/health' && req.method === 'GET') {
        handleTasksHealth(req, res);
        return;
    }
    
    // Email API endpoints
    if (url.pathname === '/api/email/send' && req.method === 'POST') {
        handleSendEmail(req, res);
        return;
    }
    
    if (url.pathname === '/api/email/admin-notification' && req.method === 'POST') {
        handleAdminNotification(req, res);
        return;
    }
    
    if (url.pathname === '/api/email/health' && req.method === 'GET') {
        handleEmailHealth(req, res);
        return;
    }
    
    let filePath = '.' + url.pathname;
    if (filePath === './') {
        filePath = './index.html';
    }
    
    serveStaticFile(filePath, res);
});

server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Tasks API configured: ${!!(process.env.TASKS_API_EMAIL && process.env.TASKS_API_PASSWORD)}`);
    console.log(`SendGrid configured: ${!!process.env.SENDGRID_API_KEY}`);
    console.log(`Admin email configured: ${!!process.env.ADMIN_EMAIL}`);
});
