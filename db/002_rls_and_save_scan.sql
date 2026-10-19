-- MiniDSP migration 002: owner-scoped read-only RLS + atomic save_scan()
-- Run in the Supabase SQL Editor AFTER setup_database.sql. Safe to re-run (idempotent).
-- No service-role key is used anywhere: the app writes only through save_scan() with the user's own session.

-- 1. Row Level Security stays on for both tables.
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- 2. Replace the FOR ALL policies with owner-scoped SELECT for signed-in users only.
DROP POLICY IF EXISTS "Users can manage their own scans" ON public.scans;
DROP POLICY IF EXISTS "Users can manage their own findings" ON public.findings;
DROP POLICY IF EXISTS "scans_select_own" ON public.scans;
DROP POLICY IF EXISTS "findings_select_own" ON public.findings;

CREATE POLICY "scans_select_own"
ON public.scans FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "findings_select_own"
ON public.findings FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- 3. Table privileges: anon gets nothing; signed-in users can only read (writes go through save_scan()).
REVOKE ALL ON TABLE public.scans, public.findings FROM PUBLIC;
REVOKE ALL ON TABLE public.scans, public.findings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.scans, public.findings FROM authenticated;
GRANT SELECT ON TABLE public.scans, public.findings TO authenticated;

-- 4. Pin the search_path of the existing ownership trigger function and stop it being callable directly.
ALTER FUNCTION public.check_scan_ownership() SET search_path = '';
REVOKE ALL ON FUNCTION public.check_scan_ownership() FROM PUBLIC, anon, authenticated;

-- 5. Atomic save. One function call = one transaction: any error rolls back the scan and all findings.
--    p_findings: JSON array of {type, risk, match_count, masked_example}. Raw values are never accepted:
--    masked_example must look like a mask for its type. Error text never echoes the input.
CREATE OR REPLACE FUNCTION public.save_scan(p_filename text, p_findings jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_item       jsonb;
  v_type       text;
  v_risk       text;
  v_expected   text;
  v_masked     text;
  v_count      integer;
  v_rank       integer;
  v_max_rank   integer := 0;
  v_total      integer := 0;
  v_seen       text[] := ARRAY[]::text[];
  v_scan_risk  text;
  v_scan_id    uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_filename IS NULL
     OR char_length(p_filename) NOT BETWEEN 1 AND 255
     OR p_filename ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid filename' USING ERRCODE = '22023';
  END IF;

  IF p_findings IS NULL
     OR jsonb_typeof(p_findings) <> 'array'
     OR jsonb_array_length(p_findings) > 4 THEN
    RAISE EXCEPTION 'invalid findings' USING ERRCODE = '22023';
  END IF;

  -- Pass 1: validate everything and derive risk/count before writing anything.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_findings) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(v_item) AS k
         WHERE k NOT IN ('type', 'risk', 'match_count', 'masked_example')
       )
       OR jsonb_typeof(v_item -> 'type') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item -> 'risk') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_item -> 'match_count') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_item -> 'masked_example') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'invalid finding' USING ERRCODE = '22023';
    END IF;

    v_type   := v_item ->> 'type';
    v_risk   := v_item ->> 'risk';
    v_masked := v_item ->> 'masked_example';

    v_expected := CASE v_type
      WHEN 'Email'        THEN 'Low'
      WHEN 'UK Phone'     THEN 'Medium'
      WHEN 'UK NINO'      THEN 'High'
      WHEN 'Payment Card' THEN 'Critical'
    END;
    IF v_expected IS NULL OR v_risk IS DISTINCT FROM v_expected OR v_type = ANY (v_seen) THEN
      RAISE EXCEPTION 'invalid finding' USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_type;

    IF (v_item ->> 'match_count') !~ '^[1-9][0-9]{0,6}$' THEN
      RAISE EXCEPTION 'invalid finding' USING ERRCODE = '22023';
    END IF;
    v_count := (v_item ->> 'match_count')::integer;
    IF v_count > 1048576 THEN
      RAISE EXCEPTION 'invalid finding' USING ERRCODE = '22023';
    END IF;

    -- Defence in depth: the masked example must really be masked for its type.
    IF char_length(v_masked) NOT BETWEEN 1 AND 300
       OR (v_type = 'Email'
           AND v_masked !~ '^([^@*[:space:]]\*\*\*|\*\*\*)@[^@[:space:]]+$')
       OR (v_type = 'UK Phone'
           AND (v_masked !~ '^[0-9 *()+-]+$'
                OR char_length(regexp_replace(v_masked, '[^0-9]', '', 'g')) > 3))
       OR (v_type = 'UK NINO'
           AND v_masked !~ '^[A-Z]{2}[ *]+$')
       OR (v_type = 'Payment Card'
           AND (v_masked !~ '^[0-9 *-]+$'
                OR char_length(regexp_replace(v_masked, '[^0-9]', '', 'g')) > 4)) THEN
      RAISE EXCEPTION 'invalid finding' USING ERRCODE = '22023';
    END IF;

    v_rank := CASE v_risk WHEN 'Low' THEN 1 WHEN 'Medium' THEN 2 WHEN 'High' THEN 3 WHEN 'Critical' THEN 4 END;
    IF v_rank > v_max_rank THEN
      v_max_rank := v_rank;
    END IF;
    v_total := v_total + v_count;
  END LOOP;

  v_scan_risk := CASE v_max_rank
    WHEN 1 THEN 'Low' WHEN 2 THEN 'Medium' WHEN 3 THEN 'High' WHEN 4 THEN 'Critical' ELSE 'None'
  END;

  -- Pass 2: write. Any failure here aborts the whole function call, so there is no partial scan.
  INSERT INTO public.scans (user_id, filename, risk, finding_count)
  VALUES (v_user, p_filename, v_scan_risk, v_total)
  RETURNING id INTO v_scan_id;

  INSERT INTO public.findings (scan_id, user_id, type, risk, match_count, masked_example)
  SELECT v_scan_id, v_user, f ->> 'type', f ->> 'risk', (f ->> 'match_count')::integer, f ->> 'masked_example'
  FROM jsonb_array_elements(p_findings) AS f;

  RETURN v_scan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_scan(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_scan(text, jsonb) TO authenticated;
