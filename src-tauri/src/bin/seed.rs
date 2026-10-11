//! Generates a demo workspace with a known password for UI development.
//!
//! ```text
//! cargo run --bin seed -- [--force]
//! ```
//!
//! Creates `data_sources/workspace_demo` (password: `demo-password`).

use std::fs;

use my_diary_lib::model::*;
use my_diary_lib::store::{self, now_millis, Workspace};

const NAME: &str = "Demo Journal";
const PASSWORD: &str = "demo-password";
const DAY: i64 = 24 * 60 * 60 * 1000;
const HOUR: i64 = 60 * 60 * 1000;

fn profile(kind: ProfileKind, name: &str, color: &str) -> ProfileInput {
    ProfileInput {
        id: None,
        kind,
        name: name.into(),
        tagline: String::new(),
        bio: String::new(),
        relationship: String::new(),
        category: String::new(),
        location: String::new(),
        color: color.into(),
        has_shop: false,
        genders: Vec::new(),
        pronouns: String::new(),
        terms: "neutral".into(),
        relationship_status: String::new(),
    }
}

fn mention(p: &Profile) -> String {
    format!("@[profile:{}]", p.id)
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let force = std::env::args().any(|a| a == "--force");
    let root = store::data_root();
    let dir = root.join(format!("{}demo", store::WORKSPACE_PREFIX));
    if dir.exists() {
        if !force {
            eprintln!("{} already exists; pass --force to recreate it.", dir.display());
            std::process::exit(1);
        }
        fs::remove_dir_all(&dir)?;
    }
    fs::create_dir_all(&root)?;

    let mut ws = store::create_workspace(&root, "demo", NAME, "Alex Morgan", PASSWORD, store::DEFAULT_KDF)?;
    seed(&mut ws)?;
    println!("Created {} ({} profiles, {} posts, {} items)", dir.display(), ws.profiles.len(), ws.posts.len(), ws.items.len());
    println!("Password: {PASSWORD}");
    Ok(())
}

