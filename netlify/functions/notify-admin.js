// Netlify Function for sending admin notifications
// Uses SendGrid (you can also use Mailgun, AWS SES, etc.)

const sgMail = require('@sendgrid/mail');

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { payment_method, payment_handle, created_at } = JSON.parse(event.body);

    // Set your SendGrid API key (add to Netlify environment variables)
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const msg = {
      to: process.env.ADMIN_EMAIL, // Set in Netlify environment variables
      from: 'notifications@feedback.hyatus.com', // Must be verified in SendGrid with feedback.hyatus.com domain
      subject: 'New Review Reward Submission!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Submission Received!</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px;">
            <p><strong>Payment Method:</strong> ${payment_method.toUpperCase()}</p>
            <p><strong>Payment Handle:</strong> ${payment_handle}</p>
            <p><strong>Submitted:</strong> ${new Date(created_at).toLocaleString()}</p>
          </div>
          <p style="margin-top: 20px;">
            <a href="https://feedback.hyatus.com/admin.html" 
               style="background: #2f81f7; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              View in Admin Dashboard
            </a>
          </p>
        </div>
      `,
    };

    await sgMail.send(msg);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' }),
    };
  } catch (error) {
    console.error('Error sending email:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' }),
    };
  }
};
