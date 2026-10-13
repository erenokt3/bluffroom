-- BluffRoom initial schema
-- Security model:
--   * The browser NEVER talks to these tables directly. All reads/writes go
--     through authenticated Next.js server routes using a privileged
--     server-side connection (DATABASE_URL).
--   * RLS is enabled on every table with NO policies for anon/authenticated,
--     i.e. deny-all for Supabase's public API (PostgREST / Realtime changes).
--   * Secret data (true answers, answer authorship, votes) is only released by
--     the server in the phase where it is allowed to be seen.

create table if not exists rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  host_player_id   uuid,
  status           text not null default 'lobby',
  current_game_id  uuid,
  current_round    int  not null default 0,
  max_players      int  not null default 12,
  version          bigint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  constraint rooms_code_format check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  constraint rooms_code_unique unique (code),
  constraint rooms_status_check check (status in ('lobby', 'playing', 'finished')),
  constraint rooms_max_players_check check (max_players between 4 and 12),
  constraint rooms_round_check check (current_round between 0 and 10)
);
create index if not exists rooms_last_activity_idx on rooms (last_activity_at);

create table if not exists players (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms (id) on delete cascade,
  nickname      text not null,
  nickname_key  text not null,
  -- sha256 of the random session secret embedded in the signed guest token
  session_hash  text not null,
  seat_order    int  not null,
  is_ready      boolean not null default false,
  total_score   int  not null default 0,
  joined_at     timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  left_at       timestamptz,
  constraint players_nickname_len check (char_length(nickname) between 2 and 16),
  constraint players_score_nonneg check (total_score >= 0)
);
create unique index if not exists players_room_nickname_active_uq
  on players (room_id, nickname_key) where left_at is null;
create index if not exists players_room_idx on players (room_id, seat_order);

alter table rooms drop constraint if exists rooms_host_fk;
alter table rooms add constraint rooms_host_fk
  foreign key (host_player_id) references players (id) on delete set null;

create table if not exists games (
  id               uuid primary key default gen_random_uuid(),
  room_id          uuid not null references rooms (id) on delete cascade,
  status           text not null default 'active',
  phase            text not null default 'GENERATING_QUESTIONS',
  total_rounds     int  not null default 10,
  current_round    int  not null default 0,
  phase_started_at timestamptz not null default now(),
  phase_deadline   timestamptz,
  question_source  text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  constraint games_status_check check (status in ('active', 'finished', 'aborted')),
  constraint games_phase_check check (phase in (
    'GENERATING_QUESTIONS', 'QUESTION_INTRO', 'ANSWER_SUBMISSION',
    'VOTING', 'REVEAL', 'SCOREBOARD', 'FINAL_RESULTS')),
  constraint games_total_rounds_check check (total_rounds = 10),
  constraint games_round_check check (current_round between 0 and total_rounds)
);
create unique index if not exists games_one_active_per_room_uq on games (room_id) where status = 'active';

alter table rooms drop constraint if exists rooms_current_game_fk;
alter table rooms add constraint rooms_current_game_fk
  foreign key (current_game_id) references games (id) on delete set null;

-- Snapshot of who takes part in a game + per-game aggregate stats.
create table if not exists game_players (
  game_id        uuid not null references games (id) on delete cascade,
  player_id      uuid not null references players (id) on delete cascade,
  score          int  not null default 0,
  correct_count  int  not null default 0,
  fooled_points  int  not null default 0,
  primary key (game_id, player_id),
  constraint game_players_nonneg check (score >= 0 and correct_count >= 0 and fooled_points >= 0)
);

create table if not exists questions (
  id               uuid primary key default gen_random_uuid(),
  game_id          uuid not null references games (id) on delete cascade,
  round_number     int  not null,
  owner_player_id  uuid not null references players (id) on delete cascade,
  question_text    text not null,
  category         text not null,
  locale           text not null default 'tr',
  source           text not null default 'fallback',
  status           text not null default 'pending',
  scored_at        timestamptz,
  constraint questions_round_check check (round_number between 1 and 10),
  constraint questions_text_len check (char_length(question_text) between 5 and 200),
  constraint questions_status_check check (status in ('pending', 'answering', 'voting', 'revealed', 'skipped')),
  constraint questions_source_check check (source in ('ai', 'fallback')),
  constraint questions_round_uq unique (game_id, round_number)
);

