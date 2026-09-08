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
   OTP_CHANNEL       : 'email' = Supabase ka apna email OTP
                       'sms'   = phone OTP. Loveway par iska matlab hai:
                                 wahi ek code WhatsApp AUR email dono par
                                 jaata hai (supabase/functions/send-sms-hook)
                                 Ise 'sms' karne se PEHLE Supabase Dashboard
                                 mein 3 cheezein honi chahiye, warna naye
                                 signup ka OTP kisi ko milega hi nahi:
                                   1. Edge Functions > send-sms-hook > Secrets:
                                      WA_API_URL, WA_API_KEY, SEND_HOOK_SECRET
                                   2. Authentication > Providers > Phone: ON
                                   3. Authentication > Hooks > Send SMS hook:
                                      HTTPS + function ka URL + Enable
   ============================================================ */

window.LOVEWAY_CONFIG = {
  SUPABASE_URL: 'https://mhqygmdwwvyrplvrcytf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ocXlnbWR3d3Z5cnBsdnJjeXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMzYzNjEsImV4cCI6MjEwMjgxMjM2MX0.CFDU5oFYcmnldR2qVX3YWM7JryUHA1dy5KEzooYf9QU',

  OTP_CHANNEL: 'email',

  SUPPORT_EMAIL: 'help@loveway.in',
  BRAND: 'Loveway'
};

/* ------------------------------------------------------------
   Spotify — ab Supabase ke "Spotify se login" par depend nahi hai.
   Har user (chahe usne email/password se ya Google se Loveway
   join kiya ho) apna KHUD ka Spotify account connect kar sakta
   hai — Authorization Code + PKCE flow se, seedha browser se.

   SPOTIFY_CLIENT_ID : developer.spotify.com/dashboard > apni app
                       > Settings > "Client ID".

   ⚠️  Client SECRET yahan (ya kisi bhi browser-side file mein) KABHI
       mat daalein. Ye file har visitor ke browser mein download hoti
       hai — jo bhi site kholega wo isse padh sakta hai. PKCE flow ko
       secret ki zarurat hi nahi hai; sirf Client ID chahiye, aur wo
       public hone ke liye hi banaya gaya hai.

   Usi app ki Settings > "Redirect URIs" mein bilkul ye teen honi chahiye:
       https://loveway.in/spotify-callback.html
       https://www.loveway.in/spotify-callback.html   (www alag se serve hota
           hai, non-www par redirect nahi karta — isliye dono chahiye)
       com.loveway.app://spotify-callback             (Android app ke liye)
   ------------------------------------------------------------ */
window.LOVEWAY_CONFIG.SPOTIFY_CLIENT_ID = '85aa985468a2496c97f7cab0f88f2d25';

/* Global (🌍 Sabhi) announcements ko publish hone se pehle jis admin
   ki approval chahiye. Isi email wale account ko admin.html ke
   "📢 Announcements" tab mein approve/reject ke buttons milte hain.
   (DB side par bhi yahi email supabase-schema.sql section 33b mein
   is_admin = true set karti hai.) */
window.LOVEWAY_CONFIG.ANNOUNCEMENT_ADMIN_EMAIL = 'vinayvyas836865@gmail.com';
