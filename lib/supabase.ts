import {createClient,type SupabaseClient} from '@supabase/supabase-js';
let client:SupabaseClient|undefined;
export function browserSupabase(){
 if(!client){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw Error('Falta configurar Supabase. Contactá a Encuentro.');client=createClient(url,key,{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}})}
 return client;
}
