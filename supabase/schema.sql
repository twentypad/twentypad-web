create table if not exists public.tokens(address text primary key check(address ~ '^0x[0-9a-f]{40}$'),creator text not null check(creator ~ '^0x[0-9a-f]{40}$'),name text not null default '-',symbol text not null default '-',decimals integer not null default 18,quote text not null check(quote ~ '^0x[0-9a-f]{40}$'),pool_id text not null default '',initial_tick integer not null default 0,image text not null default '',description text not null default '',website text not null default '',twitter text not null default '',telegram text not null default '',discord text not null default '',editable boolean not null default false,launched_at timestamptz not null,launch_tx text not null unique,salt_uint text not null default '',suffix text not null default '');
create index if not exists tokens_launched_at_idx on public.tokens(launched_at desc);create index if not exists tokens_creator_idx on public.tokens(creator);create index if not exists tokens_quote_idx on public.tokens(quote);
create table if not exists public.token_stats(address text primary key references public.tokens(address) on delete cascade,price_usd numeric null,fdv_usd numeric null,liquidity_quote numeric null,volume_24h numeric null,volume_lifetime numeric null,trades_24h integer not null default 0,trades_lifetime integer not null default 0,holders integer null,updated_at timestamptz not null default now());
create table if not exists public.trades(id bigint generated always as identity primary key,token text not null references public.tokens(address) on delete cascade,tx text not null unique,block_number bigint not null,timestamp timestamptz not null,trader text not null,side text not null check(side in ('buy','sell')),amount_token numeric not null,amount_quote numeric not null,price_usd numeric null);create index if not exists trades_token_time_idx on public.trades(token,timestamp desc);
create table if not exists public.trade_receipts(tx text primary key,token text not null references public.tokens(address),block_number bigint not null,trader text not null,indexed boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.creators(address text primary key,launch_count integer not null default 0,last_launch_at timestamptz null);
create table if not exists public.indexer_state(key text primary key,last_block bigint not null,updated_at timestamptz not null default now());

alter table public.token_stats add column if not exists price_quote numeric null;
alter table public.token_stats add column if not exists initial_price_quote numeric null;
alter table public.token_stats add column if not exists initial_price_usd numeric null;
alter table public.token_stats add column if not exists fdv_quote numeric null;
alter table public.token_stats add column if not exists price_change_24h numeric null;
alter table public.token_stats add column if not exists current_tick integer null;
alter table public.token_stats add column if not exists last_trade_at timestamptz null;
alter table public.trades add column if not exists quote_delta numeric not null default 0;
alter table public.trades add column if not exists price_quote numeric null;
alter table public.trades add column if not exists tick integer null;
alter table public.trades add column if not exists indexer_version integer not null default 1;

with estimates as (
  select
    address,
    initial_tick,
    quote,
    case
      when address < quote then power(1.0001::numeric, initial_tick) * power(10::numeric, decimals - case when quote = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' then 6 else 18 end)
      else power(10::numeric, decimals - case when quote = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' then 6 else 18 end) / power(1.0001::numeric, initial_tick)
    end as price_quote
  from public.tokens
)
insert into public.token_stats(address, price_quote, initial_price_quote, price_usd, initial_price_usd, fdv_quote, fdv_usd, liquidity_quote, volume_24h, volume_lifetime, trades_24h, trades_lifetime, price_change_24h, current_tick)
select address, price_quote, price_quote,
  case when quote = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' then price_quote else null end,
  case when quote = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' then price_quote else null end,
  price_quote * 1000000000,
  case when quote = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' then price_quote * 1000000000 else null end,
  0, 0, 0, 0, 0, 0, initial_tick
from estimates
on conflict(address) do update set
  initial_price_quote = coalesce(public.token_stats.initial_price_quote, excluded.initial_price_quote),
  initial_price_usd = coalesce(public.token_stats.initial_price_usd, excluded.initial_price_usd),
  price_quote = coalesce(public.token_stats.price_quote, excluded.price_quote),
  price_usd = coalesce(public.token_stats.price_usd, excluded.price_usd),
  fdv_quote = coalesce(public.token_stats.fdv_quote, excluded.fdv_quote),
  fdv_usd = coalesce(public.token_stats.fdv_usd, excluded.fdv_usd),
  current_tick = coalesce(public.token_stats.current_tick, excluded.current_tick);

create or replace function public.refresh_token_activity(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lifetime_volume numeric;
  day_volume numeric;
  lifetime_trades integer;
  day_trades integer;
  quote_liquidity numeric;
  first_day_price numeric;
  current_price numeric;
begin
  select
    coalesce(sum(abs(amount_quote)), 0),
    coalesce(sum(abs(amount_quote)) filter (where timestamp >= now() - interval '24 hours'), 0),
    count(*)::integer,
    (count(*) filter (where timestamp >= now() - interval '24 hours'))::integer,
    greatest(coalesce(sum(quote_delta), 0), 0)
  into lifetime_volume, day_volume, lifetime_trades, day_trades, quote_liquidity
  from public.trades
  where token = lower(p_token);

  select price_quote into first_day_price
  from public.trades
  where token = lower(p_token)
    and timestamp >= now() - interval '24 hours'
    and price_quote is not null
  order by timestamp asc
  limit 1;

  select price_quote into current_price
  from public.token_stats
  where address = lower(p_token);

  update public.token_stats
  set volume_lifetime = lifetime_volume,
      volume_24h = day_volume,
      trades_lifetime = lifetime_trades,
      trades_24h = day_trades,
      liquidity_quote = quote_liquidity,
      price_change_24h = case
        when lifetime_trades = 0 then 0
        when first_day_price is null or first_day_price = 0 then 0
        else ((current_price - first_day_price) / first_day_price) * 100
      end,
      last_trade_at = (select max(timestamp) from public.trades where token = lower(p_token)),
      updated_at = now()
  where address = lower(p_token);
end;
$$;

create or replace view public.token_discovery
with (security_invoker = true)
as
select
  t.*,
  s.price_quote,
  s.initial_price_quote,
  s.price_usd,
  s.initial_price_usd,
  s.fdv_quote,
  s.fdv_usd,
  s.liquidity_quote,
  s.volume_24h,
  s.volume_lifetime,
  s.trades_24h,
  s.trades_lifetime,
  s.price_change_24h,
  s.current_tick,
  s.last_trade_at,
  s.holders,
  s.updated_at
from public.tokens t
left join public.token_stats s on s.address = t.address;

create or replace function public.discovery_summary()
returns table(tokens_launched bigint, volume_24h numeric, trades_24h bigint, highest_fdv numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(t.address),
    coalesce(sum(s.volume_24h), 0),
    coalesce(sum(s.trades_24h), 0),
    max(s.fdv_usd)
  from public.tokens t
  left join public.token_stats s on s.address = t.address;
$$;

grant select on public.token_discovery to anon, authenticated;
grant execute on function public.discovery_summary() to anon, authenticated;
create or replace function public.update_creator_count() returns trigger language plpgsql security definer as $$ begin insert into public.creators(address,launch_count,last_launch_at) values(new.creator,1,new.launched_at) on conflict(address) do update set launch_count=(select count(*) from public.tokens where creator=new.creator),last_launch_at=greatest(public.creators.last_launch_at,new.launched_at);return new;end $$;drop trigger if exists tokens_creator_count on public.tokens;create trigger tokens_creator_count after insert on public.tokens for each row execute function public.update_creator_count();
alter table public.tokens enable row level security;alter table public.token_stats enable row level security;alter table public.trades enable row level security;alter table public.creators enable row level security;alter table public.trade_receipts enable row level security;alter table public.indexer_state enable row level security;
drop policy if exists "public read tokens" on public.tokens;
drop policy if exists "public read stats" on public.token_stats;
drop policy if exists "public read trades" on public.trades;
drop policy if exists "public read creators" on public.creators;
create policy "public read tokens" on public.tokens for select using(true);
create policy "public read stats" on public.token_stats for select using(true);
create policy "public read trades" on public.trades for select using(true);
create policy "public read creators" on public.creators for select using(true);

update public.trades
set side = case when side = 'buy' then 'sell' else 'buy' end,
    quote_delta = -quote_delta,
    indexer_version = 2
where indexer_version < 2;

do $$
declare
  trade_token record;
begin
  for trade_token in select distinct token from public.trades loop
    perform public.refresh_token_activity(trade_token.token);
  end loop;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.tokens;
exception when duplicate_object then null;
end $$;
