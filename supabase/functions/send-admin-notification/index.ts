// @ts-ignore - Deno imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - Deno ESM imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore - Deno global
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// @ts-ignore - Deno global
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')

serve(async (req) => {
    // Get the origin from the request
    const origin = req.headers.get('origin') || '*';
    
    // Define allowed origins
    const allowedOrigins = [
        'https://feedback.hyatus.com',
        'http://localhost:8000',
        'http://localhost:3000',
        'https://merry-monstera-b43126.netlify.app'
    ];
    
    // Check if the origin is allowed
    const corsOrigin = allowedOrigins.includes(origin) ? origin : 'https://feedback.hyatus.com';
    
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                'Access-Control-Allow-Credentials': 'true',
            },
        })
    }

    let record;
    try {
        const body = await req.json();
        record = body.record;
        console.log('Received request from origin:', origin);
        console.log('Processing submission:', record);
    } catch (error) {
        console.error('Error parsing request body:', error);
        return new Response(JSON.stringify({ error: 'Invalid request body' }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Credentials': 'true',
            },
        })
    }

    if (!RESEND_API_KEY || !ADMIN_EMAIL) {
        return new Response('Missing RESEND_API_KEY or ADMIN_EMAIL', {
            status: 500,
            headers: {
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Credentials': 'true',
                'Content-Type': 'application/json',
            },
        })
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
                from: 'Review Rewards <onboarding@resend.dev>',
                to: [ADMIN_EMAIL],
                subject: 'New Review Reward Submission!',
                html: `
                    <h2>New Submission Received</h2>
                    <p><strong>Payment Method:</strong> ${record.payment_method}</p>
                    <p><strong>Payment Handle:</strong> ${record.payment_handle}</p>
                    <p><strong>Submitted:</strong> ${new Date(record.created_at).toLocaleString()}</p>
                    <p><a href="https://feedback.hyatus.com/admin.html">View in Admin Dashboard</a></p>
                `,
            }),
        })

        const data = await res.json()
        console.log('Email sent successfully:', data);
        
        if (!res.ok) {
            console.error('Resend API error:', data);
        }
        
        return new Response(JSON.stringify(data), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Credentials': 'true',
            },
        })
    } catch (error) {
        console.error('Error sending email:', error);
        return new Response(JSON.stringify({ error: 'Failed to send email' }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': corsOrigin,
                'Access-Control-Allow-Credentials': 'true',
            },
        })
    }
})