fn seed(ws: &mut Workspace) -> Result<(), Box<dyn std::error::Error>> {
    let me_id = ws.owner_id().to_string();
    let me = ws.profiles[&me_id].clone();
    ws.save_profile(ProfileInput {
        id: Some(me.id.clone()),
        tagline: "Writing it all down.".into(),
        bio: "Software engineer, amateur photographer, chronic coffee drinker.".into(),
        location: "Minneapolis".into(),
        genders: vec!["Non-binary".into()],
        pronouns: "they/them".into(),
        relationship_status: "In a queerplatonic relationship".into(),
        ..profile(ProfileKind::Me, &me.name, "teal")
    })?;

    let sarah = ws.save_profile(ProfileInput {
        relationship: "Sister".into(),
        tagline: "Usually found reading.".into(),
        bio: "Usually found reading or complaining about the weather.".into(),
        location: "St. Paul".into(),
        genders: vec!["Woman".into()],
        pronouns: "she/her".into(),
        terms: "feminine".into(),
        relationship_status: "Married".into(),
        ..profile(ProfileKind::Person, "Sarah Jenkins", "pink")
    })?;
    let dev = ws.save_profile(ProfileInput {
        relationship: "Best friend".into(),
        bio: "Climbing partner. Owes me $20.".into(),
        genders: vec!["Man".into()],
        pronouns: "he/him".into(),
        terms: "masculine".into(),
        ..profile(ProfileKind::Person, "Dev Patel", "indigo")
    })?;
    let robin = ws.save_profile(ProfileInput {
        relationship: "Queerplatonic partner".into(),
        bio: "Plant parent, sourdough evangelist.".into(),
        genders: vec!["Genderqueer".into(), "Two-Spirit".into()],
        pronouns: "they/them".into(),
        ..profile(ProfileKind::Person, "Robin Okafor", "emerald")
    })?;
    let bean = ws.save_profile(ProfileInput {
        category: "Coffee shop".into(),
        tagline: "Terrible wifi, excellent pour-overs.".into(),
        bio: "Cozy local cafe with terrible wifi but excellent pour-overs.".into(),
        location: "42 Lake St".into(),
        ..profile(ProfileKind::Shop, "The Rusty Bean", "amber")
    })?;
    let club = ws.save_profile(ProfileInput {
        category: "Book club".into(),
        tagline: "One book a month, too many snacks.".into(),
        has_shop: true,
        ..profile(ProfileKind::Page, "Northside Book Club", "violet")
    })?;
    let lake = ws.save_profile(ProfileInput {
        category: "Lake".into(),
        bio: "Favorite spot for weekend kayaking.".into(),
        location: "Minnetonka, MN".into(),
        ..profile(ProfileKind::Place, "Lake Minnetonka", "sky")
    })?;

    for (name, desc, cents, status) in [
        ("Ethiopian Yirgacheffe, 250g", "Bright, floral, a little lemony.", 1800, ItemStatus::Available),
        ("Pour-over", "Made to order. Worth the wait.", 550, ItemStatus::Available),
        ("Rusty Bean mug", "Stoneware, holds 12oz.", 2200, ItemStatus::Reserved),
        ("Holiday blend", "Seasonal; back next December.", 1600, ItemStatus::Sold),
    ] {
        ws.save_item(ItemInput {
            id: None,
            shop_id: bean.id.clone(),
            name: name.into(),
            description: desc.into(),
            price_cents: Some(cents),
            currency: "USD".into(),
            status,
        })?;
    }
    ws.save_item(ItemInput {
        id: None,
        shop_id: club.id.clone(),
        name: "Club tote bag".into(),
        description: "Canvas, fits at least four paperbacks.".into(),
        price_cents: Some(1500),
        currency: "USD".into(),
        status: ItemStatus::Available,
    })?;

    let now = now_millis();
    let posts: Vec<(&Profile, String, i64)> = vec![
        (&me, format!("Spent the afternoon at {} trying to get some work done. Ran into {} who was picking up a latte. We ended up chatting for an hour instead of working. #coffee #family", mention(&bean), mention(&sarah)), 2 * HOUR),
        (&sarah, format!("Finally finished this month's book for {}. No spoilers, but **wow**. #books", mention(&club)), DAY + 5 * HOUR),
        (&bean, "New single-origin just landed: Ethiopian Yirgacheffe. Come try it as a pour-over this week! ☕".into(), 2 * DAY),
        (&me, format!("Early morning drive out to {}. The water was perfectly still. Took some great shots.\n\n- Sunrise at 6:52\n- Two herons\n- Zero other people #photography #nature", mention(&lake)), 3 * DAY + 3 * HOUR),
        (&dev, format!("Bouldering session with {}. New personal best on the overhang wall.", mention(&me)), 6 * DAY),
        (&me, format!("{} meetup tonight. We argued about the ending for 40 minutes. {} brought cookies. #books", mention(&club), mention(&sarah)), 9 * DAY),
        (&me, format!("Just a quiet evening at home. {} dropped off some leftover lasagna. #home", mention(&sarah)), 14 * DAY),
        (&club, "Next month's pick is *The Left Hand of Darkness*. Meeting moved to Thursday.".into(), 20 * DAY),
        (&me, format!("Kayaked the whole north shore of {} with {}. Sunburnt but happy. #nature", mention(&lake), mention(&dev)), 33 * DAY),
        (&me, "Started this journal. Let's see if I keep it up. ✍️".into(), 45 * DAY),
        (&me, format!("New year's resolution: fewer lattes at {}. Already failing. #coffee", mention(&bean)), 280 * DAY),
        (&sarah, "Happy birthday to me 🎂".into(), 330 * DAY),
    ];
    // Procedural photos for a few posts, keyed by how long ago the post was.
    let photos: Vec<(i64, Vec<(&str, Scene)>)> = vec![
        (2 * HOUR, vec![("latte.png", Scene::Coffee)]),
        (3 * DAY + 3 * HOUR, vec![("sunrise.png", Scene::Sunrise), ("still-water.png", Scene::Lake)]),
        (33 * DAY, vec![("north-shore.png", Scene::Lake), ("kayak.png", Scene::Sunset), ("dusk.png", Scene::Sunrise)]),
    ];
    for (author, content, ago) in posts {
        let mut media_ids = Vec::new();
        for (name, scene) in photos.iter().filter(|(a, _)| *a == ago).flat_map(|(_, p)| p) {
            media_ids.push(ws.stage_media(name, png(480, 320, |x, y| scene.pixel(x, y)))?.id);
        }
        // Facebook-style extras on a few posts: feeling, tagged people, check-in.
        let feeling = |emoji: &str, text: &str| Some(Feeling { emoji: emoji.into(), text: text.into() });
        let (feeling, with_ids, place_id) = match ago {
            a if a == 2 * HOUR => (feeling("😊", "feeling happy"), vec![sarah.id.clone()], Some(bean.id.clone())),
            a if a == 3 * DAY + 3 * HOUR => (feeling("😌", "feeling relaxed"), vec![], Some(lake.id.clone())),
            a if a == 33 * DAY => (feeling("💪", "feeling motivated"), vec![dev.id.clone()], Some(lake.id.clone())),
            a if a == 9 * DAY => (None, vec![sarah.id.clone()], Some(club.id.clone())),
            _ => (None, vec![], None),
        };
        ws.save_post(PostInput {
            author_id: author.id.clone(),
            content,
            occurred_at: Some(now - ago),
            media_ids,
            feeling,
            with_ids,
            place_id,
            ..Default::default()
        })?;
    }

    // Life events.
    for (event_type, title, ago, body) in [
        ("home.moved_to_a_new_city", "Moved to Minneapolis", 300 * DAY, "New city, new lakes."),
        ("career.started_a_new_job", "Started a new job as Senior Engineer at Northwind", 200 * DAY, ""),
        ("relationship.queerplatonic_partnership", "Became queerplatonic partners with Robin Okafor", 120 * DAY, "No rings, just a shared sourdough starter."),
        ("travel.visited@jp", "Visited Japan", 60 * DAY, "Two weeks, four cities, too many konbini snacks."),
        ("fitness.took_up@kayaking", "Took up kayaking", 33 * DAY + HOUR, "Paddled the whole north shore. About 14 km. Sore arms, very happy."),
    ] {
        ws.save_post(PostInput {
            kind: PostKind::Milestone,
            event_type: event_type.into(),
            title: title.into(),
            author_id: me_id.clone(),
            content: body.into(),
            occurred_at: Some(now - ago),
            ..Default::default()
        })?;
    }

    // Several activities at once: a role, an occasion and an outfit.
    let act = |emoji: &str, verb: &str, object: &str, thing: &str| Activity {
        emoji: emoji.into(),
        verb: verb.into(),
        object: object.into(),
        thing: thing.into(),
    };
    ws.save_post(PostInput {
        author_id: sarah.id.clone(),
        content: "Night shift swapped for the ward Christmas party. First time in a saree at work!".into(),
        feeling: Some(Feeling { emoji: "🥳".into(), text: "feeling festive".into() }),
        activities: vec![
            act("💼", "working as", "a nurse", "role:nurse"),
            act("🎄", "attending", "an office Christmas party", "occasion:office_christmas_party"),
            act("🥻", "wearing", "a saree", "clothing:saree"),
        ],
        occurred_at: Some(now - 20 * DAY),
        ..Default::default()
    })?;

    // Two life events in one post.
    ws.save_post(PostInput {
        kind: PostKind::Milestone,
        event_type: "education.graduated_from_university".into(),
        also_event_types: vec!["roles.intern_software_engineer_got_a_full_time_offer".into()],
        title: "Graduated from the University of Minnesota and got a full-time offer".into(),
        author_id: me_id.clone(),
        content: "Same week. Still can't believe it.".into(),
        occurred_at: Some(now - 400 * DAY),
        ..Default::default()
    })?;

    // Relationships, as Facebook's "Family and relationships".
    let relate = |to: &Profile, kind: &str, since: &str| RelationInput {
        id: None,
        to_id: to.id.clone(),
        kind: kind.into(),
        label: String::new(),
        inverse_label: String::new(),
        since: since.into(),
    };
    ws.save_relation(&me_id, relate(&sarah, "sibling", ""))?;
    ws.save_relation(&me_id, relate(&dev, "best_friend", "2015"))?;
    ws.save_relation(&me_id, relate(&robin, "queerplatonic_partner", "2025"))?;
    ws.save_relation(&me_id, relate(&bean, "favourite", "2024"))?;
    ws.save_relation(&me_id, relate(&lake, "favourite", ""))?;
    ws.save_relation(&sarah.id, relate(&club, "club", "2023"))?;

    // Profile pictures and covers.
    let photo = |ws: &mut Workspace, scene: Scene| -> Result<String, Box<dyn std::error::Error>> {
        Ok(ws.stage_media("photo.png", png(480, 320, |x, y| scene.pixel(x, y)))?.id)
    };
    for (profile, avatar, cover) in [(&me_id, Scene::Sunrise, Scene::Lake), (&bean.id, Scene::Coffee, Scene::Coffee), (&lake.id, Scene::Lake, Scene::Sunset)] {
        let id = photo(ws, avatar)?;
        ws.set_profile_photo(profile, PhotoSlot::Avatar, Some(id))?;
        let id = photo(ws, cover)?;
        ws.set_profile_photo(profile, PhotoSlot::Cover, Some(id))?;
    }
    ws.set_cover_position(&me_id, 40)?;

    // An album with captions, and an article with a cover image.
    let shots = [
        ("dock.png", Scene::Sunrise, "First light from the dock"),
        ("calm.png", Scene::Lake, "Not a ripple"),
        ("thermos.png", Scene::Coffee, "Thermos coffee, essential equipment"),
        ("evening.png", Scene::Sunset, "Paddling back at dusk"),
        ("last.png", Scene::Lake, "One more lap"),
    ];
    let mut ids = Vec::new();
    let mut captions = std::collections::HashMap::new();
    for (name, scene, caption) in shots {
        let id = ws.stage_media(name, png(480, 320, |x, y| scene.pixel(x, y)))?.id;
        captions.insert(id.clone(), caption.to_string());
        ids.push(id);
    }
    let album = ws.save_post(PostInput {
        id: None,
        kind: PostKind::Album,
        title: "Weekend at Lake Minnetonka".into(),
        captions,
        author_id: me_id.clone(),
        content: format!("Two days of paddling with {}. #nature", mention(&dev)),
        occurred_at: Some(now - 5 * DAY),
        with_ids: vec![dev.id.clone()],
        place_id: Some(lake.id.clone()),
        media_ids: ids,
            ..Default::default()
        })?;

    let first = album.media[0].id.clone();
    ws.set_photo_tags(&album.id, &first, vec![PhotoTag { profile_id: dev.id.clone(), x: 0.45, y: 0.55 }])?;

    let cover = ws.stage_media("cover.png", png(480, 320, |x, y| Scene::Sunset.pixel(x, y)))?.id;
    ws.save_post(PostInput {
        id: None,
        kind: PostKind::Article,
        title: "What six weeks of journaling taught me".into(),
        captions: Default::default(),
        author_id: me_id,
        content: [
            "I started this journal on a whim. Six weeks later, a few things stand out.",
            "## Small moments add up",
            &format!("Coffee with {} doesn't feel like an event, but reading back, those afternoons are the best part.", mention(&sarah)),
            "## Writing it down changes what I notice",
            "- I look for things worth writing about",
            "- I remember conversations better",
            "- [x] Write at least three times a week",
            "- [ ] Add more photos",
            "> The days are long but the years are short.",
            "## Next",
            "More kayaking. Fewer lattes. #reflection",
        ]
        .join("\n\n"),
        occurred_at: Some(now - 6 * HOUR),
        media_ids: vec![cover],
            ..Default::default()
        })?;
    Ok(())
}

