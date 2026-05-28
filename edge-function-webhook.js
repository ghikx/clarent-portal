// ═══ CLARENT ADVISORY — SUPABASE EDGE FUNCTION ═══
// Deploy: supabase functions deploy n8n-webhook
// URL: https://mzkrhvgneornmjnvbnrr.supabase.co/functions/v1/n8n-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const payload = await req.json()
    const {
      deal_id,
      status,
      risk_score,
      go_no_go,
      exec_summary_link,
      full_report_link,
      red_flags,
      section_risks
    } = payload

    if (!deal_id) {
      return new Response(JSON.stringify({ error: 'deal_id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ─── 1. Update deal in Supabase ───
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .update({
        status,
        risk_score,
        go_no_go,
        exec_summary_link,
        full_report_link,
        red_flags,
        section_risks,
        report_ready_at: new Date().toISOString()
      })
      .eq('id', deal_id)
      .select('*, client:users!deals_client_id_fkey(id,name), analyst:users!deals_analyst_id_fkey(id,name)')
      .single()

    if (dealError) throw dealError

    // ─── 2. Notify client ───
    if (deal.client_id) {
      await supabase.from('notifications').insert({
        user_id: deal.client_id,
        type: 'success',
        message: `Your DD report for ${deal.target_company} has been generated and is pending analyst validation`,
        read: false,
        created_at: new Date().toISOString()
      })
    }

    // ─── 3. Notify assigned analyst ───
    if (deal.analyst_id) {
      await supabase.from('notifications').insert({
        user_id: deal.analyst_id,
        type: 'new',
        message: `Report ready for validation — ${deal.target_company} · Risk Score: ${risk_score} · ${go_no_go}`,
        read: false,
        created_at: new Date().toISOString()
      })
    }

    // ─── 4. Notify all admins ───
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')

    for (const admin of admins || []) {
      await supabase.from('notifications').insert({
        user_id: admin.id,
        type: 'new',
        message: `Pipeline complete — ${deal.target_company} · Score: ${risk_score}/100 · ${go_no_go}`,
        read: false,
        created_at: new Date().toISOString()
      })
    }

    // ─── 5. Update analyst fee status to due ───
    if (deal.analyst_id) {
      await supabase
        .from('analyst_fees')
        .update({ status: 'due', validated_at: new Date().toISOString() })
        .eq('deal_id', deal_id)
        .eq('analyst_id', deal.analyst_id)
    }

    return new Response(
      JSON.stringify({ success: true, deal_id, status }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Webhook error:', err)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
