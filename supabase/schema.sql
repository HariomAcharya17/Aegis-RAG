-- =====================================================================
-- Kestrel Secure RAG: database schema
-- Run once in Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run: tables use IF NOT EXISTS, functions use OR REPLACE,
-- policies are dropped and recreated.
--
-- Core idea: access control lives HERE, in Postgres Row Level Security,
-- not in the LLM prompt. A chunk the user's role cannot read is never
-- returned to the server, so the model can never see it, so no jailbreak
-- can leak it.
-- =====================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Identity: profiles + role -> department permissions
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'employee'
             check (role in ('employee', 'finance', 'hr', 'marketing', 'executive')),
  created_at timestamptz not null default now()
);

-- Which departments each role may read. Data, not code: change access
-- without a redeploy.
create table if not exists public.role_permissions (
  role       text not null,
  department text not null check (department in ('general', 'finance', 'hr', 'marketing')),
  primary key (role, department)
);

insert into public.role_permissions (role, department) values
  ('employee',  'general'),
  ('finance',   'general'), ('finance',   'finance'),
  ('hr',        'general'), ('hr',        'hr'),
  ('marketing', 'general'), ('marketing', 'marketing'),
  ('executive', 'general'), ('executive', 'finance'), ('executive', 'hr'), ('executive', 'marketing')
on conflict do nothing;

-- Temporary access granted by an executive after an access request.
create table if not exists public.access_grants (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  department  text not null,
  expires_at  timestamptz not null,
  granted_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table if not exists public.access_requests (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  department  text not null check (department in ('finance', 'hr', 'marketing')),
  question    text,
  reason      text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id)
);

-- New auth user -> profile with the LOWEST role.
-- Deliberately ignores raw_user_meta_data: anyone can set metadata at
-- signup, so trusting it would let a visitor make themselves "executive".
-- Roles are only changed by scripts/seed_users.py (service role) or SQL.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'employee')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Departments the caller may read right now (role + unexpired grants).
-- SECURITY DEFINER so policies can call it without recursive RLS checks.
-- Returns NULL for anonymous callers, and "x = any(NULL)" is never true:
-- deny by default.
create or replace function public.allowed_departments(uid uuid default auth.uid())
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select array(
    select rp.department
      from public.profiles p
      join public.role_permissions rp on rp.role = p.role
     where p.id = uid
    union
    select g.department
      from public.access_grants g
     where g.user_id = uid and g.expires_at > now()
  )
  where uid is not null;
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_executive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'executive' from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------
-- 2. Knowledge base: documents + chunks (filled by scripts/load_data.py)
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id          text primary key,
  title       text not null,
  department  text not null check (department in ('general', 'finance', 'hr', 'marketing')),
  doc_type    text,
  source      text,
  flagged     boolean not null default false,  -- failed prompt-injection scan at ingestion
  flag_reason text,
  created_at  timestamptz not null default now()
);

create table if not exists public.chunks (
  id          text primary key,
  document_id text not null references public.documents (id) on delete cascade,
  department  text not null,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(768) not null,
  flagged     boolean not null default false,
  fts         tsvector generated always as (to_tsvector('english', content)) stored
);

create index if not exists chunks_department_idx on public.chunks (department);
create index if not exists chunks_fts_idx on public.chunks using gin (fts);
-- No HNSW index on purpose: with ~2k chunks an exact scan takes a few ms,
-- and approximate indexes + RLS filtering can silently return fewer rows.
-- Add one (vector_cosine_ops) only past ~50k chunks.

-- Canary tokens planted in each department's documents. If one ever shows
-- up in an answer for a role that cannot read that department, it is a leak.
-- No policies: only the service role can read it.
create table if not exists public.canaries (
  token      text primary key,
  department text not null
);

-- ---------------------------------------------------------------------
-- 3. Structured data the agent queries through typed tools
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  employee_id        int primary key,
  full_name          text not null,
  email              text not null,
  phone              text,
  department         text not null,
  job_role           text not null,
  job_level          int,
  monthly_income     int,
  years_at_company   int,
  performance_rating int,
  attrition          boolean,
  overtime           boolean,
  gender             text,
  age                int,
  marital_status     text,
  hire_date          date
);

