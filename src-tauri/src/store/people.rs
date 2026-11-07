//! Structured person imports and incremental family onboarding.
use super::*;

#[derive(Clone, Copy, PartialEq)]
pub enum PersonImportMode { Create, Update, Upsert }

fn slug(value: &str) -> String { slugify(value).replace('_', "-") }
fn name_key(value: &str) -> String { value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase() }

pub(super) fn clean_details(mut d: PersonDetails) -> Result<PersonDetails> {
    d.slug = slug(&d.slug);
    d.display_name = short(&d.display_name, 200);
    d.hometown = short(&d.hometown, 300);
    d.occupation = short(&d.occupation, 300);
    d.employer = short(&d.employer, 300);
    d.email = short(&d.email, 300);
    d.phone = short(&d.phone, 100);
    d.notes = d.notes.trim().to_string();
    for url in [&mut d.website, &mut d.facebook_url] {
        *url = url.trim().to_string();
        if !url.is_empty() {
            let host = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://"))
                .and_then(|s| s.split(['/', '?', '#']).next()).unwrap_or("");
            if url.len() > 2000 || host.is_empty() || host.contains('@') || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
                return Err(Error::Invalid("Profile links must be complete http:// or https:// URLs.".into()));
            }
        }
    }
    if d.education.len() > 50 || d.languages.len() > 50 {
        return Err(Error::Invalid("A profile can have at most 50 education entries and 50 languages.".into()));
    }
    for e in &mut d.education {
        e.kind = short(&e.kind, 60);
        e.name = required(&e.name, "School or college")?;
        e.program = short(&e.program, 300);
        e.years = short(&e.years, 100);
    }
    let mut languages: Vec<String> = Vec::new();
    for language in &d.languages {
        let language = short(language, 80);
        if !language.is_empty() && !languages.iter().any(|x| x.eq_ignore_ascii_case(&language)) { languages.push(language); }
    }
    d.languages = languages;
    Ok(d)
}

/// Exact identifiers only. Conflicting matches require an explicit profile id.
fn resolve(profiles: &HashMap<String, Profile>, data: &Value) -> Result<Option<String>> {
    if let Some(id) = data.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        return profiles.get(id).filter(|p| p.is_person()).map(|p| Some(p.id.clone()))
            .ok_or_else(|| Error::NotFound(format!("person {id}")));
    }
    let text = |key| data.get(key).and_then(Value::as_str).unwrap_or("").trim();
    let (name, import_slug, facebook) = (name_key(text("name")), slug(text("slug")), text("facebookUrl").trim_end_matches('/'));
    let found: Vec<_> = profiles.values().filter(|p| p.is_person()).filter(|p| {
        (!name.is_empty() && name_key(&p.name) == name)
            || (!import_slug.is_empty() && (p.details.slug == import_slug || slug(&p.name) == import_slug))
            || (!facebook.is_empty() && p.details.facebook_url.trim_end_matches('/').eq_ignore_ascii_case(facebook))
    }).collect();
    match found.as_slice() {
        [] => Ok(None),
        [p] => Ok(Some(p.id.clone())),
        _ => Err(Error::Invalid("Person identifiers match more than one profile. Give the intended profile id.".into())),
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reference {
    #[serde(default, alias = "toId")]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(rename = "type", alias = "kind")]
    kind: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    inverse_label: String,
    #[serde(default)]
    since: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    /// On a child reference: additional parents of that child, independent of partners.
    #[serde(default)]
    other_parents: Vec<ParentReference>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParentReference {
    #[serde(default, alias = "toId")]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    slug: Option<String>,
    #[serde(default = "default_parent_kind", rename = "type")]
    kind: String,
}
fn default_parent_kind() -> String { "parent".into() }

fn family_role(kind: &str) -> Option<&'static str> {
    static ROLES: std::sync::OnceLock<HashMap<String, String>> = std::sync::OnceLock::new();
    ROLES.get_or_init(|| {
        let catalog: RelationCatalog = serde_json::from_str(include_str!("../../../src/lib/relations.json")).expect("valid relations catalog");
        catalog.kinds.into_iter().filter_map(|k| k.family_tree.map(|role| (k.kind, role))).collect()
    }).get(kind).map(String::as_str)
}

fn relationship_word(kind: &str, terms: &str) -> String {
    static LABELS: std::sync::OnceLock<HashMap<String, [String; 3]>> = std::sync::OnceLock::new();
    let labels = LABELS.get_or_init(|| {
        let catalog: RelationCatalog = serde_json::from_str(include_str!("../../../src/lib/relations.json")).expect("valid relations catalog");
        catalog.kinds.into_iter().map(|k| (k.kind, k.label)).collect()
    });
    let index = match terms { "feminine" => 1, "masculine" => 2, _ => 0 };
    labels.get(kind).map(|words| words[index].clone()).unwrap_or_else(|| kind.to_string())
}

fn parent_pair<'a>(source: &'a str, target: &'a str, kind: &str) -> Option<(&'a str, &'a str)> {
    match family_role(kind) {
        Some("child") => Some((source, target)),
        Some("parent") => Some((target, source)),
        _ => None,
    }
}

