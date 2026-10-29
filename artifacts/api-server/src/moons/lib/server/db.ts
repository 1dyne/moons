
// Plain Postgres. DATABASE_URL (Replit, Supabase, Neon …) in production;
// an embedded PGlite file under .data/ for local development with no install.
type Row = Record<string, unknown>;
export type Driver = {query: (sql: string, params?: unknown[]) => Promise<{rows: Row[]}>;transaction?:<T>(work:(driver:Driver)=>Promise<T>)=>Promise<T>};

export const SCHEMA = `
create table if not exists spaces (
  id text primary key,
  kind text not null default 'event',
  config jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists entries (
  id text primary key,
  space_id text not null references spaces(id),
  participant_id text not null,
  nickname text,
  kind text not null default 'spark',
  question_id text,
  body text not null,
  sentences jsonb not null default '[]',
  input text not null default 'text',
  hidden boolean not null default false,
  status text not null default 'saved',
  error text,
  parent_entry text,
  created_at timestamptz not null default now()
);
create index if not exists entries_space_idx on entries(space_id, created_at desc);
create table if not exists analyses (
  id text primary key,
  entry_id text not null references entries(id),
  structure text not null,
  structure_reason text not null default '',
  nodes jsonb not null,
  edges jsonb not null,
  signals jsonb not null,
  planet_ids jsonb not null default '[]',
  model text not null,
  prompt_version text not null,
  fallback boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists analyses_entry_idx on analyses(entry_id, created_at desc);
create table if not exists node_vectors (
  entry_id text not null references entries(id),
  node_id text not null,
  space_id text not null,
  text text not null,
  embedding jsonb not null,
  primary key (entry_id, node_id)
);
create index if not exists node_vectors_space_idx on node_vectors(space_id);
create table if not exists links (
  id text primary key,
  space_id text not null,
  from_entry text not null references entries(id),
  from_node text not null,
  to_entry text not null references entries(id),
  to_node text not null,
  kind text not null,
  reason text not null,
  score real not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists links_space_idx on links(space_id);
create table if not exists crossroads (
  id text primary key,
  entry_id text not null references entries(id),
  situation text not null,
  paths jsonb not null,
  chosen_path text,
  chosen_reason text,
  decision_entry text,
  model text not null,
  created_at timestamptz not null default now()
);
create table if not exists materials (
  id text primary key,
  space_id text not null,
  entry_id text,
  title text not null,
  filename text not null default '',
  mime text not null default '',
  bytes bigint not null default 0,
  duration real not null default 0,
  status text not null default 'uploading',
  sentence_times jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create table if not exists material_parts (
  material_id text not null,
  seq int not null,
  data bytea,
  object_path text,
  primary key (material_id, seq)
);
create table if not exists material_chunks (
  material_id text not null,
  seq int not null,
  start_sec real not null,
  end_sec real not null,
  text text not null,
  primary key (material_id, seq)
);
create table if not exists comparisons (
  entry_id text primary key,
  material_entry_id text not null,
  summary text not null default '',
  items jsonb not null default '[]',
  model text not null default '',
  created_at timestamptz not null default now()
);
alter table material_parts add column if not exists object_path text;
alter table material_parts alter column data drop not null;
`;

const g = globalThis as unknown as {__moonsDb?: Promise<Driver>};

async function connect(): Promise<Driver> {
  let driver: Driver;
  if (process.env.MOONS_DATABASE_URL) {
    const {Pool} = await import('pg');
    const pool = new Pool({connectionString: process.env.MOONS_DATABASE_URL, max: 5});
    driver = {query: (sql, params) => pool.query(sql, params as unknown[]),transaction:async work=>{
      const client=await pool.connect();
      try{await client.query('begin');const result=await work({query:(sql,params)=>client.query(sql,params)});await client.query('commit');return result}
      catch(error){await client.query('rollback');throw error}finally{client.release()}
    }};
  } else {
    const {PGlite} = await import('@electric-sql/pglite');
    const dir = process.env.PGLITE_DIR || './.data/pglite';
    const {mkdirSync} = await import('node:fs');
    mkdirSync(dir, {recursive: true});
    const db = await PGlite.create(dir);
    driver = {query: (sql, params) => db.query(sql, params) as Promise<{rows: Row[]}>,transaction:work=>db.transaction(tx=>work({query:(sql,params)=>tx.query(sql,params) as Promise<{rows:Row[]}>}))};
  }
  for (const statement of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await driver.query(statement);
  return driver;
}

export function db() {
  g.__moonsDb ??= connect().catch(error => { g.__moonsDb = undefined; throw error; });
  return g.__moonsDb;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const driver = await db();
  const result = await driver.query(sql, params);
  return result.rows as T[];
}

export async function transaction<T>(work:(driver:Driver)=>Promise<T>) {
  const driver=await db();
  if(!driver.transaction)throw new Error('Database transaction support is required.');
  return driver.transaction(work);
}

export const json = (value: unknown) => JSON.stringify(value);
export const iso = (value: unknown) => value instanceof Date ? value.toISOString() : String(value);
export const newId = () => crypto.randomUUID();
