create table if not exists templates (
  id uuid primary key,
  name text not null check (length(trim(name)) > 0),
  source_kind text not null default 'spectora_html_export',
  source_file_name text,
  source_sha256 text,
  copied_from_id uuid references templates(id) on delete set null,
  is_sample boolean not null default false,
  import_report jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sections (
  id uuid primary key,
  template_id uuid not null references templates(id) on delete cascade,
  position integer not null,
  name text not null,
  original_name text,
  source_row integer
);

create table if not exists items (
  id uuid primary key,
  section_id uuid not null references sections(id) on delete cascade,
  position integer not null,
  name text not null,
  original_name text,
  source_row integer
);

create table if not exists comments (
  id uuid primary key,
  item_id uuid not null references items(id) on delete cascade,
  position integer not null,
  name text not null default '',
  original_name text,
  body_html text not null default '',
  original_body_html text,
  source_body_html text,
  comment_type text not null default 'info' check (comment_type in ('info', 'limit', 'defect', 'unknown')),
  raw_comment_type text,
  attributes jsonb not null default '{}'::jsonb,
  source_row integer
);

create index if not exists sections_template_position on sections (template_id, position);
create index if not exists items_section_position on items (section_id, position);
create index if not exists comments_item_position on comments (item_id, position);
create index if not exists templates_source_sha on templates (source_sha256);

alter table templates enable row level security;
alter table sections enable row level security;
alter table items enable row level security;
alter table comments enable row level security;
