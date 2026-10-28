-- Pega esto en Supabase → SQL Editor → Run.
create table if not exists public.docs (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (owner, path)
);

alter table public.docs enable row level security;

create policy "solo el dueño" on public.docs
  for all using (owner = auth.uid()) with check (owner = auth.uid());

alter publication supabase_realtime add table public.docs;

-- Proyectos nuevos de Supabase no dan permisos por defecto: solo a usuarios con sesión.
grant select, insert, update, delete on public.docs to authenticated;
