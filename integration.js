// ═══ CLARENT ADVISORY — INTEGRATION MODULE ═══
// Wires Supabase backend into the existing HTML
// DO NOT modify the HTML — this file plugs into existing functions

import { supabase } from './supabase-config.js'
import { login as sbLogin, logout as sbLogout, getCurrentUser, onAuthStateChange } from './auth.js'
import { createDeal, getDeals, updateDeal, subscribeToDeals, getUsers, getAnalystAvailability, getCommissions, markCommissionPaid, getAnalystFees, markFeePaid, getNotifications, markNotificationRead, markAllNotificationsRead, createNotification, subscribeToNotifications } from './db.js'
import { uploadPaymentProof } from './storage.js'

let currentUser = null
let currentProfile = null
let dealsCache = []
let unsubscribeDeals = null
let unsubscribeNotifs = null

// ─── OVERRIDE LOGIN ───
window.login = async function() {
  // Grab inputs by type — HTML login fields have no IDs
  const emailInput = document.querySelector('input[type="email"]')
  const passwordInput = document.querySelector('input[type="password"]')

  const email = emailInput?.value?.trim()
  const password = passwordInput?.value

  if (!email) { alert('Please enter your email address'); return }
  if (!password) { alert('Please enter your password'); return }

  try {
    const btn = document.querySelector('.login-card .btn-primary')
    if (btn) { btn.textContent = 'Signing in...'; btn.disabled = true }

    const { user, profile } = await sbLogin(email, password)
    currentUser = user
    currentProfile = profile
    currentRole = profile.role

    // Update UI with real user data
    document.getElementById('user-avatar').textContent = profile.avatar_initials || profile.name.substring(0,2).toUpperCase()
    document.getElementById('user-name').textContent = profile.name.toUpperCase()
    document.getElementById('user-role').textContent = profile.role.toUpperCase()

    // Hide login, show app
    document.getElementById('login-screen').style.display = 'none'
    const app = document.getElementById('app')
    app.style.display = 'flex'

    // Build nav + load data
    buildNav()
    await loadNotifications()
    subscribeToRealtimeNotifications()

    const firstPage = NAV[currentRole][0].page
    showPage(firstPage)
    if (firstPage === 'dashboard') {
      await loadDeals()
      initDashboard()
    }

  } catch (err) {
    alert('Login failed: ' + err.message)
    const btn = document.querySelector('button.btn-primary')
    if (btn) { btn.textContent = 'Sign in →'; btn.disabled = false }
  }
}

// ─── OVERRIDE LOGOUT ───
window.logout = async function() {
  if (unsubscribeDeals) unsubscribeDeals()
  if (unsubscribeNotifs) unsubscribeNotifs()
  await sbLogout()
  currentUser = null
  currentProfile = null
  document.getElementById('app').style.display = 'none'
  document.getElementById('login-screen').style.display = 'flex'
}

// ─── LOAD DEALS ───
async function loadDeals() {
  try {
    dealsCache = await getDeals(currentRole, currentUser?.id)
    renderDealList(dealsCache)
    renderDealManagement(dealsCache)

    // Subscribe to realtime updates
    if (unsubscribeDeals) unsubscribeDeals()
    const channel = subscribeToDeals(currentRole, currentUser?.id, (deals) => {
      dealsCache = deals
      renderDealList(deals)
      renderDealManagement(deals)
    })
    unsubscribeDeals = () => supabase.removeChannel(channel)

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
    analysis_started: '<span class="tag tag-progress">In Analysis</span>',
    report_ready: '<span class="tag tag-ready">Report Ready</span>',
    delivered: '<span class="tag tag-ready">Delivered</span>'
  }

  const barColor = {
    payment_submitted: 'var(--warning)',
    analysis_started: 'var(--accent)',
    report_ready: 'var(--success)',
    delivered: 'var(--success)'
  }

  const barWidth = {
    payment_submitted: '5%',
    analysis_started: '65%',
    report_ready: '100%',
    delivered: '100%'
  }

  container.innerHTML = deals.map(deal => `
    <div class="deal" onclick="showPage('reports')">
      <div class="deal-info">
        <div class="deal-name">${deal.target_company}</div>
        <div class="deal-meta">${deal.market} · ${deal.client?.name || ''}</div>
        <div class="deal-bar">
          <div class="deal-bar-fill" style="width:${barWidth[deal.status]};background:${barColor[deal.status]}"></div>
        </div>
      </div>
      <div class="deal-right">
        <div class="deal-val">${deal.deal_value}</div>
        <div class="deal-date">${new Date(deal.submitted_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
        <div style="margin-top:5px">${statusTag[deal.status] || ''}</div>
      </div>
    </div>`).join('')
}