create table if not exists public.finance_quarterly (
  year      int  not null,
  quarter   int  not null,
  region    text not null,
  category  text not null,
  revenue   numeric(14, 2) not null,
  profit    numeric(14, 2) not null,
  orders    int not null,
  avg_discount numeric(6, 4),
  primary key (year, quarter, region, category)
);

create table if not exists public.marketing_campaigns (
  campaign           text primary key,
  quarter            text,
  channel            text,
  budget_usd         numeric(12, 2),
  customers_targeted int,
  accepted           int,
  acceptance_rate    numeric(6, 4),
  cost_per_acceptance numeric(10, 2)
);

-- ---------------------------------------------------------------------
-- 4. Operations: audit log, red-team arena, eval cases
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  user_id         uuid,
  user_email      text,
  role            text,
  surface         text not null,          -- chat | arena | eval | view_as
  question        text,                   -- PII-redacted before insert
  answer          text,
  status          text,                   -- answered | refused | out_of_scope | blocked | error
  blocked_by      text,
  retrieved       jsonb,
  tools_used      jsonb,
  restricted      jsonb,
  pii_redactions  int default 0,
  latency_ms      int,
  input_tokens    int default 0,
  output_tokens   int default 0,
  shadow_cost_usd numeric(12, 6) default 0,
  trace_id        text
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_user_idx on public.audit_logs (user_id, created_at desc);

create table if not exists public.redteam_attempts (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid,
  handle      text not null,
  mode        text not null check (mode in ('secure', 'prompt_only')),
  target      text not null,
  prompt      text not null,
  outcome     text not null,              -- leaked | contained | blocked
  blocked_by  text,
  leaked_tokens text[] default '{}'
);
create index if not exists redteam_created_idx on public.redteam_attempts (created_at desc);

create table if not exists public.eval_cases (
  id               bigserial primary key,
  source           text not null default 'golden',  -- golden | leak | scope | redteam
  role             text not null,
  question         text not null,
  expected         text,
  must_refuse      boolean not null default false,
  must_not_contain text[] not null default '{}',
  created_at       timestamptz not null default now(),
  unique (role, question)
);

-- ---------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.access_grants       enable row level security;
alter table public.access_requests     enable row level security;
alter table public.documents           enable row level security;
alter table public.chunks              enable row level security;
alter table public.canaries            enable row level security;
alter table public.employees           enable row level security;
alter table public.finance_quarterly   enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.redteam_attempts    enable row level security;
alter table public.eval_cases          enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_executive());

drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

drop policy if exists grants_read on public.access_grants;
create policy grants_read on public.access_grants
  for select to authenticated
  using (user_id = auth.uid() or public.is_executive());

drop policy if exists requests_insert_own on public.access_requests;
create policy requests_insert_own on public.access_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists requests_read on public.access_requests;
create policy requests_read on public.access_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_executive());

-- THE policies that matter.
drop policy if exists documents_by_department on public.documents;
create policy documents_by_department on public.documents
  for select to authenticated
  using (department = any (public.allowed_departments()) and not flagged);

drop policy if exists chunks_by_department on public.chunks;
create policy chunks_by_department on public.chunks
  for select to authenticated
  using (department = any (public.allowed_departments()) and not flagged);

drop policy if exists employees_hr_only on public.employees;
create policy employees_hr_only on public.employees
  for select to authenticated
  using ('hr' = any (public.allowed_departments()));

drop policy if exists finance_only on public.finance_quarterly;
create policy finance_only on public.finance_quarterly
  for select to authenticated
  using ('finance' = any (public.allowed_departments()));

drop policy if exists marketing_only on public.marketing_campaigns;
create policy marketing_only on public.marketing_campaigns
  for select to authenticated
  using ('marketing' = any (public.allowed_departments()));

drop policy if exists audit_exec_read on public.audit_logs;
create policy audit_exec_read on public.audit_logs
  for select to authenticated using (public.is_executive());

drop policy if exists redteam_public_read on public.redteam_attempts;
create policy redteam_public_read on public.redteam_attempts
  for select to authenticated using (true);

