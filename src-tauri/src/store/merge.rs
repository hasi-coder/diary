//! Merge duplicate pages without recreating products or their attachments.
use super::*;

fn page(p: &Profile) -> bool {
    matches!(p.kind, ProfileKind::Page | ProfileKind::Shop)
}

fn replace_id(id: &mut String, source: &str, target: &str) {
    if id == source {
        *id = target.into();
    }
}

fn replace_ids(ids: &mut Vec<String>, source: &str, target: &str) {
    let mut seen = HashSet::new();
    for id in ids.iter_mut() {
        replace_id(id, source, target);
    }
    ids.retain(|id| seen.insert(id.clone()));
}

fn replace_mentions(text: &mut String, source: &str, target: &str) {
    *text = text.replace(&format!("{MENTION_PREFIX}{source}]"), &format!("{MENTION_PREFIX}{target}]"));
}

fn replace_media(media: &mut MediaRef, source: &str, target: &str) {
    replace_mentions(&mut media.caption, source, target);
    for tag in &mut media.tags {
        replace_id(&mut tag.profile_id, source, target);
    }
}

fn replace_profile(profile: &mut Profile, source: &str, target: &str) {
    for relation in &mut profile.relations {
        replace_id(&mut relation.to_id, source, target);
    }
    let mut seen = HashSet::new();
    profile.relations.retain(|r| {
        r.to_id != profile.id
            && seen.insert((r.to_id.clone(), r.kind.clone(), r.label.clone(), r.inverse_label.clone(), r.since.clone()))
    });
    replace_mentions(&mut profile.bio, source, target);
    for media in profile.photos_mut() {
        replace_media(media, source, target);
    }
}

fn replace_post(post: &mut Post, source: &str, target: &str) {
    replace_id(&mut post.author_id, source, target);
    replace_mentions(&mut post.content, source, target);
    replace_ids(&mut post.with_ids, source, target);
    if let Some(id) = &mut post.place_id {
        replace_id(id, source, target);
    }
    for activity in &mut post.activities {
        replace_ids(&mut activity.with_ids, source, target);
    }
    for media in &mut post.media {
        replace_media(media, source, target);
    }
    for comment in &mut post.comments {
        replace_id(&mut comment.author_id, source, target);
        replace_mentions(&mut comment.content, source, target);
    }
    // Keep the destination's reaction if both pages reacted to the same post.
    let has_target = post.reactions.iter().any(|r| r.profile_id == target);
    post.reactions.retain(|r| !(has_target && r.profile_id == source));
    for reaction in &mut post.reactions {
        replace_id(&mut reaction.profile_id, source, target);
    }
    if let Some(poll) = &mut post.poll {
        let has_target = poll.votes.iter().any(|v| v.profile_id == target);
        poll.votes.retain(|v| !(!poll.multiple && has_target && v.profile_id == source));
        let mut seen = HashSet::new();
        for vote in &mut poll.votes {
            replace_id(&mut vote.profile_id, source, target);
        }
        poll.votes.retain(|v| seen.insert((v.profile_id.clone(), v.option_id.clone())));
        for media in poll.options.iter_mut().filter_map(|o| o.image.as_mut()) {
            replace_media(media, source, target);
        }
    }
    if let Some(id) = &mut post.trashed_with {
        replace_id(id, source, target);
    }
}

impl Workspace {
    /// Keeps the destination's details, fills blanks from the source, and moves
    /// products/references in place. The source alone goes to Trash LAST: every
    /// earlier write is individually atomic, and an interrupted merge can be
    /// retried without losing records, media or their original ids.
    pub fn merge_pages(&mut self, source_id: &str, target_id: &str) -> Result<PageMerge> {
        let result = self.merge_pages_inner(source_id, target_id);
        // A disk error can leave a resumable partial merge. Keep the cache's
        // search/media indexes consistent with every write that did succeed.
        self.reindex_media();
        self.rebuild_index();
        result
    }