// ─── RENDER DEAL MANAGEMENT TABLE (admin only) ───
function renderDealManagement(deals) {
  const tbody = document.querySelector('#admin-mgmt .data-table tbody')
  if (!tbody) return

  tbody.innerHTML = deals.map(deal => `
    <tr>
      <td><div class="td-main">${deal.client?.name || '—'}</div></td>
      <td>${deal.target_company}</td>
      <td class="td-mono c-accent">${deal.deal_value}</td>
      <td>${deal.broker?.name || '—'}</td>
      <td>${deal.analyst?.name || '—'}</td>
      <td>
        <select class="status-select" onchange="updateDealStatus('${deal.id}',this.value)">
          <option ${deal.status==='payment_submitted'?'selected':''}>payment_submitted</option>
          <option ${deal.status==='analysis_started'?'selected':''}>analysis_started</option>
          <option ${deal.status==='report_ready'?'selected':''}>report_ready</option>
          <option ${deal.status==='delivered'?'selected':''}>delivered</option>
        </select>
      </td>
      <td><button class="btn btn-sm" onclick="notifyClient('${deal.client_id}','${deal.target_company}')">Notify</button></td>
    </tr>`).join('')
}

// ─── UPDATE DEAL STATUS ───
window.updateDealStatus = async function(dealId, status) {
  try {
    await updateDeal(dealId, { status, [`${status}_at`]: new Date().toISOString() })
    pushNotif(`Status updated — ${dealId} → ${status}`, 'success')
  } catch (err) {
    console.error('Error updating deal:', err)
  }
}

// ─── OVERRIDE SUBMIT DEAL ───
window.submitDeal = async function() {
  const targetCompany = document.querySelector('#page-submit input[placeholder*="Nexford"]')?.value
  const dealValue = document.querySelector('#page-submit input[placeholder*="38,500"]')?.value
  const market = document.querySelector('#page-submit input[placeholder*="UK"]')?.value
  const driveLink = document.querySelector('#page-submit input[placeholder*="drive.google"]')?.value
  const notes = document.querySelector('#page-submit textarea')?.value
  const fileInput = document.querySelector('#page-submit input[type="file"]')

  if (!targetCompany || !dealValue || !driveLink) {
    alert('Please fill in all required fields')
    return
  }

  try {
    const deal = await createDeal({
      client_id: currentUser.id,
      target_company: targetCompany,
      deal_value: dealValue,
      market: market || 'UK',
      drive_link: driveLink,
      notes: notes || null
    })

    // Upload payment proof if provided
    if (fileInput?.files?.[0]) {
      const url = await uploadPaymentProof(deal.id, fileInput.files[0])
      await updateDeal(deal.id, { payment_proof_url: url })
    }

    // Notify admin
    const admins = await getUsers('admin')
    for (const admin of admins) {
      await createNotification(admin.id, 'new', `New mandate submitted — ${targetCompany} · ${dealValue}`)
    }

    // Show success modal with real reference
    document.getElementById('modal-ref-val').textContent = deal.id
    document.getElementById('submit-modal').classList.add('show')

  } catch (err) {
    alert('Error submitting deal: ' + err.message)
  }
}