drop policy if exists eval_exec_read on public.eval_cases;
create policy eval_exec_read on public.eval_cases
  for select to authenticated using (public.is_executive());

-- audit_logs, redteam_attempts, eval_cases and canaries are written only by
-- the server with the service role key, which bypasses RLS. No insert
-- policies = clients cannot forge log rows.

-- ---------------------------------------------------------------------
-- 6. Retrieval functions
-- ---------------------------------------------------------------------

-- Hybrid search (vector + keyword, fused with Reciprocal Rank Fusion).
-- SECURITY INVOKER (the default): runs as the calling user, so the
-- chunks_by_department policy filters every row it touches.
create or replace function public.hybrid_search(
  query_text      text,
  query_embedding vector(768),
  match_count     int default 6,
  rrf_k           int default 50
)
returns table (
  id          text,
  document_id text,
  title       text,
  department  text,
  content     text,
  similarity  float,
  score       float
)
language sql
stable
set search_path = public, extensions
as $$
  with semantic as (
    select c.id,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
      from public.chunks c
     order by c.embedding <=> query_embedding
     limit match_count * 4
  ),
  keyword as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
           ) as rnk
      from public.chunks c
     where c.fts @@ websearch_to_tsquery('english', query_text)
     order by ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) desc
     limit match_count * 4
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (rrf_k + s.rnk), 0) + coalesce(1.0 / (rrf_k + k.rnk), 0) as score
      from semantic s
      full outer join keyword k on s.id = k.id
  )
  select c.id, c.document_id, d.title, c.department, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         f.score
    from fused f
    join public.chunks c on c.id = f.id
    join public.documents d on d.id = c.document_id
   order by f.score desc
   limit match_count;
$$;

