-- MiniDSP Secure Database Schema
-- Run this in the Supabase SQL Editor

-- 1. Tables
CREATE TABLE IF NOT EXISTS public.scans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 255),
    scanned_at timestamptz NOT NULL DEFAULT now(),
    risk text NOT NULL CHECK (risk IN ('None', 'Low', 'Medium', 'High', 'Critical')),
    finding_count integer NOT NULL CHECK (finding_count >= 0)
);

CREATE TABLE IF NOT EXISTS public.findings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    type text NOT NULL CHECK (type IN ('Email', 'UK Phone', 'UK NINO', 'Payment Card')),
    risk text NOT NULL CHECK (risk IN ('Low', 'Medium', 'High', 'Critical')),
    match_count integer NOT NULL CHECK (match_count > 0),
    masked_example text NOT NULL,
    UNIQUE (scan_id, type)
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS scans_owner_date ON public.scans(user_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS findings_owner_scan ON public.findings(user_id, scan_id);

-- 3. Security: Row Level Security (RLS)
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;

-- Scans Policies
CREATE POLICY "Users can manage their own scans"
ON public.scans FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Findings Policies
CREATE POLICY "Users can manage their own findings"
ON public.findings FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Integrity: Prevent mismatched ownership (F-08)
CREATE OR REPLACE FUNCTION check_scan_ownership()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.scans
        WHERE id = NEW.scan_id AND user_id = NEW.user_id
    ) THEN
        RAISE EXCEPTION 'Security Violation: User does not own the associated scan';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_check_scan_ownership ON public.findings;
CREATE TRIGGER trigger_check_scan_ownership
BEFORE INSERT OR UPDATE ON public.findings
FOR EACH ROW EXECUTE FUNCTION check_scan_ownership();
