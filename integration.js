// ═══ CLARENT ADVISORY — SUPABASE INTEGRATION ═══

(async function() {

const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')

const SUPABASE_URL = 'https://mzkrhvgneonrmjnvbnrr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16a3JodmduZW9ucm1qbnZibnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODYxNzEsImV4cCI6MjA5NTU2MjE3MX0.dfnTlTAaO_jR1rJnwH8QFiKk8PFiX3w_AtE-Bowpld0'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

let currentUser = null
let currentProfile = null
let dealsCache = []

console.log('✅ Supabase loaded')

// ─── HELPERS ───

function showApp(profile, user) {
  currentUser = user
  currentProfile = profile
  window.currentRole = profile.role

  document.getElementById('user-avatar').textContent = profile.avatar_initials || profile.name.substring(0,2).toUpperCase()
  document.getElementById('user-name').textContent = profile.name.toUpperCase()
  document.getElementById('user-role').textContent = profile.role.toUpperCase()

  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('app').style.display = 'flex'

  buildNav()
  loadNotifications()
  subscribeToRealtimeNotifications()

  const firstPage = NAV[window.currentRole][0].page
  showPage(firstPage)
  if (firstPage === 'dashboard') {
    loadDeals().then(() => initDashboard())
  }
}

// ─── LOGIN ───

window.login = async function() {
  const email    = document.querySelector('input[type="email"]')?.value?.trim()
  const password = document.querySelector('input[type="password"]')?.value
  const btn      = document.querySelector('.login-card .btn-primary')

  if (!email)    { alert('Please enter your email address'); return }
  if (!password) { alert('Please enter your password'); return }

  if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true }

  try {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) throw authError

    const { data: profile, error: profileError } = await supabase
      .from('users').select('*').eq('id', authData.user.id).single()
    if (profileError) throw profileError

    showApp(profile, authData.user)

  } catch (err) {
    console.error('Login error:', err)
    alert('Login failed: ' + err.message)
    if (btn) { btn.textContent = 'Sign in →'; btn.disabled = false }
  }
}

// ─── LOGOUT ───
// Force signOut + clear session + retour login

window.logout = async function() {
  await supabase.auth.signOut()
  currentUser    = null
  currentProfile = null
  window.currentRole = null
  dealsCache = []

  document.getElementById('app').style.display = 'none'
  document.getElementById('login-screen').style.display = 'flex'

  // Reset champs login
  const emailInput = document.querySelector('input[type="email"]')
  const passInput  = document.querySelector('input[type="password"]')
  if (emailInput) emailInput.value = ''
  if (passInput)  passInput.value  = ''
}

// ─── RESTORE SESSION ───
// Si session active → reconnecte automatiquement
// Si pas de profil en base → signOut propre (évite le bypass sans données)

const { data: { session } } = await supabase.auth.getSession()
if (session?.user) {
  const { data: profile, error } = await supabase
    .from('users').select('*').eq('id', session.user.id).single()

  if (profile && !error) {
    showApp(profile, session.user)
  } else {
    // Session orpheline (user Auth sans profil en base) → logout propre
    console.warn('Session found but no profile — signing out')
    await supabase.auth.signOut()
  }
}

// ─── LOAD DEALS ───

async function loadDeals() {
  try {
    let query = supabase
      .from('deals')
      .select('*, client:users!deals_client_id_fkey(name,email), broker:users!deals_broker_id_fkey(name,email), analyst:users!deals_analyst_id_fkey(name,email)')
      .order('submitted_at', { ascending: false })

    const role = window.currentRole
    if (role === 'client')   query = query.eq('client_id',   currentUser.id)
    if (role === 'broker')   query = query.eq('broker_id',   currentUser.id)
    if (role === 'analyst')  query = query.eq('analyst_id',  currentUser.id)

    const { data, error } = await query
    if (error) throw error

    dealsCache = data || []
    renderDealList(dealsCache)
    if (role === 'admin') renderDealManagement(dealsCache)

    supabase.channel('deals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, async () => {
        const { data: fresh } = await query
        dealsCache = fresh || []
        renderDealList(dealsCache)
        if (role === 'admin') renderDealManagement(dealsCache)
      })
      .subscribe()

  } catch (err) {
    console.error('Error loading deals:', err)
  }
}

// ─── RENDER DEAL LIST ───

