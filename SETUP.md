# Setup

You need three free accounts: **Supabase** (backend), **Firebase** (push only) and **Expo/EAS**
(cloud builds, so you don't need Android Studio). It takes about 20 minutes.

## 1. Supabase

1. Create a project at https://supabase.com.
2. Copy `.env.example` to `.env`. Fill in the values from **Project Settings → API**: the project URL, and the publishable key (or the legacy anon key).
3. **Authentication → Sign In / Providers → Email**: turn **off** "Confirm email". The free tier only sends a couple of emails an hour, so this is the easiest option. You can also leave it on and set up SMTP.
4. Apply the database migrations:
   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npx supabase db push
   ```
   You can also paste the files in `supabase/migrations/` into the SQL editor, in order.
5. **Authentication → Emails → Reset Password**: the app resets passwords with a code typed into the app (no links), so make the template show the code, e.g.:
   ```html
   <h2>Reset your Chalkmates password</h2>
   <p>Your code is <strong>{{ .Token }}</strong></p>
   ```
   Password reset needs working email. The free tier sends only a few emails per hour; set up custom SMTP for anything beyond testing.

## 2. Firebase (push notifications + instant widget updates)

1. Create a project at https://console.firebase.google.com. You can skip Analytics.
2. **Add app → Android**, with package name `app.chalkmates`. Download `google-services.json` into the project root. It's gitignored.
3. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file. Keep it secret.

## 3. Push edge function

```sh
# any random string, used so only your database can call the function
NOTIFY_SECRET=$(openssl rand -hex 24)

npx supabase secrets set NOTIFY_SECRET=$NOTIFY_SECRET
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat path/to/service-account.json)"
npx supabase functions deploy notify --no-verify-jwt
```

Then tell the database where the function is. Run this in the **SQL editor**:

```sql
select vault.create_secret('https://YOUR-PROJECT-REF.supabase.co', 'project_url');
select vault.create_secret('THE-SAME-NOTIFY_SECRET', 'notify_secret');
```

Until this step is done the app still works, but widgets only refresh every 30–60 minutes, nobody gets notifications, and files of deleted posts/spaces stay in storage (the same function removes them).

Redeploy `notify` whenever `supabase/functions/notify/` changes:
```sh
npx supabase functions deploy notify --no-verify-jwt
```

## 4. Build the app (EAS, in the cloud)

```sh
git init && git add -A && git commit -m "init"   # EAS uploads from git
npx eas-cli@latest login
npx eas-cli@latest init                           # links the project, adds projectId to app.json

# Secrets for cloud builds (.env and google-services.json are not uploaded)
npx eas-cli@latest env:create --environment development --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-PROJECT-REF.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment development --environment preview --name EXPO_PUBLIC_SUPABASE_KEY --value YOUR-KEY --visibility plaintext
npx eas-cli@latest env:create --environment development --environment preview --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret

npm run build:dev        # development build (APK). Takes ~15 min on the free tier.
```

Install the APK from the link EAS gives you, then run:

```sh
npx expo start --dev-client
```

and open the app on your phone. When you want a standalone APK to give to your partner (no dev server needed), run `npm run build:preview`.

## 5. Try it

1. Sign up on both phones. One person starts a space and shares the 6-letter code. The other taps **I have a code**.
2. Long-press the home screen, open **Widgets → Chalkmates**, and add **Chalkboard** (and any others). If you're in more than one space, you'll be asked which space the widget should follow.
3. Draw something and hit **Send**. It shows up on the other phone's widget within a few seconds.

## Before publishing to Google Play

- **Privacy policy**: Play needs a public URL. Host `PRIVACY.md` (same text as the in-app screen in `src/lib/privacy.ts`; fill in the contact email in both) e.g. on GitHub Pages.
- **Account deletion**: in-app under **Me → Delete account**. Play also asks for a web page explaining how to request deletion; a short section on the same page as the privacy policy is enough.
- **Icons** are generated (chalk heart on a chalkboard): `assets/images/*` and the white notification icon in `assets/notification-icon/` (installed by `plugins/withNotificationIcon.js`). Native changes need a new build (`npm run build:dev`).

## Troubleshooting

- **Widget doesn't update instantly:** check that the `notify` function logs show sends (Supabase → Edge Functions → notify → Logs), and that the two Vault secrets exist. Some phones (Xiaomi, Huawei, Samsung "deep sleep") block background work for apps. Set Chalkmates to "Unrestricted" battery usage.
- **"Missing EXPO_PUBLIC_SUPABASE_URL":** `.env` is missing for local dev, or the EAS env vars aren't set for the build profile you used.
- **Sign-up says to check your email:** turn off "Confirm email" (step 1.3).
