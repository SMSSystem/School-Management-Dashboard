import { z } from 'zod';

// The one place the app imports zod from. Zod 4 compiles each object schema into a faster parser with
// `new Function(...)`, after checking that the browser allows it with `new Function("")`. Under a
// Content-Security-Policy without 'unsafe-eval' that check is a violation (the report-only policy in vercel.json
// reports it, an enforced one throws and zod falls back), on every page that builds a schema. These schemas parse a
// handful of form fields, so the compiled parser buys nothing; `jitless` skips the probe. Set here, before any
// schema is built, because every importing module reaches zod through this one (src/lib/__tests__/zodImport.test.ts).
z.config({ jitless: true });

export { z };
