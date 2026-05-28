// ═══ CLARENT ADVISORY — DATABASE MODULE ═══
import { supabase } from './supabase-config.js'

// ─── DEALS ───
export async function createDeal(dealData) {
  const ref = 'CLR-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000)
  const { data, error } = await supabase
    .from('deals')
    .insert([{ ...dealData, id: ref, status: 'payment_submitted', submitted_at: new Date().toISOString() }])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getDeals(role, userId) {
  let query = supabase.from('deals').select(`
    *,
    client:users!deals_client_id_fkey(name, email),
    broker:users!deals_broker_id_fkey(name, email),
    analyst:users!deals_analyst_id_fkey(name, email)
  `).order('submitted_at', { ascending: false })

  if (role === 'client') query = query.eq('client_id', userId)
  if (role === 'broker') query = query.eq('broker_id', userId)
  if (role === 'analyst') query = query.eq('analyst_id', userId)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function updateDeal(dealId, updates) {
  const { data, error } = await supabase
    .from('deals')
    .update(updates)
    .eq('id', dealId)
    .select()
    .single()
  if (error) throw error
  return data
}

export function subscribeToDeal(dealId, callback) {
  return supabase
    .channel(`deal-${dealId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'deals',
      filter: `id=eq.${dealId}`
    }, payload => callback(payload.new))
    .subscribe()
}

export function subscribeToDeals(role, userId, callback) {
  return supabase
    .channel('deals-changes')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'deals'
    }, async () => {
      const deals = await getDeals(role, userId)
      callback(deals)
    })
    .subscribe()
}

// ─── USERS ───
export async function getUsers(role = null) {
  let query = supabase.from('users').select('*')
  if (role) query = query.eq('role', role)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAnalystAvailability() {
  const analysts = await getUsers('analyst')
  const { data: activeDeals } = await supabase
    .from('deals')
    .select('analyst_id')
    .in('status', ['analysis_started'])

  return analysts.map(analyst => ({
    ...analyst,
    active_deals: activeDeals?.filter(d => d.analyst_id === analyst.id).length || 0
  }))
}

// ─── COMMISSIONS ───
export async function getCommissions(brokerId = null) {
  let query = supabase.from('commissions').select(`
    *,
    broker:users!commissions_broker_id_fkey(name, email)
  `).order('created_at', { ascending: false })
  if (brokerId) query = query.eq('broker_id', brokerId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function markCommissionPaid(commissionId, wireRef, notes) {
  const { data, error } = await supabase
    .from('commissions')
    .update({ status: 'paid', paid_at: new Date().toISOString(), wire_ref: wireRef, notes })
    .eq('id', commissionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── ANALYST FEES ───
export async function getAnalystFees(analystId = null) {
  let query = supabase.from('analyst_fees').select(`
    *,
    analyst:users!analyst_fees_analyst_id_fkey(name, email)
  `).order('created_at', { ascending: false })
  if (analystId) query = query.eq('analyst_id', analystId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function markFeePaid(feeId, wireRef, notes) {
  const { data, error } = await supabase
    .from('analyst_fees')
    .update({ status: 'paid', paid_at: new Date().toISOString(), wire_ref: wireRef, notes })
    .eq('id', feeId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── NOTIFICATIONS ───
export async function getNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data
}

export async function markNotificationRead(notifId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId)
  if (error) throw error
}

export async function markAllNotificationsRead(userId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
  if (error) throw error
}

export async function createNotification(userId, type, message) {
  const { error } = await supabase
    .from('notifications')
    .insert([{ user_id: userId, type, message, read: false, created_at: new Date().toISOString() }])
  if (error) throw error
}

export function subscribeToNotifications(userId, callback) {
  return supabase
    .channel(`notifs-${userId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    }, payload => callback(payload.new))
    .subscribe()
}
