-- Private storage for property photos. Files live under "<owner_id>/..." and are only reachable by that owner (signed URLs).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('property-media', 'property-media', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "owner reads own property media" on storage.objects for select
  using (bucket_id = 'property-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner uploads own property media" on storage.objects for insert
  with check (bucket_id = 'property-media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
create policy "owner updates own property media" on storage.objects for update
  using (bucket_id = 'property-media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
create policy "owner deletes own property media" on storage.objects for delete
  using (bucket_id = 'property-media' and (storage.foldername(name))[1] = auth.uid()::text and public.is_owner());
