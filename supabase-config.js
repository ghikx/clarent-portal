// ═══ CLARENT ADVISORY — SUPABASE CONFIG ═══
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://mzkrhvgneornmjnvbnrr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16a3JodmduZW9ucm1qbnZibnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5ODYxNzEsImV4cCI6MjA5NTU2MjE3MX0.dfnTlTAaO_jR1rJnwH8QFiKk8PFiX3w_AtE-Bowpld0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
