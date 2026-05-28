# Clarent Advisory — Supabase Integration

## Files

- `supabase-config.js` — Supabase client initialization
- `auth.js` — Login, logout, session management
- `db.js` — All Firestore operations + realtime listeners
- `storage.js` — File upload/download (payment proofs)
- `integration.js` — Wires everything into the HTML portal
- `supabase-tables.sql` — Run in Supabase SQL Editor
- `edge-function-webhook.js` — Deploy as Supabase Edge Function

## Setup Order

### Step 1 — Run SQL
Go to Supabase Dashboard → SQL Editor → paste `supabase-tables.sql` → Run

### Step 2 — Create Storage Bucket
Supabase Dashboard → Storage → New bucket → Name: `clarent-files` → Public: false

### Step 3 — Create Admin User
1. Supabase Auth → Users → Add user
   - Email: chenek@clarentadvisory.com
   - Password: [your password]
2. Copy the UID shown
3. SQL Editor → run:
   ```sql
   insert into users (id, email, name, role, avatar_initials)
   values ('[YOUR-UID]', 'chenek@clarentadvisory.com', 'Chének', 'admin', 'CZ');
   ```

### Step 4 — Deploy Edge Function
```bash
npm install -g supabase
supabase login
supabase functions deploy n8n-webhook --project-ref mzkrhvgneornmjnvbnrr
```
Your webhook URL will be:
`https://mzkrhvgneornmjnvbnrr.supabase.co/functions/v1/n8n-webhook`

### Step 5 — Add scripts to HTML
Add at the bottom of clarent_advisory_portal_v6.html before </body>:
```html
<script type="module" src="integration.js"></script>
```

### Step 6 — Configure n8n
In n8n HTTP Request node (after Assemble Full Report):
- Method: POST
- URL: https://mzkrhvgneornmjnvbnrr.supabase.co/functions/v1/n8n-webhook
- Headers: { "Content-Type": "application/json", "Authorization": "Bearer [anon-key]" }
- Body: { deal_id, status, risk_score, go_no_go, exec_summary_link, full_report_link, red_flags, section_risks }

## What works automatically after setup

✅ Real login with Supabase Auth — roles from database
✅ Dashboard shows real deals in realtime
✅ Submit deal → creates record in Supabase → notifies admin
✅ Analyst validates → client sees report instantly (realtime)
✅ n8n pipeline complete → red flags appear in client portal
✅ Admin pays broker/analyst → logged in database
✅ All notifications realtime
✅ Payment proof uploaded to Supabase Storage