fn ancestry_pair<'a>(source: &'a str, target: &'a str, kind: &str) -> Option<(&'a str, &'a str)> {
    match kind {
        "parent" | "child" | "birth_parent" | "birth_child" | "adoptive_parent" | "adopted_child" => parent_pair(source, target, kind),
        _ => None,
    }
}

/// Parent links are explicit. Neither marriage nor a sibling label supplies a parent.
pub(super) fn validate_family_link(profiles: &HashMap<String, Profile>, source: &str, target: &str, kind: &str, ignore: Option<&str>) -> Result<()> {
    let Some((parent, child)) = parent_pair(source, target, kind) else { return Ok(()) };
    if ![parent, child].iter().all(|id| profiles.get(*id).is_some_and(Profile::is_person)) {
        return Err(Error::Invalid("Parents and children must be people.".into()));
    }
    // Caregiving is not ancestry: an adult child may be their parent's guardian.
    if ancestry_pair(source, target, kind).is_none() { return Ok(()) }
    let mut descendants: HashMap<&str, Vec<&str>> = HashMap::new();
    for p in profiles.values().filter(|p| p.is_person()) {
        for r in &p.relations {
            if Some(r.id.as_str()) == ignore { continue; }
            if let Some((a, b)) = ancestry_pair(&p.id, &r.to_id, &r.kind) {
                descendants.entry(a).or_default().push(b);
            }
        }
    }
    let mut stack = vec![child];
    let mut seen = HashSet::new();
    while let Some(id) = stack.pop() {
        if id == parent { return Err(Error::Invalid("That parent link would make someone their own ancestor.".into())); }
        if seen.insert(id) { stack.extend(descendants.get(id).into_iter().flatten().copied()); }
    }
    Ok(())
}

fn link_reference(planned: &mut HashMap<String, Profile>, changed: &mut HashSet<String>, source_id: &str, other_id: &str, reference: &Reference, kind: &str) -> Result<()> {
    if source_id == other_id { return Err(Error::Invalid("A profile can't be related to itself.".into())); }
    validate_family_link(planned, source_id, other_id, kind, None)?;
    let inverse = inverse_relation(kind).ok_or_else(|| Error::Invalid(format!("Unknown relationship: {kind}")))?;
    let label = short(&reference.label, 60);
    let mut source = planned[source_id].clone();
    if let Some(r) = source.relations.iter_mut().find(|r| r.to_id == other_id && r.kind == kind && (kind != "custom" || r.label == label)) {
        if !label.is_empty() { r.label = label.clone(); }
        if !reference.inverse_label.is_empty() { r.inverse_label = short(&reference.inverse_label, 60); }
        if let Some(notes) = &reference.notes { r.notes = notes.trim().to_string(); }
        if let Some(since) = &reference.since { r.since = short(since, 40); }
        changed.insert(source_id.to_string());
    } else if let Some(r) = planned.get_mut(other_id).unwrap().relations.iter_mut().find(|r| r.to_id == source_id && r.kind == inverse && (inverse != "custom" || r.inverse_label == label)) {
        if !label.is_empty() { r.inverse_label = label.clone(); }
        if !reference.inverse_label.is_empty() { r.label = short(&reference.inverse_label, 60); }
        if let Some(notes) = &reference.notes { r.notes = notes.trim().to_string(); }
        if let Some(since) = &reference.since { r.since = short(since, 40); }
        changed.insert(other_id.to_string());
    } else {
        source.relations.push(Relation {
            id: Uuid::new_v4().to_string(), to_id: other_id.to_string(), kind: kind.into(), label,
            inverse_label: short(&reference.inverse_label, 60), since: short(reference.since.as_deref().unwrap_or(""), 40),
            notes: reference.notes.as_deref().unwrap_or("").trim().to_string(),
        });
        changed.insert(source_id.to_string());
    }
    planned.insert(source_id.to_string(), source);
    Ok(())
}

