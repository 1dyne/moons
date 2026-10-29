export const PROJECT_TABLES = [
  `create table if not exists project_connections(owner_id text not null,id text not null,project_id text not null,data jsonb not null,credential text,revision integer not null default 1,primary key(owner_id,id))`,
  `create index if not exists project_connections_project on project_connections(owner_id,project_id)`,
  `create table if not exists connected_projects(owner_id text not null,id text not null,data jsonb not null,revision integer not null default 1,github_key text,telemetry_hash text,primary key(owner_id,id))`,
  `create unique index if not exists project_telemetry_token on connected_projects(telemetry_hash) where telemetry_hash is not null`,
  `create table if not exists project_proposals(owner_id text not null,id text not null,project_id text not null,entry_id text not null,data jsonb not null,revision integer not null default 1,primary key(owner_id,id),unique(owner_id,project_id,entry_id))`,
  `create table if not exists project_jobs(id text primary key,owner_id text not null,entry_id text not null,tag_key text not null,state text not null default 'queued',attempts integer not null default 0,lease text,available_at timestamptz not null default now(),started_at timestamptz,error text,created_at timestamptz not null default now(),unique(owner_id,entry_id,tag_key))`,
  `create index if not exists project_jobs_queue on project_jobs(state,available_at)`,
  `create table if not exists project_events(owner_id text not null,project_id text not null,id text not null,data jsonb not null,at timestamptz not null,primary key(owner_id,project_id,id))`,
  `create index if not exists project_events_time on project_events(owner_id,at desc)`,
];
