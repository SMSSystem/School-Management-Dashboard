-- ============================================================
-- School Management Dashboard — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Enable UUID extension (already enabled by default in Supabase)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- One row per auth user; stores role + display username
-- ============================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin','teacher','student','parent')),
  username   text unique not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. SUBJECTS
-- ============================================================
create table if not exists public.subjects (
  id   bigint generated always as identity primary key,
  name text unique not null
);

-- ============================================================
-- 3. TEACHERS
-- id = auth.users.id so we can join on profiles
-- ============================================================
create table if not exists public.teachers (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text unique not null,
  phone       text,
  address     text,
  blood_type  text,
  birthday    date,
  sex         text check (sex in ('male','female')),
  photo_url   text,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 4. CLASSES
-- supervisor_id added after teachers table
-- ============================================================
create table if not exists public.classes (
  id            bigint generated always as identity primary key,
  name          text unique not null,
  capacity      int not null default 30,
  grade         int not null,
  supervisor_id uuid references public.teachers(id) on delete set null
);

-- ============================================================
-- 5. STUDENTS
-- ============================================================
create table if not exists public.students (
  id          uuid primary key references auth.users(id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text unique not null,
  phone       text,
  address     text,
  blood_type  text,
  birthday    date,
  sex         text check (sex in ('male','female')),
  photo_url   text,
  grade       int,
  class_id    bigint references public.classes(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 6. PARENTS
-- ============================================================
create table if not exists public.parents (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text unique not null,
  phone      text,
  address    text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 7. JUNCTION: teacher_subjects
-- ============================================================
create table if not exists public.teacher_subjects (
  teacher_id uuid references public.teachers(id) on delete cascade,
  subject_id bigint references public.subjects(id) on delete cascade,
  primary key (teacher_id, subject_id)
);

-- ============================================================
-- 8. JUNCTION: teacher_classes
-- ============================================================
create table if not exists public.teacher_classes (
  teacher_id uuid references public.teachers(id) on delete cascade,
  class_id   bigint references public.classes(id) on delete cascade,
  primary key (teacher_id, class_id)
);

-- ============================================================
-- 9. JUNCTION: student_parents
-- ============================================================
create table if not exists public.student_parents (
  student_id uuid references public.students(id) on delete cascade,
  parent_id  uuid references public.parents(id) on delete cascade,
  primary key (student_id, parent_id)
);

-- ============================================================
-- 10. LESSONS
-- A lesson = a recurring slot (day + time) for a subject in a class
-- ============================================================
create table if not exists public.lessons (
  id         bigint generated always as identity primary key,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  class_id   bigint not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  day        text not null check (day in ('Monday','Tuesday','Wednesday','Thursday','Friday')),
  start_time time not null,
  end_time   time not null
);

-- ============================================================
-- 11. EXAMS
-- ============================================================
create table if not exists public.exams (
  id         bigint generated always as identity primary key,
  title      text not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  class_id   bigint not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  start_time timestamptz not null,
  end_time   timestamptz not null
);

-- ============================================================
-- 12. ASSIGNMENTS
-- ============================================================
create table if not exists public.assignments (
  id         bigint generated always as identity primary key,
  title      text not null,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  class_id   bigint not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  start_date date not null,
  due_date   date not null
);

-- ============================================================
-- 13. RESULTS
-- Exactly one of exam_id or assignment_id must be set
-- ============================================================
create table if not exists public.results (
  id             bigint generated always as identity primary key,
  score          numeric not null,
  type           text not null check (type in ('exam','assignment')),
  exam_id        bigint references public.exams(id) on delete cascade,
  assignment_id  bigint references public.assignments(id) on delete cascade,
  student_id     uuid not null references public.students(id) on delete cascade,
  constraint results_one_source check (
    (exam_id is not null and assignment_id is null) or
    (exam_id is null and assignment_id is not null)
  )
);

-- ============================================================
-- 14. EVENTS
-- class_id = null means school-wide event
-- ============================================================
create table if not exists public.events (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text,
  class_id    bigint references public.classes(id) on delete cascade,
  start_time  timestamptz not null,
  end_time    timestamptz not null
);

-- ============================================================
-- 15. ANNOUNCEMENTS
-- class_id = null means school-wide
-- ============================================================
create table if not exists public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  description text,
  class_id    bigint references public.classes(id) on delete cascade,
  date        date not null default current_date
);

-- ============================================================
-- TRIGGER: auto-insert into profiles on new auth user signup
-- The role must be passed as user_metadata.role at signup time
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    coalesce(new.raw_user_meta_data->>'username', new.email)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- HELPER: get current user's role (used in RLS policies)
-- ============================================================
create or replace function public.get_my_role()
returns text
language sql
stable
security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- HELPER: get current user's class_id (for student RLS)
-- ============================================================
create or replace function public.get_my_class_id()
returns bigint
language sql
stable
security definer
as $$
  select class_id from public.students where id = auth.uid();
$$;

-- ============================================================
-- ENABLE ROW LEVEL SECURITY on all tables
-- ============================================================
alter table public.profiles      enable row level security;
alter table public.subjects      enable row level security;
alter table public.teachers      enable row level security;
alter table public.classes       enable row level security;
alter table public.students      enable row level security;
alter table public.parents       enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.teacher_classes  enable row level security;
alter table public.student_parents  enable row level security;
alter table public.lessons       enable row level security;
alter table public.exams         enable row level security;
alter table public.assignments   enable row level security;
alter table public.results       enable row level security;
alter table public.events        enable row level security;
alter table public.announcements enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- profiles: users can read their own; admin can read all
create policy "profiles: self read"
  on public.profiles for select
  using (id = auth.uid() or get_my_role() = 'admin');

-- subjects: all authenticated users can read; admin can write
create policy "subjects: authenticated read"
  on public.subjects for select
  using (auth.role() = 'authenticated');

create policy "subjects: admin write"
  on public.subjects for all
  using (get_my_role() = 'admin');

-- teachers: all authenticated can read; admin can write
create policy "teachers: authenticated read"
  on public.teachers for select
  using (auth.role() = 'authenticated');

create policy "teachers: admin write"
  on public.teachers for all
  using (get_my_role() = 'admin');

-- teachers can update their own record
create policy "teachers: self update"
  on public.teachers for update
  using (id = auth.uid());

-- classes: all authenticated can read; admin can write
create policy "classes: authenticated read"
  on public.classes for select
  using (auth.role() = 'authenticated');

create policy "classes: admin write"
  on public.classes for all
  using (get_my_role() = 'admin');

-- students: admin reads all; teacher reads students in their classes;
--           student reads own; parent reads their children (via student_parents)
create policy "students: admin read"
  on public.students for select
  using (get_my_role() = 'admin');

create policy "students: teacher read"
  on public.students for select
  using (
    get_my_role() = 'teacher' and
    class_id in (
      select class_id from public.teacher_classes where teacher_id = auth.uid()
    )
  );

create policy "students: self read"
  on public.students for select
  using (id = auth.uid());

create policy "students: parent read"
  on public.students for select
  using (
    get_my_role() = 'parent' and
    id in (
      select student_id from public.student_parents where parent_id = auth.uid()
    )
  );

create policy "students: admin write"
  on public.students for all
  using (get_my_role() = 'admin');

-- students can update their own record
create policy "students: self update"
  on public.students for update
  using (id = auth.uid());

-- parents: admin reads all; parent reads own record
create policy "parents: admin read"
  on public.parents for select
  using (get_my_role() = 'admin');

create policy "parents: self read"
  on public.parents for select
  using (id = auth.uid());

create policy "parents: admin write"
  on public.parents for all
  using (get_my_role() = 'admin');

-- junction tables: admin full access; others read-only
create policy "teacher_subjects: admin write"
  on public.teacher_subjects for all using (get_my_role() = 'admin');
create policy "teacher_subjects: authenticated read"
  on public.teacher_subjects for select using (auth.role() = 'authenticated');

create policy "teacher_classes: admin write"
  on public.teacher_classes for all using (get_my_role() = 'admin');
create policy "teacher_classes: authenticated read"
  on public.teacher_classes for select using (auth.role() = 'authenticated');

create policy "student_parents: admin write"
  on public.student_parents for all using (get_my_role() = 'admin');
create policy "student_parents: self read"
  on public.student_parents for select
  using (student_id = auth.uid() or parent_id = auth.uid() or get_my_role() = 'admin');

-- lessons: all authenticated read; admin/teacher write
create policy "lessons: authenticated read"
  on public.lessons for select using (auth.role() = 'authenticated');
create policy "lessons: admin write"
  on public.lessons for all using (get_my_role() = 'admin');
create policy "lessons: teacher write own"
  on public.lessons for all using (teacher_id = auth.uid());

-- exams: all authenticated read; admin/teacher write
create policy "exams: authenticated read"
  on public.exams for select using (auth.role() = 'authenticated');
create policy "exams: admin write"
  on public.exams for all using (get_my_role() = 'admin');
create policy "exams: teacher write own"
  on public.exams for all using (teacher_id = auth.uid());

-- assignments: all authenticated read; admin/teacher write
create policy "assignments: authenticated read"
  on public.assignments for select using (auth.role() = 'authenticated');
create policy "assignments: admin write"
  on public.assignments for all using (get_my_role() = 'admin');
create policy "assignments: teacher write own"
  on public.assignments for all using (teacher_id = auth.uid());

-- results: student reads own; teacher reads their class results; admin reads all
create policy "results: student self read"
  on public.results for select using (student_id = auth.uid());
create policy "results: admin read"
  on public.results for select using (get_my_role() = 'admin');
create policy "results: teacher read"
  on public.results for select
  using (
    get_my_role() = 'teacher' and
    student_id in (
      select s.id from public.students s
      join public.teacher_classes tc on tc.class_id = s.class_id
      where tc.teacher_id = auth.uid()
    )
  );
create policy "results: parent read"
  on public.results for select
  using (
    get_my_role() = 'parent' and
    student_id in (
      select student_id from public.student_parents where parent_id = auth.uid()
    )
  );
create policy "results: admin write"
  on public.results for all using (get_my_role() = 'admin');
create policy "results: teacher write"
  on public.results for all using (get_my_role() = 'teacher');

-- events: all authenticated read; admin write
create policy "events: authenticated read"
  on public.events for select using (auth.role() = 'authenticated');
create policy "events: admin write"
  on public.events for all using (get_my_role() = 'admin');

-- announcements: all authenticated read; admin write
create policy "announcements: authenticated read"
  on public.announcements for select using (auth.role() = 'authenticated');
create policy "announcements: admin write"
  on public.announcements for all using (get_my_role() = 'admin');

-- ============================================================
-- STORAGE: avatars bucket (run separately in dashboard if preferred)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: auth upload"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "avatars: owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid());
