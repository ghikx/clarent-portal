-- ═══ CLARENT ADVISORY — SUPABASE TABLES ═══
-- Run this in Supabase Dashboard → SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── USERS ───
create table users (
  id uuid references auth.users primary key,
  email text not null,
  name text not null,
  role text not null check (role in ('admin','client','broker','analyst')),
  avatar_initials text,
  speciality text,
  bank_details text,
  created_at timestamptz default now()
);

-- ─── DEALS ───
create table deals (
  id text primary key,
  client_id uuid references users(id),
  broker_id uuid references users(id),
  analyst_id uuid references users(id),
  target_company text not null,
  deal_value text not null,
  market text check (market in ('UK','US','AU','CA')),
  drive_link text,
  notes text,
  payment_proof_url text,
  payment_confirmed boolean default false,
  wire_ref text,
  status text default 'payment_submitted' check (status in ('payment_submitted','analysis_started','report_ready','delivered')),
  risk_score integer,
  go_no_go text check (go_no_go in ('GO','NO-GO','CONDITIONAL GO')),
  red_flags jsonb,
  section_risks jsonb,
  exec_summary_link text,
  full_report_link text,
  submitted_at timestamptz default now(),
  analysis_started_at timestamptz,
  report_ready_at timestamptz,
  delivered_at timestamptz
);

-- ─── COMMISSIONS ───
create table commissions (
  id uuid default uuid_generate_v4() primary key,
  broker_id uuid references users(id),
  deal_id text references deals(id),
  deal_name text,
  deal_value text,
  amount numeric not null,
  status text default 'pending' check (status in ('pending','due','paid')),
  paid_at timestamptz,
  wire_ref text,
  notes text,
  created_at timestamptz default now()
);

-- ─── ANALYST FEES ───
create table analyst_fees (
  id uuid default uuid_generate_v4() primary key,
  analyst_id uuid references users(id),
  deal_id text references deals(id),
  deal_name text,
  deal_value text,
  amount numeric default 700,
  turnaround_hours numeric,
  status text default 'pending' check (status in ('pending','due','paid')),
  paid_at timestamptz,
  wire_ref text,
  validated_at timestamptz,
  created_at timestamptz default now()
);

-- ─── NOTIFICATIONS ───
create table notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references users(id),
  type text check (type in ('new','success','warning')),
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

-- ─── ENABLE REALTIME ───
alter publication supabase_realtime add table deals;
alter publication supabase_realtime add table notifications;
alter publication supabase_realtime add table commissions;
alter publication supabase_realtime add table analyst_fees;

-- ─── ROW LEVEL SECURITY ───
alter table users enable row level security;
alter table deals enable row level security;
alter table commissions enable row level security;
alter table analyst_fees enable row level security;
alter table notifications enable row level security;

-- Users policies
create policy "Users read own" on users for select using (auth.uid() = id);
create policy "Admin reads all users" on users for select using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "Admin writes users" on users for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);

-- Deals policies
create policy "Admin all deals" on deals for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "Client own deals" on deals for select using (
  client_id = auth.uid()
);
create policy "Client create deals" on deals for insert with check (
  client_id = auth.uid()
);
create policy "Broker own deals" on deals for select using (
  broker_id = auth.uid()
);
create policy "Analyst assigned deals" on deals for select using (
  analyst_id = auth.uid()
);
create policy "Analyst update assigned" on deals for update using (
  analyst_id = auth.uid()
);

-- Commissions policies
create policy "Admin all commissions" on commissions for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "Broker own commissions" on commissions for select using (
  broker_id = auth.uid()
);

-- Analyst fees policies
create policy "Admin all fees" on analyst_fees for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "Analyst own fees" on analyst_fees for select using (
  analyst_id = auth.uid()
);

-- Notifications policies
create policy "User own notifications" on notifications for select using (
  user_id = auth.uid()
);
create policy "Admin all notifications" on notifications for all using (
  exists (select 1 from users where id = auth.uid() and role = 'admin')
);
create policy "Insert notifications" on notifications for insert with check (true);

-- ─── CREATE FIRST ADMIN USER ───
-- Run this AFTER creating user in Supabase Auth dashboard
-- Replace 'YOUR-AUTH-UID' with the actual UID from Auth → Users

-- insert into users (id, email, name, role, avatar_initials) values
-- ('YOUR-AUTH-UID', 'chenek@clarentadvisory.com', 'Chének', 'admin', 'CZ');
