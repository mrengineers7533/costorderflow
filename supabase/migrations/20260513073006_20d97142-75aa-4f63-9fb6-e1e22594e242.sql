-- Create audit log table for BOQ Remarks edits
CREATE TABLE public.boq_remarks_audit_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    boq_id UUID NOT NULL,
    item_id TEXT NOT NULL,
    item_no TEXT,
    model_number TEXT,
    old_remarks TEXT,
    new_remarks TEXT NOT NULL,
    changed_by UUID,
    changed_by_email TEXT,
    changed_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.boq_remarks_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: allow BOQ owners and admins to read audit logs
CREATE POLICY "Audit log read by BOQ owner or admin"
ON public.boq_remarks_audit_log
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.boqs b
        WHERE b.id = boq_remarks_audit_log.boq_id
        AND (b.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
);

-- RLS: allow BOQ owners and admins to insert audit logs
CREATE POLICY "Audit log insert by BOQ owner or admin"
ON public.boq_remarks_audit_log
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.boqs b
        WHERE b.id = boq_remarks_audit_log.boq_id
        AND (b.user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
);

-- Index for fast lookups by BOQ
CREATE INDEX idx_boq_remarks_audit_boq_id ON public.boq_remarks_audit_log(boq_id);
CREATE INDEX idx_boq_remarks_audit_created ON public.boq_remarks_audit_log(created_at DESC);