#[derive(Clone, Copy)]
enum Scene {
    Sunrise,
    Sunset,
    Lake,
    Coffee,
}

impl Scene {
    fn pixel(self, x: u32, y: u32) -> [u8; 3] {
        let (fx, fy) = (x as f32 / 480.0, y as f32 / 320.0);
        let mix = |a: [f32; 3], b: [f32; 3], t: f32| [0, 1, 2].map(|i| (a[i] + (b[i] - a[i]) * t.clamp(0.0, 1.0)) as u8);
        let near = |cx: f32, cy: f32, r: f32| ((fx - cx) * 1.5).powi(2) + (fy - cy).powi(2) < r * r;
        match self {
            Scene::Sunrise | Scene::Sunset => {
                let (top, horizon) = if matches!(self, Scene::Sunrise) {
                    ([255.0, 183.0, 94.0], [255.0, 111.0, 97.0])
                } else {
                    ([88.0, 56.0, 140.0], [247.0, 120.0, 72.0])
                };
                if fy > 0.62 {
                    let ripple = ((fx * 60.0 + fy * 25.0).sin() * 0.08) + (fy - 0.62) * 1.6;
                    mix([40.0, 70.0, 120.0], [15.0, 30.0, 60.0], ripple)
                } else if near(0.5, 0.58, 0.14) {
                    [255, 236, 179]
                } else {
                    mix(top, horizon, fy / 0.62)
                }
            }
            Scene::Lake => {
                if fy < 0.45 {
                    mix([150.0, 200.0, 240.0], [210.0, 235.0, 250.0], fy / 0.45)
                } else if fy < 0.55 && (fx * 9.0).sin() * 0.04 + 0.5 > fy - 0.0 {
                    [46, 90, 60]
                } else {
                    mix([90.0, 160.0, 200.0], [30.0, 80.0, 120.0], (fy - 0.45) * 1.8)
                }
            }
            Scene::Coffee => {
                if near(0.5, 0.5, 0.36) && !near(0.5, 0.5, 0.3) {
                    [245, 240, 232]
                } else if near(0.5, 0.5, 0.3) {
                    let foam = near(0.5, 0.5, 0.12) || ((fx - 0.5).abs() < 0.02 && (fy - 0.5).abs() < 0.22);
                    if foam { [236, 214, 180] } else { mix([150.0, 95.0, 55.0], [110.0, 65.0, 35.0], fy) }
                } else {
                    mix([120.0, 84.0, 60.0], [70.0, 46.0, 32.0], fx * 0.5 + fy * 0.5)
                }
            }
        }
    }
}