    fn merge_pages_inner(&mut self, source_id: &str, target_id: &str) -> Result<PageMerge> {
        validate_record_id(source_id)?;
        validate_record_id(target_id)?;
        if source_id == target_id {
            return Err(Error::Invalid("Choose two different pages or shops.".into()));
        }
        let mut target = self.profiles.get(target_id).filter(|p| page(p)).cloned()
            .ok_or_else(|| Error::NotFound(format!("page {target_id}")))?;
        let source = match self.profiles.get(source_id) {
            Some(p) if page(p) => p.clone(),
            None if target.merged_page_ids.iter().any(|id| id == source_id) => {
                return Ok(PageMerge { page: target, source_id: source_id.into(), moved_products: 0 });
            }
            _ => return Err(Error::NotFound(format!("page {source_id}"))),
        };
        if !target.can_sell() && (source.can_sell()
            || self.items.values().chain(self.trash.items.values()).any(|i| i.shop_id == source_id)) {
            return Err(Error::Invalid("Choose a shop or a page with a Shop tab as the destination.".into()));
        }
        let moved_products = self.items.values().filter(|i| i.shop_id == source_id).count();
        for (dest, from) in [
            (&mut target.tagline, &source.tagline),
            (&mut target.bio, &source.bio),
            (&mut target.category, &source.category),
            (&mut target.location, &source.location),
            (&mut target.anniversary, &source.anniversary),
            (&mut target.source_url, &source.source_url),
        ] {
            if dest.trim().is_empty() {
                *dest = from.clone();
            }
        }
        for url in std::iter::once(&source.source_url).chain(&source.source_urls) {
            if !url.is_empty() && url != &target.source_url && !target.source_urls.contains(url) {
                target.source_urls.push(url.clone());
            }
        }
        for id in std::iter::once(&source.id).chain(&source.merged_page_ids) {
            if id != target_id && !target.merged_page_ids.contains(id) {
                target.merged_page_ids.push(id.clone());
            }
        }
        target.relations.extend(source.relations.clone());
        replace_profile(&mut target, source_id, target_id);
        self.put_profile(target)?;

        // Profile photos own their blobs. Copy a missing photo, so emptying
        // Trash later cannot remove a photo now used by the destination.
        for (slot, source_photo) in [(PhotoSlot::Avatar, &source.avatar), (PhotoSlot::Cover, &source.cover)] {
            let empty = self.profiles[target_id].photo(slot).is_none();
            if let Some(photo) = source_photo.as_ref().filter(|_| empty) {
                let copy = self.stage_media_copy(&photo.id)?;
                let result = self.set_profile_photo(target_id, slot, Some(copy.id.clone()));
                self.discard_media(&[copy.id]);
                result?;
                if slot == PhotoSlot::Cover {
                    self.set_cover_position(target_id, source.cover_position)?;
                }
            }
        }

        // A floor plan fills in when the kept page has none.
        if self.profiles[target_id].layout.is_none() {
            if let Some(layout) = source.layout.clone() {
                self.set_profile_layout(target_id, Some(layout))?;
            }
        }

        // Update live and deleted references, so restoring a record later
        // still uses the combined shop. No record contents leave this method.
        let profiles: Vec<(bool, Profile)> = self.profiles.values().map(|p| (true, p.clone()))
            .chain(self.trash.profiles.values().map(|p| (false, p.clone())))
            .filter(|(_, p)| p.id != source_id).collect();
        for (live, mut profile) in profiles {
            let before = serde_json::to_value(&profile)?;
            replace_profile(&mut profile, source_id, target_id);
            if serde_json::to_value(&profile)? != before {
                profile.updated_at = now_millis();
                self.write_record(Kind::Profile, &profile.id, &profile, json!({}))?;
                if live { self.profiles.insert(profile.id.clone(), profile); }
                else { self.trash.profiles.insert(profile.id.clone(), profile); }
            }
        }
        let items: Vec<(bool, Item)> = self.items.values().map(|i| (true, i.clone()))
            .chain(self.trash.items.values().map(|i| (false, i.clone()))).collect();
        for (live, mut item) in items {
            let before = serde_json::to_value(&item)?;
            replace_id(&mut item.shop_id, source_id, target_id);
            replace_mentions(&mut item.description, source_id, target_id);
            if let Some(id) = &mut item.trashed_with { replace_id(id, source_id, target_id); }
            for media in &mut item.media { replace_media(media, source_id, target_id); }
            if serde_json::to_value(&item)? != before {
                item.updated_at = now_millis();
                self.write_record(Kind::Item, &item.id, &item, json!({}))?;
                if live { self.items.insert(item.id.clone(), item); }
                else { self.trash.items.insert(item.id.clone(), item); }
            }
        }
        let posts: Vec<(bool, Post)> = self.posts.values().map(|p| (true, p.clone()))
            .chain(self.trash.posts.values().map(|p| (false, p.clone()))).collect();
        for (live, mut post) in posts {
            let before = serde_json::to_value(&post)?;
            replace_post(&mut post, source_id, target_id);
            if serde_json::to_value(&post)? != before {
                post.updated_at = now_millis();
                self.write_post(&post)?;
                if live { self.posts.insert(post.id.clone(), post); }
                else { self.trash.posts.insert(post.id.clone(), post); }
            }
        }

        // Do not use delete_profile: its cascade would trash authored posts.
        let archived = Profile { trashed_at: Some(now_millis()), updated_at: now_millis(), ..source };
        self.write_record(Kind::Profile, source_id, &archived, json!({}))?;
        self.profiles.remove(source_id);
        self.trash.profiles.insert(source_id.into(), archived);
        Ok(PageMerge { page: self.profiles[target_id].clone(), source_id: source_id.into(), moved_products })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n0000000000000000";

    fn profile(ws: &mut Workspace, name: &str, kind: &str) -> Profile {
        ws.save_profile(serde_json::from_value(json!({"name": name, "kind": kind})).unwrap()).unwrap()
    }

    #[test]
    fn merge_pages_preserves_products_photos_references_and_source_urls_after_reopen() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Test", "Alex", "password", FAST).unwrap();
        let source = profile(&mut ws, "Duplicate", "shop");
        let target = profile(&mut ws, "Keep", "shop");
        let mut input: ProfileInput = serde_json::from_value(json!({"id": source.id, "name": source.name, "kind": "shop", "sourceUrl": "https://india.example/", "location": "Colombo", "bio": "Source details"})).unwrap();
        ws.save_profile(input.clone()).unwrap();
        input.id = Some(target.id.clone());
        input.name = target.name.clone();
        input.source_url = "https://lk.example/".into();
        input.location.clear();
        input.bio = "Destination details".into();
        ws.save_profile(input).unwrap();
        let avatar = ws.stage_media("avatar.png", PNG.to_vec()).unwrap();
        ws.set_profile_photo(&source.id, PhotoSlot::Avatar, Some(avatar.id.clone())).unwrap();
        let photo = ws.stage_media("product.png", PNG.to_vec()).unwrap();
        let item = ws.save_item(serde_json::from_value(json!({"shopId": source.id, "name": "Bra", "priceCents": 153900, "currency": "INR", "status": "available", "mediaIds": [photo.id], "sourceUrl": "https://india.example/bra"})).unwrap()).unwrap();
        let deleted = ws.save_item(serde_json::from_value(json!({"shopId": source.id, "name": "Deleted", "currency": "LKR", "status": "sold"})).unwrap()).unwrap();
        ws.delete_item(&deleted.id).unwrap();
        let mut post = ws.save_post(PostInput {
            author_id: source.id.clone(), content: format!("Visit @[profile:{}]", source.id),
            with_ids: vec![source.id.clone(), target.id.clone()], place_id: Some(source.id.clone()),
            activities: vec![Activity { verb: "shopping at".into(), object: "a boutique".into(), with_ids: vec![source.id.clone()], ..Default::default() }],
            ..Default::default()
        }).unwrap();
        // Include product/profile photo tags, comments, reactions and poll votes.
        post.media = vec![MediaRef { tags: vec![PhotoTag { profile_id: source.id.clone(), x: 0.1, y: 0.2, ..Default::default() }, PhotoTag { item_id: item.id.clone(), x: 0.3, y: 0.4, ..Default::default() }], ..item.media[0].clone() }];
        post.comments = vec![Comment { id: "comment".into(), author_id: source.id.clone(), content: format!("@[profile:{}]", source.id), created_at: 1, updated_at: 1 }];
        post.reactions = vec![Reaction { profile_id: source.id.clone(), kind: "like".into(), created_at: 1 }, Reaction { profile_id: target.id.clone(), kind: "love".into(), created_at: 2 }];
        post.poll = Some(Poll { options: vec![], multiple: false, votes: vec![PollVote { profile_id: source.id.clone(), option_id: "a".into(), created_at: 1 }, PollVote { profile_id: target.id.clone(), option_id: "b".into(), created_at: 2 }] });
        ws.write_post(&post).unwrap();
        ws.posts.insert(post.id.clone(), post.clone());
        let deleted_post = ws.save_post(PostInput { author_id: source.id.clone(), content: "Earlier entry".into(), ..Default::default() }).unwrap();
        ws.delete_post(&deleted_post.id).unwrap();
        let related = profile(&mut ws, "Another page", "page");
        ws.save_relation(&related.id, serde_json::from_value(json!({"toId": source.id, "kind": "custom", "label": "Partner", "inverseLabel": "Partner"})).unwrap()).unwrap();

        let merged = ws.merge_pages(&source.id, &target.id).unwrap();
        assert_eq!(merged.moved_products, 1);
        assert_eq!(merged.page.bio, "Destination details");
        assert_eq!(merged.page.location, "Colombo");
        assert_eq!(merged.page.source_url, "https://lk.example/");
        assert_eq!(merged.page.source_urls, ["https://india.example/"]);
        assert_eq!(merged.page.merged_page_ids, [source.id.clone()]);
        assert!(!ws.profiles.contains_key(&source.id));
        assert!(ws.trash.profiles.contains_key(&source.id));
        assert_eq!(ws.items[&item.id].shop_id, target.id);
        assert_eq!(ws.items[&item.id].media, item.media);
        assert_eq!(ws.items[&item.id].price_cents, Some(153900));
        assert_eq!(ws.items[&item.id].currency, "INR");
        assert_eq!(ws.items[&item.id].source_url, item.source_url);
        assert_eq!(ws.trash.items[&deleted.id].shop_id, target.id);
        assert_eq!(ws.trash.posts[&deleted_post.id].author_id, target.id);
        let after = &ws.posts[&post.id];
        assert_eq!(after.author_id, target.id);
        assert_eq!(after.content, format!("Visit @[profile:{}]", target.id));
        assert_eq!(after.with_ids, [target.id.clone()]);
        assert_eq!(after.place_id.as_deref(), Some(target.id.as_str()));
        assert_eq!(after.activities[0].with_ids, [target.id.clone()]);
        assert_eq!(after.media[0].tags[0].profile_id, target.id);
        assert_eq!(after.media[0].tags[1].item_id, item.id);
        assert_eq!(after.comments[0].author_id, target.id);
        assert_eq!(after.comments[0].content, format!("@[profile:{}]", target.id));
        assert_eq!(after.reactions.len(), 1);
        assert_eq!(after.reactions[0].kind, "love");
        assert_eq!(after.poll.as_ref().unwrap().votes.len(), 1);
        assert_eq!(after.poll.as_ref().unwrap().votes[0].option_id, "b");
        assert_eq!(ws.profiles[&related.id].relations[0].to_id, target.id);
        let copied_avatar = merged.page.avatar.unwrap();
        assert_ne!(copied_avatar.id, avatar.id);
        assert_eq!(ws.merge_pages(&source.id, &target.id).unwrap().moved_products, 0);
        // Emptying the old profile from Trash must not delete destination photos/products.
        ws.purge("profile", &source.id).unwrap();
        assert_eq!(&**ws.read_media_bytes(&copied_avatar.id).unwrap(), PNG);
        let workspace_id = ws.id.clone();
        drop(ws);
        let ws = open_workspace(root.path(), &workspace_id, "password").unwrap();
        assert_eq!(ws.items[&item.id].shop_id, target.id);
        assert_eq!(ws.items[&item.id].media, item.media);
        assert_eq!(ws.profiles[&target.id].merged_page_ids, [source.id]);
        assert_eq!(ws.posts[&post.id].author_id, target.id);
        assert_eq!(ws.trash.posts[&deleted_post.id].author_id, target.id);
        assert!(!ws.search("Keep", 20).items.is_empty());
    }

