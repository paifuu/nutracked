# Nutracked

AI food & bloodwork tracker. React + Vite front end, with a tiny serverless
function that proxies Anthropic API calls so your API key never ships to the browser.

## What you need
- A free GitHub account
- A free Vercel account (vercel.com)
- An Anthropic API key from console.anthropic.com  (note: AI calls cost money per use)

## Deploy in ~10 minutes

1. **Put this folder on GitHub.**
   - Create a new empty repo on GitHub called `nutracked`.
   - Upload every file in this folder to it (drag-and-drop works in GitHub's web UI:
     "Add file" > "Upload files"). Include the `src/` and `api/` folders.

2. **Import it into Vercel.**
   - Go to vercel.com > Add New > Project > import your `nutracked` repo.
   - Framework preset should auto-detect **Vite**. Leave the defaults.

3. **Add your API key** (this is the important step).
   - In the import screen (or later under Settings > Environment Variables) add:
     - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
     - `CLAUDE_MODEL` = a current vision-capable model id (optional; defaults to
       `claude-sonnet-4-5`). If AI calls return a "model not found" error, check the
       current model names at docs.anthropic.com/en/docs/about-claude/models and set
       this variable to one your account can use.

4. **Deploy.** Vercel builds and gives you a live URL like `nutracked.vercel.app`.
   Open it on your phone and "Add to Home Screen" for an app-like feel.

## Test locally (optional)
- `npm install`
- `npm run dev` runs the UI at localhost:5173, but the **AI features won't work
  locally** because the `/api/claude` function only runs on Vercel.
- To test the AI locally too, install the Vercel CLI (`npm i -g vercel`), put your
  key in a `.env` file as `ANTHROPIC_API_KEY=...`, then run `vercel dev`.

## Notes
- Data (your food log, weights, profile) is saved in the browser's localStorage on
  the device you use. It is per-device and not synced across phones/computers.
  Adding real accounts + a database is the next step if you want cross-device sync.
- The bloodwork feature is educational only — it is not medical advice. Keep that
  framing if you ever share this publicly.

## Turn on accounts (save progress across devices)

Nutracked uses Supabase (free) for login and per-user data. Without the keys below,
the app shows a friendly "add your keys" screen. With them, users register, log in,
and their data lives in their account instead of one device.

1. **Create a Supabase project** at supabase.com (free). Open it, then go to
   Project Settings > API and copy:
   - Project URL  → use as `VITE_SUPABASE_URL`
   - anon public key → use as `VITE_SUPABASE_ANON_KEY`
   (The anon key is safe to expose in the browser; access is protected by the
   security rules you create in step 2.)

2. **Create the data table.** In Supabase, open the SQL Editor and run:

   ```sql
   create table if not exists user_data (
     user_id uuid references auth.users(id) on delete cascade,
     key text not null,
     value jsonb,
     updated_at timestamptz default now(),
     primary key (user_id, key)
   );
   alter table user_data enable row level security;
   create policy "own rows only" on user_data
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```

   Row-level security means each person can only ever read or write their own data.

3. **Add the keys to Vercel.** Project > Settings > Environment Variables:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
   Then redeploy (Deployments > ... > Redeploy). Vite bakes these in at build time,
   so a redeploy is required after adding them.

4. **(Optional) Instant sign-up for testing.** By default Supabase emails a
   confirmation link before a new account can log in. To skip that while testing,
   go to Authentication > Providers > Email and turn off "Confirm email".

That's it — visitors now get a login/register screen, and every profile, meal,
weight, and lab result is saved to their account and follows them to any device.
