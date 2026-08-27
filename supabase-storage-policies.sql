
-- Create a public bucket named restaurant-photos in Storage first.
-- Then allow public uploads and reads.

create policy "public can view restaurant photos"
on storage.objects
for select
to anon
using (bucket_id = 'restaurant-photos');

create policy "public can upload restaurant photos"
on storage.objects
for insert
to anon
with check (bucket_id = 'restaurant-photos');
