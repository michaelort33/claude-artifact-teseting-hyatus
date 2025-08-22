import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
    const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL')
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    
    // Only show first few chars of API key for security
    const maskedApiKey = RESEND_API_KEY ? 
        RESEND_API_KEY.substring(0, 8) + '...' + RESEND_API_KEY.substring(RESEND_API_KEY.length - 4) : 
        'NOT SET'
    
    return new Response(JSON.stringify({
        ADMIN_EMAIL: ADMIN_EMAIL || 'NOT SET',
        RESEND_API_KEY_PREVIEW: maskedApiKey,
        hasAdminEmail: !!ADMIN_EMAIL,
        hasResendKey: !!RESEND_API_KEY
    }, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
    })
})