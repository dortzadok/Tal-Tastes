
create table if not exists public.restaurant_reviews (
  id text primary key,
  created_at timestamptz default now(),
  name text not null,
  venue_type text not null,
  cuisine text not null,
  area text not null,
  price text not null,
  visit_date date,
  best_dish text,
  tag text not null,
  photo_url text not null,
  drive int not null check (drive between 1 and 10),
  parking int not null check (parking between 1 and 10),
  wait int not null check (wait between 1 and 10),
  welcome int not null check (welcome between 1 and 10),
  warmth int not null check (warmth between 1 and 10),
  timing int not null check (timing between 1 and 10),
  accuracy int not null check (accuracy between 1 and 10),
  food int not null check (food between 1 and 10),
  freshness int not null check (freshness between 1 and 10),
  atmosphere int not null check (atmosphere between 1 and 10),
  noise int not null check (noise between 1 and 10),
  value int not null check (value between 1 and 10),
  craving int not null check (craving between 1 and 10),
  recommend text not null,
  moment text not null,
  choose_again text not null,
  notes text,
  score numeric(3,1) not null check (score between 1 and 10)
);

alter table public.restaurant_reviews enable row level security;

create policy "public can read reviews"
on public.restaurant_reviews
for select
to anon
using (true);

create policy "public can insert reviews"
on public.restaurant_reviews
for insert
to anon
with check (true);