fn relation_kind(value: &str) -> (&str, Option<&str>) {
    match value {
        "husband" => ("spouse", Some("masculine")), "wife" => ("spouse", Some("feminine")),
        "ex_husband" | "former_husband" => ("ex_spouse", Some("masculine")),
        "ex_wife" | "former_wife" => ("ex_spouse", Some("feminine")),
        "brother" => ("sibling", Some("masculine")), "sister" => ("sibling", Some("feminine")),
        "father" => ("parent", Some("masculine")), "mother" => ("parent", Some("feminine")),
        "son" => ("child", Some("masculine")), "daughter" => ("child", Some("feminine")),
        "stepson" | "step_son" => ("step_child", Some("masculine")), "stepdaughter" | "step_daughter" => ("step_child", Some("feminine")),
        "stepfather" | "step_father" => ("step_parent", Some("masculine")), "stepmother" | "step_mother" => ("step_parent", Some("feminine")),
        "half_brother" => ("half_sibling", Some("masculine")), "half_sister" => ("half_sibling", Some("feminine")),
        "son_in_law" => ("child_in_law", Some("masculine")), "daughter_in_law" => ("child_in_law", Some("feminine")),
        "father_in_law" => ("parent_in_law", Some("masculine")), "mother_in_law" => ("parent_in_law", Some("feminine")),
        "brother_in_law" => ("sibling_in_law", Some("masculine")), "sister_in_law" => ("sibling_in_law", Some("feminine")),
        other => (other, None),
    }
}

/// Imports accept the partial birthdays used by the source JSON, without inventing a year.
fn import_date(value: &str, birthday: bool) -> String {
    let value = value.trim();
    // User preference: year-only dates use January 1 of that year.
    if birthday && value.len() == 4 && value.bytes().all(|c| c.is_ascii_digit()) {
        return format!("{value}-01-01");
    }
    let words: Vec<_> = value.trim().split([',', ' ']).filter(|s| !s.is_empty()).collect();
    const MONTHS: [&str; 12] = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    if (2..=3).contains(&words.len()) {
        if let (Some(month), Ok(day)) = (MONTHS.iter().position(|m| m.eq_ignore_ascii_case(words[0])), words[1].parse::<u32>()) {
            let md = format!("{:02}-{day:02}", month + 1);
            return if words.len() == 3 { format!("{}-{md}", words[2]) } else { md };
        }
    }
    value.to_string()
}

/// Only editable profile fields can be supplied by an import. Media and graph records
/// are changed by their own paths, so imported ids/timestamps cannot replace them.
const FIELDS: &[&str] = &[
    "name", "slug", "displayName", "tagline", "bio", "relationship", "location", "color", "genders", "pronouns", "terms",
    "relationshipStatus", "birthday", "anniversary", "hometown", "occupation", "employer", "education", "website", "email", "phone",
    "languages", "facebookUrl", "isActive", "notes", "isPlaceholder",
];

