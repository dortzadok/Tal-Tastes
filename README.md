# Tal Tastes V5.3

Mobile-first restaurant rating PWA for Tal. Works immediately in standalone local mode, with optional Supabase cloud mode later.

## V5.3 features
- Personal login gate: username `Tal`, PIN `1114`, with remember-on-device option
- 15 weighted critic questions and a precise score out of 10
- Visual 5-star meter alongside the numeric score
- Required restaurant photo with automatic compression
- Expanded place types, plus a custom "Other" type
- Multi-select vibe tags plus user-created custom tags
- Edit and delete saved reviews
- Leaderboard defaults to highest-rated first
- Search plus filters for area, cuisine, place type, vibe tag, price, score and date
- Sort by rating, newest, oldest, name and price
- Quick views for 9+ Club, newest, Date Night, Girls Night and Sushi
- Dashboard for total places, monthly visits, average, elite scores, top area, favorite vibe, best sushi, return rate, unique cuisines and 9.5+ meals
- IndexedDB persistence for reviews and compressed photos
- PWA caching for Add to Home Screen

## Important login note
The Tal / 1114 PIN is currently a convenience lock in client-side code. It is not strong security because this is a public static GitHub Pages app. This is acceptable while reviews are stored only on Tal's own device. Before enabling shared cloud data, replace the convenience PIN with real authenticated cloud access and restrictive database policies.

## Works immediately without Supabase
When `config.js` is empty, reviews and compressed photos are stored in IndexedDB on the device.

## Optional cloud mode
Before enabling cloud mode, set up real authentication and tighten Row Level Security. The included SQL is development-oriented and should not be treated as the final security model.

## Deployment
Upload every file in this folder to the root of the GitHub Pages repository and publish `main` / `(root)`.


## V5.4 dashboard polish
- Dashboard reduced to the 8 most useful metrics.
- Removed Elite Club and Main Character.
- Metrics grouped into At a glance and Tal's taste for a cleaner mobile layout.
