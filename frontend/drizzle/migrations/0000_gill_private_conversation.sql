CREATE TABLE public.gill_conversations (user_id uuid PRIMARY KEY, messages jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gill_conversations TO authenticated;
GRANT ALL ON public.gill_conversations TO service_role;
ALTER TABLE public.gill_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own Gill conversation" ON public.gill_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);