create table if not exists submissions (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references questions (id) on delete cascade,
  player_id        uuid not null references players (id) on delete cascade,
  answer_text      text not null,
  normalized_text  text not null,
  is_correct       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint submissions_len check (char_length(answer_text) between 1 and 80),
  constraint submissions_one_per_player_uq unique (question_id, player_id)
);
create unique index if not exists submissions_one_correct_uq on submissions (question_id) where is_correct;

create table if not exists answer_options (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references questions (id) on delete cascade,
  opaque_id        text not null,
  display_order    int  not null,
  option_text      text not null,
  normalized_text  text not null,
  is_correct       boolean not null default false,
  constraint answer_options_opaque_uq unique (question_id, opaque_id),
  constraint answer_options_order_uq unique (question_id, display_order),
  constraint answer_options_text_uq unique (question_id, normalized_text)
);
create unique index if not exists answer_options_one_correct_uq on answer_options (question_id) where is_correct;

-- Secret: which player(s) wrote which option (several players may write the same fake).
create table if not exists option_authors (
  option_id      uuid not null references answer_options (id) on delete cascade,
  submission_id  uuid not null references submissions (id) on delete cascade,
  player_id      uuid not null references players (id) on delete cascade,
  primary key (option_id, player_id)
);

create table if not exists votes (
  id                uuid primary key default gen_random_uuid(),
  question_id       uuid not null references questions (id) on delete cascade,
  voter_player_id   uuid not null references players (id) on delete cascade,
  answer_option_id  uuid not null references answer_options (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint votes_one_per_player_uq unique (question_id, voter_player_id)
);

-- One row per participant per scored question => scoring can never be applied twice.
create table if not exists round_results (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games (id) on delete cascade,
  question_id    uuid not null references questions (id) on delete cascade,
  player_id      uuid not null references players (id) on delete cascade,
  points_earned  int  not null default 0,
  correct_guess  boolean not null default false,
  fooled_points  int  not null default 0,
  created_at     timestamptz not null default now(),
  constraint round_results_nonneg check (points_earned >= 0 and fooled_points >= 0),
  constraint round_results_uq unique (question_id, player_id)
);
create index if not exists round_results_game_idx on round_results (game_id, player_id);

create table if not exists game_events (
  id          bigserial primary key,
  room_id     uuid not null references rooms (id) on delete cascade,
  game_id     uuid references games (id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists game_events_room_idx on game_events (room_id, created_at);

create table if not exists rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         int not null
);

-- ---------------------------------------------------------------------------
-- Defence in depth: reject invalid phase transitions at the database level.
-- Mirrors src/lib/game/stateMachine.ts
-- ---------------------------------------------------------------------------
create or replace function bluff_check_phase_transition() returns trigger
language plpgsql as $$
begin
  if new.phase is distinct from old.phase then
    if not (
      (old.phase = 'GENERATING_QUESTIONS' and new.phase in ('QUESTION_INTRO', 'FINAL_RESULTS')) or
      (old.phase = 'QUESTION_INTRO'       and new.phase in ('ANSWER_SUBMISSION', 'SCOREBOARD', 'FINAL_RESULTS')) or
      (old.phase = 'ANSWER_SUBMISSION'    and new.phase in ('VOTING', 'FINAL_RESULTS')) or
      (old.phase = 'VOTING'               and new.phase in ('REVEAL', 'FINAL_RESULTS')) or
      (old.phase = 'REVEAL'               and new.phase in ('SCOREBOARD', 'FINAL_RESULTS')) or
      (old.phase = 'SCOREBOARD'           and new.phase in ('QUESTION_INTRO', 'FINAL_RESULTS'))
    ) then
      raise exception 'invalid phase transition % -> %', old.phase, new.phase
        using errcode = 'check_violation';
    end if;
  end if;
  if old.status <> 'active' and new.phase is distinct from old.phase then
    raise exception 'game is not active' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists games_phase_transition on games;
create trigger games_phase_transition before update on games
  for each row execute function bluff_check_phase_transition();

-- ---------------------------------------------------------------------------
-- Row Level Security: enable everywhere, define NO policies for client roles.
-- ---------------------------------------------------------------------------
alter table rooms          enable row level security;
alter table players        enable row level security;
alter table games          enable row level security;
alter table game_players   enable row level security;
alter table questions      enable row level security;
alter table submissions    enable row level security;
alter table answer_options enable row level security;
alter table option_authors enable row level security;
alter table votes          enable row level security;
alter table round_results  enable row level security;
alter table game_events    enable row level security;
alter table rate_limits    enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'revoke execute on function bluff_check_phase_transition() from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'revoke execute on function bluff_check_phase_transition() from authenticated';
  end if;
end
$$;
