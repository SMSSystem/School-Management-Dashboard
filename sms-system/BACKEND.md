# Backend — Supabase Setup

This project uses [Supabase](https://supabase.com) as the backend — Postgres database, authentication, row-level security, and file storage.

---

## Stack

| Layer | Tool |
|---|---|
| Database | Postgres 17 (via Supabase) |
| Auth | Supabase Auth |
| Storage | Supabase Storage (avatars bucket) |
| Client | `@supabase/supabase-js` |
| Migrations | Supabase CLI |

---

## Project Structure

```
sms-system/
├── src/lib/
│   ├── supabase.ts        # Supabase client singleton
│   └── AuthContext.tsx    # AuthProvider + useAuth() hook
├── supabase/
│   ├── config.toml        # Supabase CLI project config (linked to remote)
│   └── migrations/
│       └── 20260325215843_initial_schema.sql   # initial 15-table schema
└── .env                   # local env vars (gitignored)
```

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Fill in the values from **Supabase Dashboard → Project Settings → API**:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Install the Supabase CLI

```bash
# Linux
curl -o /tmp/supabase.tar.gz -L "https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz"
mkdir -p ~/.local/bin
tar -xzf /tmp/supabase.tar.gz -C /tmp && mv /tmp/supabase ~/.local/bin/supabase
chmod +x ~/.local/bin/supabase
export PATH="$HOME/.local/bin:$PATH"   # add this to ~/.bashrc to persist
```

### 4. Authenticate and link

Generate a personal access token at **supabase.com/dashboard/account/tokens**, then:

```bash
export SUPABASE_ACCESS_TOKEN=<your-token>
supabase link --project-ref <project-ref>
```

---

## Database Migrations

All schema changes are tracked as versioned SQL files in `supabase/migrations/`. Never edit existing migration files — always create a new one.

### Applying migrations to the remote database

> **Note:** Port 5432 (direct connection) may be blocked on some networks. Use the transaction pooler on port 6543 instead.

```bash
supabase db push --db-url "postgresql://postgres.<project-ref>:<db-password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres"
```

To avoid typing this every time, add to your `~/.bashrc`:

```bash
export SUPABASE_ACCESS_TOKEN=<your-token>
export SUPABASE_DB_URL="postgresql://postgres.<project-ref>:<db-password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres"
alias sbpush='supabase db push --db-url "$SUPABASE_DB_URL"'
```

Then just run `sbpush`.

### Creating a new migration

```bash
supabase migration new <descriptive_name>
# e.g. supabase migration new add_attendance_table
```

This creates a new timestamped file in `supabase/migrations/`. Write your SQL in that file, then push it with `sbpush`.

---

## Database Schema

15 tables in dependency order:

| # | Table | Description |
|---|---|---|
| 1 | `profiles` | One row per auth user — stores role and username |
| 2 | `subjects` | School subjects (Maths, English, etc.) |
| 3 | `teachers` | Teacher profiles (linked to auth.users) |
| 4 | `classes` | School classes with grade and supervisor |
| 5 | `students` | Student profiles (linked to auth.users) |
| 6 | `parents` | Parent profiles (linked to auth.users) |
| 7 | `teacher_subjects` | Junction — which teachers teach which subjects |
| 8 | `teacher_classes` | Junction — which teachers are assigned to which classes |
| 9 | `student_parents` | Junction — which students belong to which parents |
| 10 | `lessons` | Recurring lesson slots (day + time) |
| 11 | `exams` | Scheduled exams with start/end times |
| 12 | `assignments` | Assignments with start and due dates |
| 13 | `results` | Scores for exams or assignments |
| 14 | `events` | School or class-specific events |
| 15 | `announcements` | School or class-specific announcements |

---

## Authentication

Roles: `admin`, `teacher`, `student`, `parent`

The role is stored in the `profiles` table and is set at signup via `user_metadata.role`. A Postgres trigger (`handle_new_user`) automatically creates a profile row whenever a new auth user is created.

The `useAuth()` hook (in `src/lib/AuthContext.tsx`) exposes:

```ts
const { user, role, session, loading, signIn, signOut } = useAuth();
```

Wrap your app with `<AuthProvider>` in `main.tsx` to use it anywhere.

---

## Row-Level Security

RLS is enabled on all tables. The general rules are:

- **Admin** — full read/write access everywhere
- **Teacher** — reads students and results in their assigned classes; writes their own lessons, exams, assignments
- **Student** — reads own record and own results only
- **Parent** — reads their linked children's records and results only

Two helper functions are used in policies:
- `get_my_role()` — returns the current user's role
- `get_my_class_id()` — returns the current student's class ID

---

## Storage

An `avatars` bucket is created as part of the initial migration. It is public (read), but only authenticated users can upload. Users can only update their own objects.
