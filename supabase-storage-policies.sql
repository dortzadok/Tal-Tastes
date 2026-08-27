-- First create a PUBLIC Storage bucket named: restaurant-photos
create policy "anon can view restaurant photos"
on storage.objects for select to anon
using (bucket_id = 'restaurant-photos');

create policy "anon can upload restaurant photos"
on storage.objects for insert to anon
with check (bucket_id = 'restaurant-photos');