-- How many relevant chunks exist in departments the caller CANNOT read.
-- Returns counts only, never content. Powers "2 HR documents match,
-- request access?". Trade-off: reveals that relevant documents exist.
create or replace function public.restricted_matches(
  query_embedding vector(768),
  threshold       float default 0.62
)
returns table (department text, matches bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select c.department, count(*)::bigint
    from public.chunks c
   where auth.uid() is not null
     and not (c.department = any (coalesce(public.allowed_departments(auth.uid()), '{}')))
     and not c.flagged
     and 1 - (c.embedding <=> query_embedding) > threshold
   group by c.department;
$$;

-- Search restricted to an explicit department list. Bypasses RLS, so it is
-- NOT callable by clients (see REVOKE below). Used only by the server for
-- the arena's deliberately weak "prompt_only" mode and by view_as_search.
create or replace function public.search_departments(
  departments     text[],
  query_text      text,
  query_embedding vector(768),
  match_count     int default 6,
  rrf_k           int default 50
)
returns table (
  id          text,
  document_id text,
  title       text,
  department  text,
  content     text,
  similarity  float,
  score       float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with pool as (
    select c.* from public.chunks c
     where c.department = any (departments) and not c.flagged
  ),
  semantic as (
    select p.id, row_number() over (order by p.embedding <=> query_embedding) as rnk
      from pool p
     order by p.embedding <=> query_embedding
     limit match_count * 4
  ),
  keyword as (
    select p.id,
           row_number() over (
             order by ts_rank_cd(p.fts, websearch_to_tsquery('english', query_text)) desc
           ) as rnk
      from pool p
     where p.fts @@ websearch_to_tsquery('english', query_text)
     order by ts_rank_cd(p.fts, websearch_to_tsquery('english', query_text)) desc
     limit match_count * 4
  ),
  fused as (
    select coalesce(s.id, k.id) as id,
           coalesce(1.0 / (rrf_k + s.rnk), 0) + coalesce(1.0 / (rrf_k + k.rnk), 0) as score
      from semantic s
      full outer join keyword k on s.id = k.id
  )
  select c.id, c.document_id, d.title, c.department, c.content,
         1 - (c.embedding <=> query_embedding) as similarity,
         f.score
    from fused f
    join public.chunks c on c.id = f.id
    join public.documents d on d.id = c.document_id
   order by f.score desc
   limit match_count;
$$;

-- "View as role" for executives: what would role X retrieve for this query?
create or replace function public.view_as_search(
  target_role     text,
  query_text      text,
  query_embedding vector(768),
  match_count     int default 6
)
returns table (
  id          text,
  document_id text,
  title       text,
  department  text,
  content     text,
  similarity  float,
  score       float
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_executive() then
    raise exception 'view_as_search: executives only';
  end if;
  return query
    select * from public.search_departments(
      array(select rp.department from public.role_permissions rp where rp.role = target_role),
      query_text, query_embedding, match_count
    );
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Aggregate functions behind the agent's tools (SECURITY INVOKER:
--    RLS on the base tables applies, so non-HR callers get zero rows)
-- ---------------------------------------------------------------------
create or replace function public.employee_stats(group_by text default 'department')
returns table (
  grp                text,
  headcount          bigint,
  avg_monthly_income numeric,
  attrition_rate     numeric,
  overtime_rate      numeric,
  avg_years          numeric
)
language sql
stable
set search_path = public
as $$
  select case group_by
           when 'job_role'  then e.job_role
           when 'job_level' then e.job_level::text
           when 'gender'    then e.gender
           else e.department
         end as grp,
         count(*),
         round(avg(e.monthly_income), 0),
         round(avg(case when e.attrition then 1 else 0 end), 4),
         round(avg(case when e.overtime then 1 else 0 end), 4),
         round(avg(e.years_at_company), 1)
    from public.employees e
   group by 1
   order by 2 desc;
$$;

create or replace function public.finance_summary(
  p_year     int  default null,
  p_quarter  int  default null,
  p_region   text default null,
  p_category text default null,
  group_by   text default 'region'
)
returns table (grp text, revenue numeric, profit numeric, margin numeric, orders bigint)
language sql
stable
set search_path = public
as $$
  select case group_by
           when 'category' then f.category
           when 'year'     then f.year::text
           when 'quarter'  then f.year || '-Q' || f.quarter
           else f.region
         end as grp,
         round(sum(f.revenue), 2),
         round(sum(f.profit), 2),
         round(sum(f.profit) / nullif(sum(f.revenue), 0), 4),
         sum(f.orders)::bigint
    from public.finance_quarterly f
   where (p_year is null or f.year = p_year)
     and (p_quarter is null or f.quarter = p_quarter)
     and (p_region is null or f.region ilike p_region)
     and (p_category is null or f.category ilike p_category)
   group by 1
   order by 1;
$$;

-- Executive approves/denies an access request; approval creates a grant.
create or replace function public.decide_access_request(
  request_id bigint,
  approve    boolean,
  hours      int default 24
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.access_requests;
begin
  if not public.is_executive() then
    raise exception 'decide_access_request: executives only';
  end if;
  select * into r from public.access_requests where id = request_id and status = 'pending';
  if not found then
    raise exception 'request % not found or already decided', request_id;
  end if;
  update public.access_requests
     set status = case when approve then 'approved' else 'denied' end,
         decided_at = now(),
         decided_by = auth.uid()
   where id = request_id;
  if approve then
    insert into public.access_grants (user_id, department, expires_at, granted_by)
    values (r.user_id, r.department, now() + make_interval(hours => greatest(1, least(hours, 168))), auth.uid());
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Function privileges. Postgres grants EXECUTE to PUBLIC by default;
--    lock down the ones that bypass RLS.
-- ---------------------------------------------------------------------
revoke execute on function public.search_departments(text[], text, vector, int, int) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.allowed_departments(uuid) from public, anon;
revoke execute on function public.restricted_matches(vector, float) from public, anon;
revoke execute on function public.view_as_search(text, text, vector, int) from public, anon;
revoke execute on function public.decide_access_request(bigint, boolean, int) from public, anon;
revoke execute on function public.hybrid_search(text, vector, int, int) from anon;

grant execute on function public.allowed_departments(uuid) to authenticated;
grant execute on function public.restricted_matches(vector, float) to authenticated;
grant execute on function public.view_as_search(text, text, vector, int) to authenticated;
grant execute on function public.decide_access_request(bigint, boolean, int) to authenticated;
grant execute on function public.hybrid_search(text, vector, int, int) to authenticated;
grant execute on function public.search_departments(text[], text, vector, int, int) to service_role;