impl Workspace {
    pub fn import_person(&mut self, data: &Value, mode: PersonImportMode) -> Result<PersonImport> {
        let fields = data.as_object().ok_or_else(|| Error::Invalid("Give a person as a JSON object.".into()))?;
        let existing_id = resolve(&self.profiles, data)?;
        let existing = existing_id.as_ref().map(|id| &self.profiles[id]);
        if mode == PersonImportMode::Update && existing.is_none() {
            return Err(Error::NotFound("No matching person. Import or create them first.".into()));
        }
        if mode == PersonImportMode::Create && existing.is_some_and(|p| !p.details.is_placeholder) {
            let p = existing.unwrap();
            return Err(Error::Invalid(format!("\"{}\" already exists (id {}). Use update_person or import_person to change them.", p.name, p.id)));
        }
        let mut merged = existing.map(serde_json::to_value).transpose()?.unwrap_or_else(|| json!({"kind": "person", "color": "teal"}));
        for key in FIELDS {
            if mode == PersonImportMode::Update && *key == "name" { continue; }
            if let Some(value) = fields.get(*key).filter(|v| !v.is_null()) { merged[*key] = value.clone(); }
        }
        if let Some(rename) = fields.get("newName").filter(|v| !v.is_null()) { merged["name"] = rename.clone(); }
        let supplied = |key: &str| fields.get(key).is_some_and(|v| !v.is_null());
        if !supplied("isPlaceholder") { merged["isPlaceholder"] = json!(false); }
        if !supplied("genders") {
            if let Some(gender) = fields.get("gender").and_then(Value::as_str) {
                merged["genders"] = json!([gender]);
                if !supplied("terms") && merged["terms"].as_str().unwrap_or("neutral") == "neutral" {
                    merged["terms"] = json!(match gender.to_lowercase().as_str() { "female" | "woman" => "feminine", "male" | "man" => "masculine", _ => "neutral" });
                }
            }
        }
        if let Some(date) = merged["birthday"].as_str() { merged["birthday"] = json!(import_date(date, true)); }
        if let Some(date) = merged["anniversary"].as_str() { merged["anniversary"] = json!(import_date(date, false)); }
        let input: ProfileInput = serde_json::from_value(merged)?;
        if !TERMS.contains(&input.terms.as_str()) { return Err(Error::Invalid("terms must be neutral, feminine or masculine.".into())); }
        let person = self.prepare_profile(input)?;
        let references: Vec<Reference> = match fields.get("relationships").filter(|v| !v.is_null()) {
            Some(value) => serde_json::from_value(value.clone())?, None => Vec::new(),
        };
        if references.len() > 100 { return Err(Error::Invalid("Import at most 100 family references at a time.".into())); }
        let mut planned = self.profiles.clone();
        planned.insert(person.id.clone(), person.clone());
        let mut related_people = Vec::new();
        let mut changed: HashSet<String> = HashSet::new();
        let mut created_ids = HashSet::new();
        let mut pending: std::collections::VecDeque<_> = references.into_iter().map(|r| (person.id.clone(), r)).collect();
        let mut processed = 0;
        while let Some((source_id, mut reference)) = pending.pop_front() {
            processed += 1;
            if processed > 200 { return Err(Error::Invalid("Import at most 200 family links, including other parents, at a time.".into())); }
            let (kind, terms) = relation_kind(&reference.kind);
            if reference.label.trim().is_empty() {
                if let Some(terms) = terms { reference.label = relationship_word(kind, terms); }
            }
            inverse_relation(kind).ok_or_else(|| Error::Invalid(format!("Unknown relationship: {}", reference.kind)))?;
            if !reference.other_parents.is_empty() && family_role(kind) != Some("child") {
                return Err(Error::Invalid("otherParents belongs on a child relationship.".into()));
            }
            if kind == "custom" && reference.label.trim().is_empty() { return Err(Error::Invalid("Describe the relationship.".into())); }
            let lookup = json!({"id": reference.id, "name": reference.name, "slug": reference.slug});
            let other_id = match resolve(&planned, &lookup)? {
                Some(id) => id,
                None => {
                    let import_slug = reference.slug.as_deref().map(slug).unwrap_or_default();
                    let name = reference.name.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string)
                        .unwrap_or_else(|| import_slug.split('-').map(|word| {
                            let mut chars = word.chars();
                            chars.next().map(|c| c.to_uppercase().collect::<String>() + chars.as_str()).unwrap_or_default()
                        }).collect::<Vec<_>>().join(" "));
                    let p = self.prepare_profile(serde_json::from_value(json!({
                        "kind": "person", "name": name, "slug": import_slug, "isPlaceholder": true,
                        "terms": terms.unwrap_or("neutral"), "color": "teal"
                    }))?)?;
                    changed.insert(p.id.clone());
                    created_ids.insert(p.id.clone());
                    let id = p.id.clone();
                    planned.insert(id.clone(), p);
                    id
                }
            };
            if other_id == source_id { return Err(Error::Invalid("A profile can't be related to itself.".into())); }
            // Remember an explicit mapping (e.g. a full-name source slug pointing at
            // a journal profile known by a shorter name) for subsequent imports.
            let import_slug = reference.slug.as_deref().map(slug).unwrap_or_default();
            if !import_slug.is_empty() && planned[&other_id].details.slug.is_empty() {
                if planned.values().any(|p| p.id != other_id && p.is_person() && p.details.slug == import_slug) {
                    return Err(Error::Invalid("That family reference's import key belongs to another profile.".into()));
                }
                planned.get_mut(&other_id).unwrap().details.slug = import_slug;
                changed.insert(other_id.clone());
            }
            link_reference(&mut planned, &mut changed, &source_id, &other_id, &reference, kind)?;
            for parent in reference.other_parents {
                let parent_kind = relation_kind(&parent.kind).0.to_string();
                if family_role(&parent_kind) != Some("parent") {
                    return Err(Error::Invalid("An otherParents entry must use parent, birth_parent, adoptive_parent, step_parent, foster_parent or guardian.".into()));
                }
                pending.push_back((other_id.clone(), Reference {
                    id: parent.id, name: parent.name, slug: parent.slug, kind: parent.kind,
                    label: String::new(), inverse_label: String::new(), since: None, notes: None,
                    other_parents: Vec::new(),
                }));
            }
            if !related_people.iter().any(|p: &ImportedPerson| p.id == other_id) {
                let p = &planned[&other_id];
                related_people.push(ImportedPerson { id: p.id.clone(), name: p.name.clone(), created: created_ids.contains(&other_id), is_placeholder: p.details.is_placeholder });
            }
        }
        let mut person = planned.remove(&person.id).unwrap();
        person.updated_at = now_millis();
        changed.remove(&person.id);
        // Validation above has no side effects. Persist referenced people before their
        // links. A disk failure can be retried by the same stable identities.
        for id in changed {
            let mut p = planned.remove(&id).unwrap();
            p.updated_at = now_millis();
            self.write_record(Kind::Profile, &id, &p, json!({}))?;
            self.profiles.insert(id.clone(), p);
            self.index_profile(&id);
        }
        self.write_record(Kind::Profile, &person.id, &person, json!({}))?;
        self.profiles.insert(person.id.clone(), person.clone());
        self.index_profile(&person.id);
        Ok(PersonImport { profile: person, created: existing_id.is_none(), related_people })
    }
}

