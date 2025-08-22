// @ts-ignore - Deno imports
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
// @ts-ignore - Deno ESM imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// @ts-ignore - Deno global
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// @ts-ignore - Deno global
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')

serve(async (req) => {
    const { record } = await req.json()

    if (!RESEND_API_KEY || !ADMIN_EMAIL) {
        return new Response('Missing RESEND_API_KEY or ADMIN_EMAIL', { status: 500 })
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
            from: 'Review Rewards <notifications@feedback.hyatus.com>',
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
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
    })
})
