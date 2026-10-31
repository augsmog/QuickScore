-- Disposable rollback paired with chat_report_block; no live apply authorization.
begin;
drop function public.report_chat_message(text,text,text,uuid,text);
drop function public.list_moderated_messages(text,text,text);
drop function public.chat_moderation_contest(text,text);
drop table public.chat_reports;
commit;