function renderDealList(deals) {
  const container = document.querySelector('.deal-list')
  if (!container) return

  if (!deals || deals.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--text3)">
        <i class="ti ti-file-off" style="font-size:32px;display:block;margin-bottom:12px"></i>
        <div style="font-size:13px;font-weight:500;color:var(--text2);margin-bottom:6px">No mandates yet</div>
        <div style="font-size:11px;margin-bottom:16px">Submit your first deal to get started</div>
        <button class="btn btn-primary btn-sm" onclick="showPage('submit')">
          <i class="ti ti-plus"></i> Submit Mandate
        </button>
      </div>`
    return
  }

  const statusTag = {
    payment_submitted: '<span class="tag tag-pending">Awaiting Payment</span>',
    analysis_started:  '<span class="tag tag-progress">In Analysis</span>',
    report_ready:      '<span class="tag tag-ready">Report Ready</span>',
    delivered:         '<span class="tag tag-ready">Delivered</span>'
  }
  const barColor = {
    payment_submitted: 'var(--warning)',
    analysis_started:  'var(--accent)',
    report_ready:      'var(--success)',
    delivered:         'var(--success)'
  }
  const barWidth = {
    payment_submitted: '5%',
    analysis_started:  '65%',
    report_ready:      '100%',
    delivered:         '100%'
  }

  container.innerHTML = deals.map(deal => `
    <div class="deal" onclick="showPage('reports')">
      <div class="deal-info">
        <div class="deal-name">${deal.target_company}</div>
        <div class="deal-meta">${deal.market} · ${deal.client?.name || ''}</div>
        <div class="deal-bar">
          <div class="deal-bar-fill" style="width:${barWidth[deal.status]||'0%'};background:${barColor[deal.status]||'var(--border)'}"></div>
        </div>
      </div>
      <div class="deal-right">
        <div class="deal-val">${deal.deal_value}</div>
        <div class="deal-date">${new Date(deal.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
        <div style="margin-top:5px">${statusTag[deal.status]||''}</div>
      </div>
    </div>`).join('')
}

// ─── RENDER DEAL MANAGEMENT ───

function renderDealManagement(deals) {
  const tbody = document.querySelector('#admin-mgmt .data-table tbody')
  if (!tbody) return
  tbody.innerHTML = deals.map(deal => `
    <tr>
      <td><div class="td-main">${deal.client?.name||'—'}</div></td>
      <td>${deal.target_company}</td>
      <td class="td-mono c-accent">${deal.deal_value}</td>
      <td>${deal.broker?.name||'—'}</td>
      <td>${deal.analyst?.name||'—'}</td>
      <td>
        <select class="status-select" onchange="window.updateDealStatus('${deal.id}',this.value)">
          <option ${deal.status==='payment_submitted'?'selected':''} value="payment_submitted">payment_submitted</option>
          <option ${deal.status==='analysis_started'?'selected':''} value="analysis_started">analysis_started</option>
          <option ${deal.status==='report_ready'?'selected':''} value="report_ready">report_ready</option>
          <option ${deal.status==='delivered'?'selected':''} value="delivered">delivered</option>
        </select>
      </td>
      <td><button class="btn btn-sm" onclick="window.notifyClient('${deal.client_id}','${deal.target_company}')">Notify</button></td>
    </tr>`).join('')
}

// ─── UPDATE DEAL STATUS ───

window.updateDealStatus = async function(dealId, status) {
  const { error } = await supabase.from('deals').update({ status }).eq('id', dealId)
  if (error) { console.error(error); return }
  pushNotif(`Status updated — ${dealId} → ${status}`, 'success')
}

// ─── SUBMIT DEAL ───

window.submitDeal = async function() {
  const targetCompany = document.querySelector('#page-submit input[placeholder*="Nexford"]')?.value
  const dealValue     = document.querySelector('#page-submit input[placeholder*="38,500"]')?.value
  const market        = document.querySelector('#page-submit input[placeholder*="UK"]')?.value
  const driveLink     = document.querySelector('#page-submit input[placeholder*="drive.google"]')?.value
  const notes         = document.querySelector('#page-submit textarea')?.value

  if (!targetCompany || !dealValue || !driveLink) {
    alert('Please fill in all required fields'); return
  }

  try {
    const ref = 'CLR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000)

    const { data: deal, error } = await supabase
      .from('deals')
      .insert([{
        id: ref,
        client_id:      currentUser.id,
        target_company: targetCompany,
        deal_value:     dealValue,
        market:         market || 'UK',
        drive_link:     driveLink,
        notes:          notes || null,
        status:         'payment_submitted',
        submitted_at:   new Date().toISOString()
      }])
      .select().single()

    if (error) throw error

    const { data: admins } = await supabase.from('users').select('id').eq('role','admin')
    for (const admin of admins||[]) {
      await supabase.from('notifications').insert({
        user_id: admin.id, type: 'new',
        message: `New mandate submitted — ${targetCompany} · ${dealValue}`,
        read: false, created_at: new Date().toISOString()
      })
    }

    document.getElementById('modal-ref-val').textContent = deal.id
    document.getElementById('submit-modal').classList.add('show')

  } catch (err) {
    alert('Error: ' + err.message)
  }
}

// ─── VALIDATE REPORT ───

window.validateReport = async function(btn) {
  const card     = btn.closest('.analyst-card')
  const dealName = card.querySelector('[style*="font-size:14px"]')?.textContent?.trim()
  const deal     = dealsCache.find(d => d.target_company === dealName)
  if (!deal) return

  const { error } = await supabase.from('deals')
    .update({ status: 'report_ready', report_ready_at: new Date().toISOString() })
    .eq('id', deal.id)

  if (error) { console.error(error); return }

  await supabase.from('notifications').insert({
    user_id: deal.client_id, type: 'success',
    message: `Your DD report for ${deal.target_company} is ready for download`,
    read: false, created_at: new Date().toISOString()
  })

  card.querySelector('.analyst-actions').innerHTML = `
    <div class="validated-banner">
      <i class="ti ti-check" style="font-size:12px"></i>
      Validated & delivered to client
    </div>`
  card.querySelector('.tag').className = 'tag tag-ready'
  card.querySelector('.tag').textContent = 'Delivered'
  pushNotif(`Report validated — ${dealName}`, 'success')
}

// ─── CONFIRM ACTION ───

window.confirmAction = async function() {
  const { type, recipient, amount, deal: dealName } = window.currentAction || {}
  const wireRef = document.getElementById('action-wire-ref').value
  const notes   = document.getElementById('action-notes').value
  document.getElementById('action-modal').classList.remove('show')

  if (type === 'confirm-payment') {
    const deal = dealsCache.find(d => d.target_company === dealName)
    if (deal) {
      await supabase.from('deals').update({ payment_confirmed: true, wire_ref: wireRef }).eq('id', deal.id)
    }
    pushNotif(`Payment logged — ${dealName}`, 'success')

  } else if (type === 'pay-broker') {
    await supabase.from('commissions')
      .update({ status:'paid', paid_at: new Date().toISOString(), wire_ref: wireRef, notes })
      .eq('status', 'due')
    pushNotif(`Commission paid — ${recipient} · ${amount}`, 'success')

  } else if (type === 'pay-analyst') {
    await supabase.from('analyst_fees')
      .update({ status:'paid', paid_at: new Date().toISOString(), wire_ref: wireRef, notes })
      .eq('status', 'due')
    pushNotif(`Fee paid — ${recipient} · ${amount}`, 'success')
  }
}

// ─── NOTIFICATIONS ───

async function loadNotifications() {
  if (!currentUser) return
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(20)

  window.notifs = (data||[]).map(n => ({
    id: n.id, text: n.message,
    time: timeAgo(new Date(n.created_at)),
    type: n.type, read: n.read
  }))
  renderNotifs()
}

function subscribeToRealtimeNotifications() {
  if (!currentUser) return
  supabase.channel(`notifs-${currentUser.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'notifications',
      filter: `user_id=eq.${currentUser.id}`
    }, payload => {
      window.notifs.unshift({
        id: payload.new.id, text: payload.new.message,
        time: 'just now', type: payload.new.type, read: false
      })
      renderNotifs()
    })
    .subscribe()
}

window.markRead = async function(id) {
  await supabase.from('notifications').update({ read: true }).eq('id', id)
  const n = window.notifs.find(n => n.id === id)
  if (n) n.read = true
  renderNotifs()
}

window.clearNotifs = async function() {
  await supabase.from('notifications').update({ read: true }).eq('user_id', currentUser.id)
  window.notifs.forEach(n => n.read = true)
  renderNotifs()
}

window.notifyClient = async function(clientId, dealName) {
  await supabase.from('notifications').insert({
    user_id: clientId, type: 'success',
    message: `Update on your mandate — ${dealName}`,
    read: false, created_at: new Date().toISOString()
  })
  pushNotif(`Client notified — ${dealName}`, 'success')
}

function timeAgo(date) {
  const s = Math.floor((new Date() - date) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return Math.floor(s/60)    + 'm ago'
  if (s < 86400) return Math.floor(s/3600)  + 'h ago'
  return                Math.floor(s/86400) + 'd ago'
}

console.log('✅ Clarent Advisory — integration ready')

})()
