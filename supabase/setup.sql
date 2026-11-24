-- Symbol Duel: shared scoreboard. Run this once in the Supabase SQL Editor.
-- Everything it creates starts with "symbol_", so it is safe in an existing project,
-- and running it again does no harm.
--
-- The game never reads or writes the tables directly. It calls the three functions
-- below, which check every value and refuse to change a finished result.

create table if not exists public.symbol_duels (
  id         text primary key check (id ~ '^[a-z0-9]{8,24}$'),
  room       text not null check (room ~ '^[a-z0-9]{16,40}$'),
  seed       integer not null check (seed >= 0),
  created_by text not null check (char_length(created_by) between 1 and 40),
  created_at timestamptz not null default now()
);
create index if not exists symbol_duels_room on public.symbol_duels (room);

create table if not exists public.symbol_results (
  duel_id     text not null references public.symbol_duels (id) on delete cascade,
  player_key  text not null check (char_length(player_key) between 1 and 60),
  room        text not null,
  name        text not null check (char_length(name) between 1 and 40),
  started_at  bigint not null,
  finished_at bigint,
  time_ms     integer check (time_ms >= 0),
  mistakes    integer not null default 0 check (mistakes >= 0),
  splits      integer[] not null default '{}' check (cardinality(splits) <= 10),
  dnf         boolean not null default false,
  primary key (duel_id, player_key)
);
create index if not exists symbol_results_room on public.symbol_results (room);

-- Lock the tables: row level security with no policies, and no table rights for API users.
alter table public.symbol_duels enable row level security;
alter table public.symbol_results enable row level security;
revoke all on public.symbol_duels, public.symbol_results from anon, authenticated;

-- Everything stored for one game. A game is found only by its unguessable id.
create or replace function public.symbol_duel_room(p_room text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_room is null or p_room !~ '^[a-z0-9]{16,40}$' then
    raise exception 'Unknown game.';
  end if;
  return jsonb_build_object(
    'duels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'seed', d.seed, 'createdBy', d.created_by,
               'createdAt', floor(extract(epoch from d.created_at) * 1000)::bigint)
             order by d.created_at, d.id)
      from public.symbol_duels d where d.room = p_room), '[]'::jsonb),
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.duel_id || '_' || r.player_key, 'duelId', r.duel_id,
               'key', r.player_key, 'name', r.name,
               'startedAt', r.started_at, 'finishedAt', r.finished_at, 'timeMs', r.time_ms,
               'mistakes', r.mistakes, 'splits', to_jsonb(r.splits), 'dnf', r.dnf))
      from public.symbol_results r where r.room = p_room), '[]'::jsonb));
end;
$$;

-- A new duel. Duels are never changed or deleted.
create or replace function public.symbol_duel_create(p_room text, p_id text, p_seed integer, p_created_by text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_room is null or p_room !~ '^[a-z0-9]{16,40}$' then
    raise exception 'Unknown game.';
  end if;
  if (select count(*) from public.symbol_duels d where d.room = p_room) >= 5000 then
    raise exception 'This game has reached its limit of 5000 duels.';
  end if;
  insert into public.symbol_duels (id, room, seed, created_by)
  values (p_id, p_room, p_seed, btrim(p_created_by))
  on conflict (id) do nothing;
  if not exists (select 1 from public.symbol_duels d where d.id = p_id and d.room = p_room) then
    raise exception 'That duel id is already in use.';
  end if;
end;
$$;

-- One player's result for one duel: stored when the clock starts, completed at the finish.
-- A result with a finish time is final.
create or replace function public.symbol_duel_save_result(p_room text, p_result jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_duel     text := p_result ->> 'duelId';
  v_key      text := p_result ->> 'key';
  v_name     text := btrim(p_result ->> 'name');
  v_dnf      boolean := coalesce(p_result -> 'dnf' = 'true'::jsonb, false);
  v_started  bigint;
  v_finished bigint;
  v_time     integer;
  v_mistakes integer := 0;
  v_splits   integer[] := '{}';
  v_old      public.symbol_results;
begin
  if p_room is null or p_room !~ '^[a-z0-9]{16,40}$' then
    raise exception 'Unknown game.';
  end if;
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'A result must be an object.';
  end if;
  if not exists (select 1 from public.symbol_duels d where d.id = v_duel and d.room = p_room) then
    raise exception 'Unknown duel.';
  end if;
  if jsonb_typeof(p_result -> 'startedAt') is distinct from 'number' then
    raise exception 'A result needs a start time.';
  end if;
  v_started := round((p_result ->> 'startedAt')::numeric);
  if jsonb_typeof(p_result -> 'finishedAt') = 'number' then
    v_finished := round((p_result ->> 'finishedAt')::numeric);
    if jsonb_typeof(p_result -> 'timeMs') = 'number' then
      v_time := round((p_result ->> 'timeMs')::numeric);
    end if;
    if v_time is null and not v_dnf then
      raise exception 'A finished result needs a time.';
    end if;
  end if;
  if jsonb_typeof(p_result -> 'mistakes') = 'number' then
    v_mistakes := round((p_result ->> 'mistakes')::numeric);
  end if;
  if jsonb_typeof(p_result -> 'splits') = 'array' then
    if jsonb_array_length(p_result -> 'splits') > 10
       or exists (select 1 from jsonb_array_elements(p_result -> 'splits') e where jsonb_typeof(e) <> 'number') then
      raise exception 'Splits must be at most 10 numbers.';
    end if;
    select coalesce(array_agg(round((e #>> '{}')::numeric)::integer order by n), '{}')
      into v_splits
      from jsonb_array_elements(p_result -> 'splits') with ordinality as t(e, n);
  end if;
  v_dnf := v_dnf and v_finished is not null;

  select * into v_old from public.symbol_results r
   where r.duel_id = v_duel and r.player_key = v_key
   for update;
  if not found then
    if (select count(*) from public.symbol_results r where r.duel_id = v_duel) >= 10 then
      raise exception 'This duel already has 10 players.';
    end if;
    insert into public.symbol_results
      (duel_id, player_key, room, name, started_at, finished_at, time_ms, mistakes, splits, dnf)
    values (v_duel, v_key, p_room, v_name, v_started, v_finished, v_time, v_mistakes, v_splits, v_dnf);
  elsif v_old.finished_at is not null then
    if v_old.finished_at = v_finished and v_old.time_ms is not distinct from v_time then
      return;  -- the same final result sent twice
    end if;
    raise exception 'This result is already final.';
  elsif v_old.started_at <> v_started then
    raise exception 'The start time cannot change.';
  else
    update public.symbol_results
       set name = v_name, finished_at = v_finished, time_ms = v_time,
           mistakes = v_mistakes, splits = v_splits, dnf = v_dnf
     where duel_id = v_duel and player_key = v_key;
  end if;
end;
$$;

-- Only these three functions are reachable with the publishable key.
revoke all on function public.symbol_duel_room(text) from public, anon, authenticated;
revoke all on function public.symbol_duel_create(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.symbol_duel_save_result(text, jsonb) from public, anon, authenticated;
grant execute on function public.symbol_duel_room(text) to anon, authenticated;
grant execute on function public.symbol_duel_create(text, text, integer, text) to anon, authenticated;
grant execute on function public.symbol_duel_save_result(text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
