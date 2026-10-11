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
        ..profile(ProfileKind::Me, &me.name, "teal")
    })?;

    let sarah = ws.save_profile(ProfileInput {
        relationship: "Sister".into(),
        tagline: "Usually found reading.".into(),
        bio: "Usually found reading or complaining about the weather.".into(),
        location: "St. Paul".into(),
        ..profile(ProfileKind::Person, "Sarah Jenkins", "pink")
    })?;
    let dev = ws.save_profile(ProfileInput {
        relationship: "Best friend".into(),
        bio: "Climbing partner. Owes me $20.".into(),
        ..profile(ProfileKind::Person, "Dev Patel", "indigo")
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
    for (author, content, ago) in posts {
        ws.save_post(PostInput { id: None, author_id: author.id.clone(), content, occurred_at: Some(now - ago) })?;
    }
    Ok(())
}