pub(super) fn search_details(p: &Profile) -> String {
    let d = &p.details;
    let mut parts = vec![d.display_name.as_str(), &d.hometown, &d.occupation, &d.employer, &d.website, &d.email, &d.phone, &d.facebook_url, &d.notes];
    parts.extend(d.languages.iter().map(String::as_str));
    for e in &d.education { parts.extend([e.name.as_str(), &e.program, &e.years]); }
    parts.into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ")
}

#[cfg(test)]
mod tests {
    use super::*;
    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };
    fn workspace() -> (tempfile::TempDir, Workspace) {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "family", "Family", "Alex", "correct horse", FAST).unwrap();
        (root, ws)
    }

    #[test]
    fn structured_fields_survive_reopen_are_searchable_and_old_profiles_have_defaults() {
        let (root, mut ws) = workspace();
        let p = ws.import_person(&json!({
            "name": "Maya Perera", "displayName": "Maya", "gender": "female", "birthday": "January 1, 1960",
            "hometown": "Hill Country", "occupation": "Draftsperson", "employer": "Example Bank",
            "education": [{"type": "college", "name": "Technical College", "program": "Civil Engineering", "years": "Class of 1982"}],
            "website": "https://example.com", "facebookUrl": "https://www.facebook.com/maya.example", "email": "maya@example.com",
            "phone": "+94 123456789", "languages": ["Sinhala", " English ", "english"], "isActive": false, "notes": "Source notes"
        }), PersonImportMode::Upsert).unwrap().profile;
        assert_eq!(p.birthday, "1960-01-01");
        assert_eq!(p.terms, "feminine");
        assert_eq!(p.details.languages, ["Sinhala", "English"]);
        let reopened = open_workspace(root.path(), "workspace_family", "correct horse").unwrap();
        let stored = &reopened.profiles[&p.id];
        assert_eq!(serde_json::to_value(&stored.details).unwrap(), serde_json::to_value(&p.details).unwrap());
        assert_eq!(stored.details.education[0].years, "Class of 1982");
        assert!(!stored.details.is_active);
        let results = reopened.search("Civil Engineering", 10);
        assert!(results.profiles.iter().any(|hit| hit.id == p.id));
        let mut old = serde_json::to_value(stored).unwrap();
        for key in serde_json::to_value(&p.details).unwrap().as_object().unwrap().keys() { old.as_object_mut().unwrap().remove(key); }
        let old: Profile = serde_json::from_value(old).unwrap();
        assert!(old.details.is_active && !old.details.is_placeholder);
        assert!(old.details.education.is_empty() && old.details.notes.is_empty());
    }

    #[test]
    fn missing_relatives_are_reused_and_promoted_without_losing_media_or_links() {
        let (root, mut ws) = workspace();
        let source = json!({"name": "Maya", "relationships": [
            {"type": "husband", "slug": "dev-perera", "name": "Dev Perera", "notes": "Known as Dev"},
            {"type": "brother", "slug": "june-morgan", "name": "June Morgan"}
        ]});
        let first = ws.import_person(&source, PersonImportMode::Upsert).unwrap();
        assert!(first.created && first.related_people.iter().all(|p| p.created && p.is_placeholder));
        let spouse = first.related_people.iter().find(|p| p.name == "Dev Perera").unwrap().id.clone();
        let p = &ws.profiles[&spouse];
        assert_eq!(p.terms, "masculine");
        let photo = ws.stage_media("head.png", vec![137, 80, 78, 71, 13, 10, 26, 10]).unwrap();
        ws.set_profile_photo(&spouse, PhotoSlot::FaceBack, Some(photo.id.clone())).unwrap();
        let repeat = ws.import_person(&source, PersonImportMode::Upsert).unwrap();
        assert_eq!(repeat.profile.id, first.profile.id);
        assert_eq!(ws.profiles.len(), 4);
        assert_eq!(repeat.profile.relations.len(), 2);
        assert!(repeat.related_people.iter().all(|p| !p.created));
        let promoted = ws.import_person(&json!({"name": "Dev P.", "slug": "dev-perera", "occupation": "Teacher", "relationships": [{"type": "spouse", "name": "Maya"}]}), PersonImportMode::Create).unwrap();
        assert_eq!(promoted.profile.id, spouse);
        assert!(!promoted.profile.details.is_placeholder && !promoted.created);
        assert_eq!(promoted.profile.faces.back.as_ref().unwrap().id, photo.id);
        assert!(promoted.profile.relations.is_empty(), "inverse link is reused, not duplicated");
        assert_eq!(ws.profiles[&first.profile.id].relations[0].notes, "Known as Dev");
        let reopened = open_workspace(root.path(), "workspace_family", "correct horse").unwrap();
        assert_eq!(reopened.profiles[&first.profile.id].relations[0].to_id, spouse);
        assert_eq!(reopened.profiles[&spouse].details.occupation, "Teacher");
    }

    #[test]
    fn explicit_mapping_remembers_full_slug_and_null_fields_preserve_existing_details() {
        let (_root, mut ws) = workspace();
        let owner = ws.owner_id().to_string();
        let data = json!({"name": "Maya", "birthday": "December 10", "occupation": "Nurse", "relationships": [
            {"type": "cousin_in_law", "id": owner, "slug": "alex-morgan"}
        ]});
        let first = ws.import_person(&data, PersonImportMode::Upsert).unwrap();
        assert_eq!(ws.profiles.len(), 2);
        assert_eq!(ws.profiles[&owner].details.slug, "alex-morgan");
        let again = ws.import_person(&json!({"name": "Maya", "occupation": null, "birthday": null, "relationships": [{"type": "cousin_in_law", "slug": "alex-morgan"}]}), PersonImportMode::Upsert).unwrap();
        assert_eq!(ws.profiles.len(), 2);
        assert_eq!(again.profile.id, first.profile.id);
        assert_eq!(again.profile.birthday, "12-10");
        assert_eq!(again.profile.details.occupation, "Nurse");
        assert_eq!(again.profile.relations.len(), 1);
    }

    #[test]
    fn invalid_imports_create_neither_the_person_nor_partial_relatives() {
        let (root, mut ws) = workspace();
        for bad in [
            json!({"name": "Maya", "relationships": [{"type": "brother", "name": "Dev"}, {"type": "not_a_relation", "name": "June"}]}),
            json!({"name": "Maya", "birthday": "February 30", "relationships": [{"type": "brother", "name": "Dev"}]}),
            json!({"name": "Maya", "relationships": [{"type": "sibling"}]}),
            json!({"name": "Maya", "relationships": [{"type": "sibling", "name": "Maya"}]}),
            json!({"name": "Maya", "website": "javascript:alert(1)"}),
        ] {
            assert!(ws.import_person(&bad, PersonImportMode::Upsert).is_err(), "{bad}");
            assert_eq!(ws.profiles.len(), 1);
        }
        let reopened = open_workspace(root.path(), "workspace_family", "correct horse").unwrap();
        assert_eq!(reopened.profiles.len(), 1);
    }

    #[test]
    fn conflicting_matches_require_an_explicit_id_and_never_merge_people() {
        let (_root, mut ws) = workspace();
        let first = ws.import_person(&json!({"name": "Maya", "slug": "maya-perera"}), PersonImportMode::Upsert).unwrap();
        let second = ws.import_person(&json!({"name": "June", "slug": "june-morgan"}), PersonImportMode::Upsert).unwrap();
        assert!(ws.import_person(&json!({"name": "Maya", "slug": "june-morgan"}), PersonImportMode::Upsert).is_err());
        assert_eq!(ws.profiles[&first.profile.id].name, "Maya");
        assert_eq!(ws.profiles[&second.profile.id].name, "June");
        assert!(ws.import_person(&json!({"name": "Maya"}), PersonImportMode::Create).is_err());
        assert!(ws.import_person(&json!({"name": "Unknown"}), PersonImportMode::Update).is_err());
    }

    fn parents_of(ws: &Workspace, child: &str) -> HashSet<String> {
        ws.profiles.values().flat_map(|p| p.relations.iter().filter_map(|r| parent_pair(&p.id, &r.to_id, &r.kind)))
            .filter(|(_, id)| *id == child).map(|(id, _)| id.to_string()).collect()
    }

    #[test]
    fn children_from_multiple_partners_keep_explicit_parents_and_survive_reimport() {
        let (root, mut ws) = workspace();
        let data = json!({"name": "Maya", "relationships": [
            {"type": "husband", "name": "Dev"},
            {"type": "ex_husband", "name": "Sam"},
            {"type": "daughter", "name": "June", "otherParents": [{"name": "Sam", "type": "father"}]},
            {"type": "son", "name": "Robin", "otherParents": [{"name": "Dev"}]},
            {"type": "child", "name": "Theo"}
        ]});
        let first = ws.import_person(&data, PersonImportMode::Upsert).unwrap();
        let id = |ws: &Workspace, name: &str| ws.profiles.values().find(|p| p.name == name).unwrap().id.clone();
        let maya = first.profile.id.clone();
        let (dev, sam, june, robin, theo) = (id(&ws, "Dev"), id(&ws, "Sam"), id(&ws, "June"), id(&ws, "Robin"), id(&ws, "Theo"));
        assert_eq!(parents_of(&ws, &june), HashSet::from([maya.clone(), sam.clone()]));
        assert_eq!(parents_of(&ws, &robin), HashSet::from([maya.clone(), dev.clone()]));
        assert_eq!(parents_of(&ws, &theo), HashSet::from([maya.clone()]));
        assert!(ws.profiles[&june].details.is_placeholder);
        assert!(ws.profiles[&maya].relations.iter().any(|r| r.kind == "ex_spouse" && r.to_id == sam));
        assert!(!ws.profiles[&dev].relations.iter().any(|r| r.to_id == june));
        let repeat = ws.import_person(&data, PersonImportMode::Upsert).unwrap();
        assert_eq!(repeat.profile.id, maya);
        assert_eq!(ws.profiles.len(), 7);
        assert_eq!(ws.profiles[&june].relations.len(), 1);
        assert_eq!(repeat.profile.relations.len(), 5);
        assert!(repeat.related_people.iter().all(|p| !p.created));
        let reopened = open_workspace(root.path(), "workspace_family", "correct horse").unwrap();
        assert_eq!(parents_of(&reopened, &june), HashSet::from([maya, sam]));
    }

    #[test]
    fn additional_parents_can_be_missing_and_have_distinct_roles_without_a_two_parent_limit() {
        let (_root, mut ws) = workspace();
        let imported = ws.import_person(&json!({"name": "Maya", "relationships": [{
            "type": "adopted_child", "name": "June", "otherParents": [
                {"name": "Dev", "type": "birth_parent"}, {"name": "Sam", "type": "step_parent"}, {"slug": "robin-morgan", "type": "guardian"}
            ]
        }]}), PersonImportMode::Upsert).unwrap();
        assert_eq!(imported.related_people.len(), 4);
        assert!(imported.related_people.iter().all(|p| p.created && p.is_placeholder));
        let june = ws.profiles.values().find(|p| p.name == "June").unwrap();
        assert_eq!(parents_of(&ws, &june.id).len(), 4);
        assert_eq!(june.relations.iter().map(|r| r.kind.as_str()).collect::<HashSet<_>>(), HashSet::from(["birth_parent", "step_parent", "guardian"]));
        assert_eq!(imported.profile.relations[0].kind, "adopted_child");
        assert!(!ws.profiles.values().any(|p| p.relations.iter().any(|r| r.kind == "spouse")), "parenthood doesn't invent romantic relationships");
    }

    #[test]
    fn parent_cycles_are_rejected_in_imports_and_manual_relationships_without_partial_changes() {
        let (_root, mut ws) = workspace();
        let maya = ws.import_person(&json!({"name": "Maya", "relationships": [{"type": "child", "name": "June"}]}), PersonImportMode::Upsert).unwrap().profile;
        let june = ws.import_person(&json!({"name": "June", "relationships": [{"type": "child", "name": "Theo"}]}), PersonImportMode::Upsert).unwrap().profile;
        let theo = ws.profiles.values().find(|p| p.name == "Theo").unwrap().clone();
        let before = serde_json::to_value(&ws.profiles).unwrap();
        assert!(ws.import_person(&json!({"id": theo.id, "relationships": [
            {"type": "spouse", "name": "New person"}, {"type": "child", "id": maya.id}
        ]}), PersonImportMode::Upsert).is_err());
        assert_eq!(serde_json::to_value(&ws.profiles).unwrap(), before);
        assert!(ws.save_relation(&theo.id, RelationInput {
            id: None, to_id: maya.id.clone(), kind: "child".into(), label: String::new(), inverse_label: String::new(), since: String::new(), notes: String::new(),
        }).is_err());
        for bad in [
            json!({"id": maya.id, "relationships": [{"type": "spouse", "name": "Someone", "otherParents": [{"name": "Other"}]}]}),
            json!({"id": maya.id, "relationships": [{"type": "child", "name": "Someone", "otherParents": [{"name": "Other", "type": "spouse"}]}]}),
            json!({"id": june.id, "relationships": [{"type": "child", "id": maya.id}]}),
        ] { assert!(ws.import_person(&bad, PersonImportMode::Upsert).is_err()); }
        assert_eq!(serde_json::to_value(&ws.profiles).unwrap(), before);
    }

    #[test]
    fn caregiving_does_not_invent_ancestry_constraints() {
        let (_root, mut ws) = workspace();
        let maya = ws.import_person(&json!({"name": "Maya", "relationships": [{"type": "child", "name": "June"}]}), PersonImportMode::Upsert).unwrap().profile;
        let june = ws.profiles.values().find(|p| p.name == "June").unwrap().id.clone();
        // June can later become a legal guardian of their own parent.
        ws.import_person(&json!({"id": maya.id, "relationships": [{"type": "guardian", "id": june}]}), PersonImportMode::Upsert).unwrap();
        assert_eq!(ws.profiles[&maya.id].relations.len(), 2);
    }

    #[test]
    fn year_only_birthdays_use_january_first_and_keep_exact_or_year_unknown_dates() {
        let (root, mut ws) = workspace();
        let p = ws.import_person(&json!({"name": "Maya", "birthday": "2002"}), PersonImportMode::Upsert).unwrap().profile;
        assert_eq!(p.birthday, "2002-01-01");
        let reopened = open_workspace(root.path(), "workspace_family", "correct horse").unwrap();
        assert_eq!(reopened.profiles[&p.id].birthday, "2002-01-01");
        let p = ws.import_person(&json!({"id": p.id, "birthday": "2002-09-12"}), PersonImportMode::Update).unwrap().profile;
        assert_eq!(p.birthday, "2002-09-12");
        let p = ws.import_person(&json!({"id": p.id, "birthday": "December 10"}), PersonImportMode::Update).unwrap().profile;
        assert_eq!(p.birthday, "12-10");
        assert!(ws.import_person(&json!({"name": "Unknown", "anniversary": "2002"}), PersonImportMode::Upsert).is_err());
    }

    #[test]
    fn explicit_family_words_update_existing_links_without_duplicates_or_changing_identity() {
        let (_root, mut ws) = workspace();
        let p = ws.import_person(&json!({"name": "Kai", "relationships": [{"type": "parent", "name": "Robin"}, {"type": "child", "name": "Alex"}]}), PersonImportMode::Upsert).unwrap().profile;
        let robin = ws.profiles.values().find(|p| p.name == "Robin").unwrap().id.clone();
        let data = json!({"id": p.id, "relationships": [{"type": "father", "name": "Robin"}, {"type": "daughter", "name": "Alex"}]});
        for _ in 0..2 {
            let p = ws.import_person(&data, PersonImportMode::Upsert).unwrap().profile;
            assert_eq!(p.relations.len(), 2);
            assert_eq!(p.relations.iter().find(|r| r.kind == "parent").unwrap().label, "Father");
            assert_eq!(p.relations.iter().find(|r| r.kind == "child").unwrap().label, "Daughter");
        }
        assert_eq!(ws.profiles[&robin].terms, "neutral", "explicit edge words do not change a person's identity preferences");
        ws.import_person(&json!({"id": robin, "relationships": [{"type": "son", "id": p.id}]}), PersonImportMode::Upsert).unwrap();
        let r = ws.profiles[&p.id].relations.iter().find(|r| r.kind == "parent").unwrap();
        assert_eq!((r.label.as_str(), r.inverse_label.as_str()), ("Father", "Son"));
        assert!(ws.profiles[&robin].relations.is_empty(), "reuse the existing inverse instead of creating another edge");
    }
}