/// Minimal PNG encoder (RGB, stored deflate blocks) so the seed needs no image crates.
fn png(width: u32, height: u32, pixel: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
    fn crc32(data: &[u8]) -> u32 {
        let mut c = 0xFFFF_FFFFu32;
        for &b in data {
            c ^= b as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
        !c
    }
    fn chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
        out.extend((data.len() as u32).to_be_bytes());
        let body = [&kind[..], data].concat();
        out.extend(&body);
        out.extend(crc32(&body).to_be_bytes());
    }

    let mut raw = Vec::with_capacity(((width * 3 + 1) * height) as usize);
    for y in 0..height {
        raw.push(0); // no filter
        for x in 0..width {
            raw.extend(pixel(x, y));
        }
    }
    let mut zlib = vec![0x78, 0x01];
    let blocks: Vec<&[u8]> = raw.chunks(65_535).collect();
    for (i, block) in blocks.iter().enumerate() {
        zlib.push(u8::from(i == blocks.len() - 1));
        let len = block.len() as u16;
        zlib.extend(len.to_le_bytes());
        zlib.extend((!len).to_le_bytes());
        zlib.extend(*block);
    }
    let (mut a, mut b) = (1u32, 0u32);
    for &x in &raw {
        a = (a + x as u32) % 65_521;
        b = (b + a) % 65_521;
    }
    zlib.extend(((b << 16) | a).to_be_bytes());

    let mut ihdr = Vec::new();
    ihdr.extend(width.to_be_bytes());
    ihdr.extend(height.to_be_bytes());
    ihdr.extend([8, 2, 0, 0, 0]); // 8-bit RGB
    let mut out = b"\x89PNG\r\n\x1a\n".to_vec();
    chunk(&mut out, b"IHDR", &ihdr);
    chunk(&mut out, b"IDAT", &zlib);
    chunk(&mut out, b"IEND", &[]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_valid_pngs() {
        let dir = std::env::var_os("SEED_PNG_DIR").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
        for (name, scene) in [("sunrise", Scene::Sunrise), ("sunset", Scene::Sunset), ("lake", Scene::Lake), ("coffee", Scene::Coffee)] {
            let bytes = png(480, 320, |x, y| scene.pixel(x, y));
            assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
            fs::write(dir.join(format!("seed-{name}.png")), bytes).unwrap();
        }
    }
}