    #[test]
    fn merge_pages_rejects_people_owner_self_and_incompatible_destination() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Test", "Alex", "password", FAST).unwrap();
        let source = profile(&mut ws, "Shop", "shop");
        let person = profile(&mut ws, "Person", "person");
        let page = profile(&mut ws, "Page", "page");
        let owner = ws.manifest.owner_profile_id.clone();
        for (from, to) in [(&source.id, &source.id), (&person.id, &source.id), (&source.id, &person.id), (&owner, &source.id), (&source.id, &owner), (&source.id, &page.id)] {
            assert!(ws.merge_pages(from, to).is_err());
        }
        assert!(ws.profiles.contains_key(&source.id));
        assert!(ws.trash.profiles.is_empty());
        assert!(ws.profiles[&source.id].merged_page_ids.is_empty());
    }

    #[test]
    fn merge_pages_can_retry_after_a_disk_write_failure() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Test", "Alex", "password", FAST).unwrap();
        let source = profile(&mut ws, "Duplicate", "shop");
        let target = profile(&mut ws, "Keep", "shop");
        let item = ws.save_item(serde_json::from_value(json!({"shopId": source.id, "name": "Bra", "status": "available"})).unwrap()).unwrap();
        let path = ws.record_path(Kind::Item, &item.id);
        let bytes = fs::read(&path).unwrap();
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap(); // rename over a directory must fail.
        assert!(ws.merge_pages(&source.id, &target.id).is_err());
        assert!(ws.profiles.contains_key(&source.id));
        assert_eq!(ws.items[&item.id].shop_id, source.id);
        fs::remove_dir(&path).unwrap();
        fs::write(&path, bytes).unwrap();
        let id = ws.id.clone();
        drop(ws);
        let mut ws = open_workspace(root.path(), &id, "password").unwrap();
        assert_eq!(ws.merge_pages(&source.id, &target.id).unwrap().moved_products, 1);
        assert_eq!(ws.items[&item.id].shop_id, target.id);
        assert!(!ws.profiles.contains_key(&source.id));
    }

    #[test]
    fn merge_pages_multiple_choice_votes_are_combined_without_duplicates() {
        let mut post: Post = serde_json::from_value(json!({
            "id": "post", "authorId": "source", "content": "", "occurredAt": 1, "createdAt": 1, "updatedAt": 1,
            "poll": {"multiple": true, "options": [], "votes": [
                {"profileId": "source", "optionId": "a", "createdAt": 1},
                {"profileId": "target", "optionId": "a", "createdAt": 2},
                {"profileId": "source", "optionId": "b", "createdAt": 3}
            ]}
        })).unwrap();
        replace_post(&mut post, "source", "target");
        let votes = post.poll.unwrap().votes;
        assert_eq!(votes.len(), 2);
        assert!(votes.iter().all(|v| v.profile_id == "target"));
        assert_eq!(votes[0].option_id, "a");
        assert_eq!(votes[1].option_id, "b");
    }
}
