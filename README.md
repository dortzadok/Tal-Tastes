# Tal Tastes V5

Static PWA with a robust standalone local mode and optional Supabase cloud mode.

## Works immediately without Supabase
When config.js is empty, reviews and compressed photos are stored in IndexedDB. This avoids Safari localStorage quota failures and lets the app be used immediately.

## Cloud mode
1. Create a Supabase project.
2. Run `supabase-schema.sql`.
3. Create a PUBLIC Storage bucket named `restaurant-photos`.
4. Run `supabase-storage-policies.sql`.
5. Put the project URL and anon key into `config.js`.
6. Re-upload only `config.js` to GitHub and wait for Pages to redeploy.

## Deployment
Upload every file in this folder to the root of the GitHub Pages repository and publish `main` / `(root)`.

## V5.1 checks
- 15 scoring questions
- Required compressed restaurant photo
- Multi-select vibe tags
- IndexedDB persistence
- Dashboard, filters, leaderboard, detail view, delete and export
- PWA cache version bumped to avoid stale GitHub Pages files
