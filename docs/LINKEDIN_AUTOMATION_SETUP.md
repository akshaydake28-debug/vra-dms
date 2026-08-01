# LinkedIn Daily Post Automation — One-Time Setup

`.github/workflows/linkedin-daily-post.yml` posts one AI-written, AI-illustrated
update to LinkedIn every day. Everything used is free (no paid plan, no
credit card). You need to do the following once.

## 1. Get a free Gemini API key (writes the caption)

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account and click "Create API key".
3. Copy the key for step 4.

## 2. Create a LinkedIn Developer App

1. Go to https://www.linkedin.com/developers/apps → "Create app".
2. Fill in the app name and associate it with a LinkedIn Company Page
   (LinkedIn requires this — create a free page for yourself if you don't
   have one).
3. On the app's "Products" tab, request:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
   Both are free; they're usually approved instantly.
4. On the "Auth" tab, note the **Client ID** and **Client Secret**, and add
   this **Authorized redirect URL**: `http://localhost:8080/callback`
   (it doesn't need to be a real, running server).

## 3. Get an access token

LinkedIn access tokens last ~60 days, so this step repeats every couple of
months (takes about 2 minutes each time).

1. Open this URL in your browser, replacing `CLIENT_ID`:
   ```
   https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=CLIENT_ID&redirect_uri=http://localhost:8080/callback&scope=openid%20profile%20w_member_social
   ```
2. Log in and click "Allow". The browser will land on a "site can't be
   reached" page — that's expected. Copy the `code=...` value from the
   address bar.
3. Exchange the code for a token (run locally, replace the placeholders):
   ```bash
   curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
     -d grant_type=authorization_code \
     -d code=PASTE_CODE_HERE \
     -d redirect_uri=http://localhost:8080/callback \
     -d client_id=CLIENT_ID \
     -d client_secret=CLIENT_SECRET
   ```
4. The response's `access_token` field is what you need in step 4.

## 4. Add GitHub repository secrets

In this repo: **Settings → Secrets and variables → Actions → New repository
secret**.

- `LINKEDIN_ACCESS_TOKEN` — from step 3
- `GEMINI_API_KEY` — from step 1

## 5. Write your content list

Edit `content/topics.txt` — one topic/idea per line, in your own voice or
niche. The workflow rotates through the list by day-of-year.

## 6. Test it

Repo → **Actions** tab → **Daily LinkedIn Post** → **Run workflow**, to
trigger it manually and confirm a post goes out before waiting for the
9am IST schedule.

## Ongoing maintenance

- Every ~60 days the access token expires and the workflow fails; it opens
  a GitHub issue reminding you to redo step 3 and update the secret.
- Gemini's free tier limit is far above one request/day.
- Pollinations.ai (the image generator) needs no key and has no
  meaningful rate limit at this volume.
