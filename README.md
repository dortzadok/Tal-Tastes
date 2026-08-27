# Tal's Table V4

This version adds:
- live-ready static site
- Supabase database support
- Supabase Storage support for required restaurant photo uploads
- mandatory image before review submission
- tags like date night, lunch break, girls night, family dinner, quick grab
- dashboard cards with totals, averages, top area, top tag, and best sushi
- pink and black styling inspired by bright football pink aesthetics

## Setup

1. Create a Supabase project
2. Create a public Storage bucket named `restaurant-photos`
3. Run `supabase-schema.sql` in the SQL editor
4. Run `supabase-storage-policies.sql` in the SQL editor
5. Copy your Supabase project URL and anon key into `config.js`
6. Host these files on GitHub Pages or any static host

## Notes

- If `config.js` is left empty, the app falls back to local storage
- For production, a stricter authentication model is recommended
