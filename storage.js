// ═══ CLARENT ADVISORY — STORAGE MODULE ═══
import { supabase } from './supabase-config.js'

export async function uploadPaymentProof(dealId, file) {
  const ext = file.name.split('.').pop()
  const path = `payment_proofs/${dealId}/proof.${ext}`

  const { data, error } = await supabase.storage
    .from('clarent-files')
    .upload(path, file, { upsert: true })

  if (error) throw error

  const { data: { publicUrl } } = supabase.storage
    .from('clarent-files')
    .getPublicUrl(path)

  return publicUrl
}

export async function getPaymentProofUrl(dealId) {
  const extensions = ['pdf', 'jpg', 'png']
  for (const ext of extensions) {
    const path = `payment_proofs/${dealId}/proof.${ext}`
    const { data } = supabase.storage.from('clarent-files').getPublicUrl(path)
    if (data?.publicUrl) return data.publicUrl
  }
  return null
}
