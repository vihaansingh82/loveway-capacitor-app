/* ============================================================
   Loveway — configuration
   ------------------------------------------------------------
   Ye file har page me load hoti hai. Sirf yahan values badalni
   hain, kisi HTML page ko chhune ki zarurat nahi.

   SUPABASE_URL      : Supabase dashboard > Settings > API Keys (ya Connect)
   SUPABASE_ANON_KEY : usi page se browser wali key —
                       naye project me  "Publishable key"  (sb_publishable_...)
                       purane project me "anon / public"   (eyJ...)
                       Dono chalti hain. Ye key public hai, browser me
                       rakhna safe hai — kyunki har table par RLS laga hai.
                       "Secret key" / "service_role" kabhi yahan na daalein.
   OTP_CHANNEL       : 'email' = free, turant kaam karta hai
                       'sms'   = pehle Supabase me SMS provider
                                 (Twilio / MSG91) configure karein
   ============================================================ */

window.LOVEWAY_CONFIG = {
  SUPABASE_URL: 'https://mhqygmdwwvyrplvrcytf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ocXlnbWR3d3Z5cnBsdnJjeXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzYzNjEsImV4cCI6MjEwMjgxMjM2MX0.CFDU5oFYcmnldR2qVX3YWM7JryUHA1dy5KEzooYf9QU',

  OTP_CHANNEL: 'email',

  SUPPORT_EMAIL: 'hello@loveway.in',
  BRAND: 'Loveway'
};
