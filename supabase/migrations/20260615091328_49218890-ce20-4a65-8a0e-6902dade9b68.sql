-- Deduplicate existing reads, keeping the earliest seen per (notification_id, user_id),
-- and enforce single read row per user per notification.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY notification_id, user_id ORDER BY seen_at ASC, id ASC) AS rn
  FROM public.app_notification_reads
)
DELETE FROM public.app_notification_reads r USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

ALTER TABLE public.app_notification_reads
  ADD CONSTRAINT app_notification_reads_notif_user_uniq UNIQUE (notification_id, user_id);