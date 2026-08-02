-- Joyería Central — esquema Supabase
-- Reemplaza data/products.json como fuente de verdad.

create table if not exists categories (
  id text primary key,
  name text not null,
  "order" integer not null default 0
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  price numeric not null,
  compare_price numeric,
  currency text not null default 'UYU',
  category text not null references categories(id) on delete restrict,
  tags text[] not null default '{}',
  images text[] not null default '{}',
  in_stock boolean not null default true,
  featured boolean not null default false,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_idx on products (category);
create index if not exists products_tags_idx on products using gin (tags);
create index if not exists products_name_idx on products using gin (to_tsvector('spanish', name));

alter table categories enable row level security;
alter table products enable row level security;
-- Sin políticas: solo el backend (secret key, bypassa RLS) puede leer/escribir.
-- El frontend nunca habla directo con Supabase, siempre via la API de Express.