// ─── OVERRIDE VALIDATE REPORT (analyst) ───
window.validateReport = async function(btn) {
  const card = btn.closest('.analyst-card')
  const dealName = card.querySelector('[style*="font-size:14px"]').textContent

  // Find deal by name
  const deal = dealsCache.find(d => d.target_company === dealName.trim())
  if (!deal) return

  try {
    await updateDeal(deal.id, {
      status: 'report_ready',
      report_ready_at: new Date().toISOString()
    })

    // Notify client
    await createNotification(deal.client_id, 'success',
      `Your DD report for ${deal.target_company} has been validated and is ready for download`)

    // Notify admin
    const admins = await getUsers('admin')
    for (const admin of admins) {
      await createNotification(admin.id, 'success', `Report validated — ${deal.target_company}`)
    }

    // Update UI
    card.querySelector('.analyst-actions').innerHTML = `
      <div class="validated-banner">
        <i class="ti ti-check" style="font-size:12px"></i>
        Validated & delivered to client
      </div>`
    card.querySelector('.tag').className = 'tag tag-ready'
    card.querySelector('.tag').textContent = 'Delivered'

    pushNotif(`Report validated — ${deal.target_company}`, 'success')

  } catch (err) {
    console.error('Error validating report:', err)
  }
}

// ─── OVERRIDE CONFIRM ACTION (management payouts) ───
window.confirmAction = async function() {
  const { type, recipient, amount, deal, commissionId, feeId } = currentAction
  const wireRef = document.getElementById('action-wire-ref').value
  const notes = document.getElementById('action-notes').value

  document.getElementById('action-modal').classList.remove('show')

  try {
    if (type === 'pay-broker' && commissionId) {
      await markCommissionPaid(commissionId, wireRef, notes)
      pushNotif(`Commission paid — ${recipient} · ${amount}`, 'success')
    } else if (type === 'pay-analyst' && feeId) {
      await markFeePaid(feeId, wireRef, notes)
      pushNotif(`Fee paid — ${recipient} · ${amount}`, 'success')
    } else if (type === 'confirm-payment') {
      const d = dealsCache.find(d => d.target_company === deal)
      if (d) {
        await updateDeal(d.id, { payment_confirmed: true, wire_ref: wireRef })
        pushNotif(`Payment logged — ${deal} · Wire transfer confirmed`, 'success')
      }
    }
  } catch (err) {
    console.error('Error confirming action:', err)
  }
}

// ─── NOTIFICATIONS ───
async function loadNotifications() {
  if (!currentUser) return
  try {
    const notifs = await getNotifications(currentUser.id)
    window.notifs = notifs.map(n => ({
      id: n.id,
      text: n.message,
      time: timeAgo(new Date(n.created_at)),
      type: n.type,
      read: n.read
    }))
    renderNotifs()
  } catch (err) {
    console.error('Error loading notifications:', err)
  }
}

function subscribeToRealtimeNotifications() {
  if (!currentUser) return
  const channel = subscribeToNotifications(currentUser.id, async (newNotif) => {
    window.notifs.unshift({
      id: newNotif.id,
      text: newNotif.message,
      time: 'just now',
      type: newNotif.type,
      read: false
    })
    renderNotifs()
  })
  unsubscribeNotifs = () => supabase.removeChannel(channel)
}

window.markRead = async function(id) {
  await markNotificationRead(id)
  const n = window.notifs.find(n => n.id === id)
  if (n) n.read = true
  renderNotifs()
}

window.clearNotifs = async function() {
  if (currentUser) await markAllNotificationsRead(currentUser.id)
  window.notifs.forEach(n => n.read = true)
  renderNotifs()
}

// ─── NOTIFY CLIENT HELPER ───
window.notifyClient = async function(clientId, dealName) {
  await createNotification(clientId, 'success', `Update on your mandate — ${dealName}`)
  pushNotif(`Client notified — ${dealName}`, 'success')
}

// ─── UTILITY ───
function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return Math.floor(seconds/60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds/3600) + 'h ago'
  return Math.floor(seconds/86400) + 'd ago'
}

// ─── AUTO RESTORE SESSION ───
onAuthStateChange(async (event, user, profile) => {
  if (event === 'SIGNED_IN' && user && profile) {
    currentUser = user
    currentProfile = profile
    currentRole = profile.role
  }
})

console.log('✅ Clarent Advisory — Supabase integration loaded')
