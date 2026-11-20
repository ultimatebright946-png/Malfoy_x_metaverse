# Continue with Google

Adds a "Continue with Google" button to the website sign-in page, and "Link my Google account" in Settings.
Google only **signs in to a profile that already exists** (created with your WhatsApp number or Discord) and that you linked in Settings. It never makes a second profile.

## Set up (10 minutes, free)
1. Open https://console.cloud.google.com > create or pick a project.
2. **APIs & Services > OAuth consent screen**: choose External, give the app a name, your email, save. (Keep it in "Testing" and add your own email as a test user, or Publish it so anyone can sign in.)
3. **APIs & Services > Credentials > Create credentials > OAuth client ID** > type **Web application**.
4. Under **Authorized redirect URIs** add exactly:
   `https://YOUR-SITE/auth/google/callback`
   (YOUR-SITE is the same address as `PUBLIC_URL`, for example `https://game.example.com`. It must be https, except `http://localhost:3000` for testing on your own computer.)
5. Copy the Client ID and Client secret into your environment:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxxxxx
   PUBLIC_URL=https://YOUR-SITE
   ```
6. In your hosting dashboard (for example Render > your service > Environment), add the same three values:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `PUBLIC_URL` (the exact public HTTPS address of this website)
   Optionally set `GOOGLE_REDIRECT_URI` to the exact callback URL shown below. If omitted, the site builds it from `PUBLIC_URL`.
7. Restart/redeploy. The sign-in page will show the Google option when both credentials are present. If it says “Google sign-in not configured”, one or both credentials are missing from the running service environment.

## Your Google link
There is no ready-made link until your site has an address. Once it is online, the sign-in link is
`https://YOUR-SITE/auth/google`
and the redirect address you register in Google is
`https://YOUR-SITE/auth/google/callback`

## How a player uses it
1. Sign in the normal way once (WhatsApp number + password).
2. Settings > **Link my Google account**.
3. From then on: Sign in page > **Continue with Google**.
4. Settings > **Unlink Google** removes it.

Only verified Google emails are accepted. One Google account can be linked to one profile. Your client secret is a password: keep it out of anything you share.
