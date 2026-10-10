import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
export const getGillHistory=createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async({context})=>{const {data,error}=await context.supabase.from('gill_conversations').select('messages').eq('user_id',context.userId).maybeSingle();if(error)throw new Error('Unable to load Gill’s conversation.');return data?.messages??[]});
