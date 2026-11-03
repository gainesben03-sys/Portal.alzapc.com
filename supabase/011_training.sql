-- Training tab: a company's executives can see who has practiced (not what they said).
-- Run after 010_manager_tools.sql. Safe to run more than once.
-- Ask HR use stays private: execs never see who asked HR what, or how often.

drop policy if exists ai_usage_exec on public.ai_usage;
create policy ai_usage_exec on public.ai_usage for select using (
  public.is_exec(client_id) and kind in ('quiz', 'sort', 'roleplay', 'feedback')
);
