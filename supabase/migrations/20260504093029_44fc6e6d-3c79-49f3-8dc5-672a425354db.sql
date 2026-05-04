-- Enable RLS on realtime.messages (idempotent)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop prior version if rerun
DROP POLICY IF EXISTS "cost_sheets_realtime_user_scoped" ON realtime.messages;

-- Only allow authenticated users to subscribe to a topic that starts with
-- "cost_sheets:<their uid>". Frontend must use channel name like
-- `cost_sheets:${user.id}` to receive updates.
CREATE POLICY "cost_sheets_realtime_user_scoped"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'cost_sheets:' || (auth.uid())::text || '%')
  OR (realtime.topic() NOT LIKE 'cost_sheets:%')
);