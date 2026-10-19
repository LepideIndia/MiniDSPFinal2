-- Read-only checks for db/002_rls_and_save_scan.sql. Run AFTER the migration.
-- Expected: 10 rows, every row has ok = true. Paste any row with ok = false back to the developer.
SELECT 'scans: only a SELECT policy, for authenticated' AS check_name,
       (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT' AND roles::text[] = ARRAY['authenticated'])
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'scans') AS ok,
       (SELECT string_agg(policyname || ':' || cmd, ', ') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'scans') AS detail
UNION ALL
SELECT 'findings: only a SELECT policy, for authenticated',
       (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT' AND roles::text[] = ARRAY['authenticated'])
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'findings'),
       (SELECT string_agg(policyname || ':' || cmd, ', ') FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'findings')
UNION ALL
SELECT 'RLS enabled on both tables',
       (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.scans'::regclass)
       AND (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.findings'::regclass),
       NULL
UNION ALL
SELECT 'anon has no privileges on scans/findings',
       NOT (has_table_privilege('anon', 'public.scans', 'SELECT,INSERT,UPDATE,DELETE')
            OR has_table_privilege('anon', 'public.findings', 'SELECT,INSERT,UPDATE,DELETE')),
       NULL
UNION ALL
SELECT 'authenticated can SELECT scans/findings',
       has_table_privilege('authenticated', 'public.scans', 'SELECT')
       AND has_table_privilege('authenticated', 'public.findings', 'SELECT'),
       NULL
UNION ALL
SELECT 'authenticated cannot INSERT/UPDATE/DELETE scans/findings',
       NOT (has_table_privilege('authenticated', 'public.scans', 'INSERT,UPDATE,DELETE')
            OR has_table_privilege('authenticated', 'public.findings', 'INSERT,UPDATE,DELETE')),
       NULL
UNION ALL
SELECT 'save_scan: EXECUTE for authenticated only',
       has_function_privilege('authenticated', 'public.save_scan(text,jsonb)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.save_scan(text,jsonb)', 'EXECUTE')
       AND NOT has_function_privilege('service_role', 'public.save_scan(text,jsonb)', 'EXECUTE'),
       NULL
UNION ALL
SELECT 'save_scan: SECURITY DEFINER with search_path pinned',
       (SELECT prosecdef AND proconfig::text LIKE '%search_path=%' FROM pg_proc
        WHERE oid = 'public.save_scan(text,jsonb)'::regprocedure),
       (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.save_scan(text,jsonb)'::regprocedure)
UNION ALL
SELECT 'check_scan_ownership: search_path pinned',
       (SELECT proconfig::text LIKE '%search_path=%' FROM pg_proc
        WHERE oid = 'public.check_scan_ownership()'::regprocedure),
       (SELECT proconfig::text FROM pg_proc WHERE oid = 'public.check_scan_ownership()'::regprocedure)
UNION ALL
SELECT 'ownership trigger still attached to findings',
       EXISTS (SELECT 1 FROM pg_trigger
               WHERE tgrelid = 'public.findings'::regclass AND tgname = 'trigger_check_scan_ownership' AND NOT tgisinternal),
       NULL;
