// Life-event templates: thousands of them, from a baby's first smile to a
// 100th birthday. Each belongs to a category and a sub-group, suits one or
// more life stages, and has a title template with placeholders:
//
//   {person}            a person — pick a profile (tags them) or type a name
//   {place} {school} {org} {company} {team}
//                       a place or organisation — pick a profile (checks in) or type
//   {n}                 a number
//   {anything[:hint]}   free text, e.g. {what:book title}
//
// The id (`category.slug`) is stored in posts, so never rename a label without
// keeping its id: add the old id to ALIASES instead.

import { EVERYDAY, LOVE_SPICY, MORE_ROLES, PARENT_CHILD, ROLES, STYLE, WORK_HARD, WORK_SPICY } from "./lifeEventRoles";

export type Stage = "baby" | "child" | "teen" | "young" | "adult" | "midlife" | "elder";

export const STAGES: { id: Stage; label: string; ages: string }[] = [
  { id: "baby", label: "Baby & toddler", ages: "0–3" },
  { id: "child", label: "Child", ages: "4–12" },
  { id: "teen", label: "Teen", ages: "13–19" },
  { id: "young", label: "Young adult", ages: "20–29" },
  { id: "adult", label: "Adult", ages: "30–49" },
  { id: "midlife", label: "Midlife", ages: "50–64" },
  { id: "elder", label: "Later life", ages: "65+" },
];

const ALL_STAGES = STAGES.map((s) => s.id);
const CODES: Record<string, Stage> = { b: "baby", c: "child", t: "teen", y: "young", a: "adult", m: "midlife", e: "elder" };

export interface LifeEventCategory {
  id: string;
  emoji: string;
  label: string;
}

export interface LifeEventTemplate {
  id: string;
  category: string;
  group: string;
  emoji: string;
  label: string;
  /** Title template with {placeholders}; equal to `label` when there are none. */
  title: string;
  stages: Stage[];
  /** Spicy (naughty, romantic) or hard (painful) moments; filterable in the picker. */
  tone?: Tone;
}

export type Tone = "spicy" | "hard";
export const TONES: { id: Tone; label: string }[] = [
  { id: "spicy", label: "🌶️ Spicy & naughty" },
  { id: "hard", label: "💔 Hard times" },
];

export const CATEGORIES: LifeEventCategory[] = [
  { id: "family", emoji: "👪", label: "Family & parenting" },
  { id: "baby", emoji: "👶", label: "Baby & toddler" },
  { id: "childhood", emoji: "🧒", label: "Childhood" },
  { id: "teen", emoji: "🧑‍🎤", label: "Teen & coming of age" },
  { id: "roles", emoji: "🧑‍💼", label: "Roles & careers" },
  { id: "education", emoji: "🎓", label: "Education" },
  { id: "career", emoji: "💼", label: "Work & career" },
  { id: "relationship", emoji: "💞", label: "Love & relationships" },
  { id: "wedding", emoji: "💍", label: "Weddings & ceremonies" },
  { id: "womens", emoji: "🌸", label: "Women's & reproductive health" },
  { id: "identity", emoji: "🏳️‍🌈", label: "Gender & identity" },
  { id: "style", emoji: "👗", label: "Style & clothing" },
  { id: "home", emoji: "🏠", label: "Home & living" },
  { id: "travel", emoji: "✈️", label: "Travel & places" },
  { id: "health", emoji: "❤️‍🩹", label: "Health & wellness" },
  { id: "fitness", emoji: "🏃", label: "Sports & fitness" },
  { id: "hobbies", emoji: "🎨", label: "Hobbies & creativity" },
  { id: "learning", emoji: "🗣️", label: "Languages & skills" },
  { id: "faith", emoji: "🙏", label: "Faith & culture" },
  { id: "civic", emoji: "🗳️", label: "Civic & community" },
  { id: "money", emoji: "💰", label: "Money & milestones" },
  { id: "pets", emoji: "🐾", label: "Pets & animals" },
  { id: "everyday", emoji: "☕", label: "Everyday moments" },
  { id: "birthday", emoji: "🎂", label: "Birthdays & anniversaries" },
  { id: "aging", emoji: "🧓", label: "Later life" },
  { id: "achievement", emoji: "🏆", label: "Achievements" },
  { id: "remembrance", emoji: "🕊️", label: "Loss & remembrance" },
  { id: "other", emoji: "⭐", label: "Other" },
];

// ── Handwritten templates ────────────────────────────────────────────────────
// `@category`, `# Group`, then `emoji Label | title template | stage codes`.
// Title and stages are optional; codes are b c t y a m e (all when omitted).

const DATA = String.raw`
@family
# New arrivals
👶 Welcomed a baby | Welcomed {person} into the world | yame
👶 Became a parent | Became a parent to {person} | yame
👶 Became a parent for the second time | Welcomed {person}, our second | yam
👯 Welcomed twins | Welcomed twins {person} | yam
👶 Became a single parent by choice | | yam
🏡 Adopted a child | Adopted {person} | yame
🏡 Adoption finalised | {person}'s adoption was finalised | yame
🤲 Became a foster parent | | yame
🤲 Welcomed a foster child | Welcomed {person} into our foster home | yame
🧸 Became a guardian | Became {person}'s guardian | yame
🤰 Welcomed a baby through surrogacy | Welcomed {person} through surrogacy | yam
🧬 Welcomed a baby through IVF | Welcomed {person}, our IVF baby | yam
🧬 Welcomed a donor-conceived baby | Welcomed {person} | yam
🫶 Became a step-parent | Became {person}'s step-parent | yame
🫶 Became a co-parent | Started co-parenting with {person} | yam
👵 Became a grandparent | Became a grandparent to {person} | me
👵 Became a great-grandparent | Became a great-grandparent to {person} | e
🧑‍🍼 Became an aunt, uncle or auntie | Became an auntie/uncle to {person} | tyame
🧑‍🍼 Became a godparent | Became {person}'s godparent | tyame
👧 Became a big sibling | Became a big sibling to {person} | bct
🌈 Welcomed a rainbow baby | Welcomed our rainbow baby {person} | yam
# Parenting milestones
🍼 First night home with the baby | | yam
😴 Baby slept through the night | | yam
🤱 Started parental leave | | yam
🔙 Returned to work after parental leave | | yam
🏫 First day of daycare | {person}'s first day of daycare | yam
🏫 Child's first day of school | {person}'s first day of school | yam
🎒 Child started high school | {person} started high school | am
🚗 Child got their driver's licence | {person} passed their driving test | am
🎓 Child graduated | {person} graduated from {school} | ame
🧳 Child left home | {person} moved out | ame
💍 Child got married | {person} married {partner} | me
🪺 Became an empty nester | | me
🏡 Child moved back home | {person} moved back home | me
🗣️ Had the talk | | am
👨‍👩‍👧 Became a stay-at-home parent | | yam
🏠 Started homeschooling | Started homeschooling {person} | yam
🎉 Hosted a child's birthday party | Threw {person}'s birthday party | yam
# Family life
👪 Family reunion | Family reunion at {place} |
🌳 Traced our family tree | Traced our family tree back to {what:ancestor or year} | yame
🧬 Did a DNA test | | tyame
🧬 Found a biological relative | Found my biological {relation}, {person} | tyame
🫂 Met a birth parent | Met my birth parent {person} | tyame
🤝 Reconciled with a family member | Reconciled with {person} | tyame
🚪 Went no-contact with a family member | | yame
🏠 Moved in with family | Moved in with {person} |
🏠 Became a caregiver for a parent | Became {person}'s caregiver | yame
🏠 Parent moved in with us | {person} moved in with us | ame
👩‍❤️‍👨 Parents' anniversary | My parents celebrated {n} years together |
💔 Parents separated | | bcty
💔 Parents divorced | | bctya
💒 Parent remarried | {person} remarried | bctya
👨‍👩‍👦 Got a step-sibling | Got a new step-sibling, {person} | bcty
🏡 Family moved house | We moved to {place} | bct
🫂 Chosen family | Found my chosen family | tyame
🍲 Hosted the family holiday dinner | | yame
📸 Family photo shoot | |
⚖️ Became a legal guardian of a sibling | Became {person}'s legal guardian | yam
🎗️ Became a carer for my child | | yam

@baby
# Firsts
😊 First smile | {person}'s first smile | b
😂 First laugh | {person}'s first laugh | b
🤲 Held head up | | b
🔄 Rolled over | {person} rolled over for the first time | b
🪑 Sat up unaided | | b
🐛 Started crawling | {person} started crawling | b
🧍 Pulled up to stand | | b
🚶 First steps | {person} took their first steps | b
🗣️ First word | {person}'s first word: "{word}" | b
🗣️ Said "mama" or "dada" | | b
🦷 First tooth | {person}'s first tooth | b
✂️ First haircut | {person}'s first haircut | b
🥄 First solid food | {person}'s first taste of {food} | b
🍚 First rice feeding | {person}'s first rice feeding | b
🥤 First drink from a cup | | b
👏 First clap | | b
👋 First wave | | b
💤 First night in own room | | b
🛁 First bath | | b
🌊 First swim | | b
🏖️ First time at the beach | | b
❄️ First snow | | bc
✈️ First flight | {person}'s first flight | bct
🎄 First holiday season | {person}'s first {holiday} | b
🎃 First Halloween | | b
🎡 First outing | | b
🏥 First vaccinations | | b
🤒 First illness | | b
🧸 First favourite toy | | b
📚 First book read together | | b
🚽 Potty trained | {person} is potty trained | b
🛏️ Moved to a big-kid bed | | b
🍼 Weaned | | b
👟 First shoes | | b
🧩 First puzzle | | bc
🖍️ First drawing | | bc
🎶 First song | | bc
🔤 Said the alphabet | | bc
🔢 Counted to ten | | bc
🎨 First art project | | bc
🏫 Started nursery or preschool | {person} started at {school} | b
👶 Met the grandparents | {person} met {grandparent} | b
💡 Named | We named them {name} | b
📜 Got a birth certificate | | b
🛂 Got a first passport | | bc
# Celebrations
🌕 Full-moon celebration (one month) | | b
🥛 Kiri bath for the baby | | b
💯 100-day celebration (Baek-il) | | b
🎂 First birthday | {person}'s first birthday | b
🎎 Dol (Korean first birthday) | | b
🍡 Okuizome (100-day ceremony) | | b
🕯️ Naming ceremony | {person}'s naming ceremony | b
🍯 Annaprasana | | b
✂️ Mundan (first haircut ceremony) | | b
💍 Ear-piercing ceremony | | bc
🧺 Aqiqah | | b
🙏 Baby blessing | {person} was blessed at {place} | b
🛁 Baptism / christening | {person} was baptised at {place} | bc
✡️ Brit milah | | b
✡️ Simchat bat | | b
🎉 Baby's welcome party | | b

@childhood
# Growing up
🔤 Learned to read | | c
✍️ Wrote own name | | bc
🔤 Akuru kiyaweema (first letters) | | bc
🚲 Learned to ride a bike | | c
🛴 Learned to ride a scooter | | c
🏊 Learned to swim | | c
⛸️ Learned to skate | | ct
🧦 Tied shoelaces | | c
⏰ Learned to tell time | | c
🦷 Lost first tooth | {person} lost their first tooth | c
🧚 Tooth fairy visit | | c
🎒 First day of school | First day at {school} | bc
🎒 First day of primary school | | c
🍱 First packed lunch | | c
🌙 First sleepover | | ct
🏕️ First camping trip | | cty
🎪 First circus | | c
🎬 First movie in a cinema | | c
🎟️ First concert | | cty
🏟️ First sports game | | ct
🎢 First roller coaster | | ct
🎠 First theme park | | c
🎭 First school play | Played {role} in the school play | ct
🏅 First trophy | | ct
⭐ First gold star | | c
🧒 Made a best friend | Became best friends with {person} | ct
🏠 First time home alone | | ct
💸 First pocket money | | c
🐷 First piggy bank | | c
📱 First phone | | ct
💻 First computer | | ct
🎮 First video game | | ct
📖 Finished first chapter book | | c
📚 Got a library card | | c
🏕️ Summer camp | Went to {what:camp} | ct
🥇 Won a school prize | Won the {what:prize} | ct
🧑‍🏫 Class representative | | ct
🎖️ Joined the scouts or guides | | ct
🎖️ Joined the cadets | | ct
🩰 First dance recital | | ct
🎹 First music recital | | ct
🌱 Planted a first garden | | c
🔬 First science fair | | ct
🏆 Grade 5 scholarship exam | Sat the Grade 5 scholarship exam | c
🏆 Passed the Grade 5 scholarship exam | | c
🧒 Shichi-Go-San | | bc
🎏 Children's Day celebration | | c
🧑‍⚕️ Got glasses | | cty
🦷 Got braces | | cty
🦷 Braces off | | cty
🩹 First broken bone | | ct
🏥 First hospital stay | | ct
🧠 Diagnosed with ADHD as a child | | ct
🧩 Diagnosed autistic as a child | | ct
📝 First report card | | c
📝 Skipped a grade | | ct
🔁 Moved schools | Moved to {school} | ct

@teen
# Coming of age
🧑 Became a teenager | | t
✡️ Bar mitzvah | | t
✡️ Bat mitzvah | | t
✡️ B'nai mitzvah | | t
✡️ B-mitzvah (gender-neutral) | | t
👗 Quinceañera | | t
🎂 Sweet sixteen | | t
💃 Debut (18th birthday, Philippines) | | t
👘 Seijin no Hi (Coming of Age Day) | | ty
🌺 Coming-of-age ceremony | | t
🌸 Age-attainment ceremony | | t
🪔 Ritu Kala Samskara | | t
🧵 Upanayanam (sacred thread) | | ct
🕌 First fast during Ramadan | | ct
🪖 Dastar Bandi (first turban) | | ct
✝️ Confirmation | Confirmed at {place} | ct
🍞 First Holy Communion | | c
🗣️ Started puberty | | ct
🪒 First shave | | t
🧴 First skincare routine | | ct
💄 First makeup | | t
👂 Got ears pierced | | ct
💇 Changed my look | | tyame
🎨 Dyed my hair for the first time | | tyame
🖋️ First tattoo | | tyame
💎 First piercing | | tyame
# Independence
💼 First job | Started working at {company} | ty
💵 First paycheque | | ty
🏦 Opened a bank account | | cty
💳 First debit or credit card | | ty
🚗 Learner's permit | | ty
🚗 Passed driving test | | tyame
🚗 First car | Bought my first car, a {what:car} | tyam
🏍️ Got a motorcycle licence | | tyam
🛂 First passport | | ctya
✈️ First solo trip | Travelled alone to {place} | tyame
🏠 First time living away from home | | ty
🗳️ Old enough to vote | | ty
🗳️ First vote | Voted for the first time | tyame
🪪 Got an ID card | | ty
🎓 Turned 18 | | ty
🍻 Turned 21 | | y
🧑‍🎤 First festival | Went to {what:festival} | tyam
🎟️ First gig | Saw {what:artist} live | tyame
# Teen life
💌 First crush | | ct
💋 First kiss | | tyame
💃 First school dance | | t
🎓 Prom | Went to prom with {person} | t
🎓 Formal / ball | | t
🧑‍🤝‍🧑 First relationship | Started dating {person} | tya
💔 First break-up | | tya
🫂 Found my people | | tya
🧑‍🏫 Became a prefect | | t
👑 Became head student | | t
🏅 School captain | | t
⚽ Made the school team | Made the {team} team | ct
🎭 Lead role in a school production | | t
🗞️ School newspaper editor | | t
🧪 Science olympiad | | ct
🌍 Exchange student | Exchange student in {place} | ty
🧑‍💻 Built my first app or website | | cty
📹 Started a YouTube channel | | ctya
🎙️ Started a podcast | | tyame
🛹 Learned a trick | Landed my first {what:trick} | ct
🏕️ Duke of Edinburgh / Gold Award | | ty
🧳 Gap year | Started a gap year in {place} | ty

@education
# School
🏫 Started kindergarten | | b
🎒 Started primary school | Started at {school} | c
🏫 Started middle school | | ct
🏫 Started secondary school | Started at {school} | ct
🏫 Started high school | Started at {school} | t
🎓 Finished primary school | | c
🎓 Graduated from middle school | | ct
🎓 Graduated from high school | Graduated from {school} | ty
🎓 Finished A/Levels | | t
🎓 Finished O/Levels | | t
🏫 Changed schools | Moved to {school} | ct
🏠 Started homeschooling | | ct
🏫 Started boarding school | Started at {school} | ct
📚 Started tuition classes | | ct
🏆 Received a scholarship | Awarded the {what:scholarship} | ctyam
🎓 Valedictorian | | t
🏅 Dean's list | | ty
🏅 Honour roll | | ct
🧑‍🎓 Got into a university | Got into {school} | ty
📩 Received a university offer | Offer from {school} | ty
🎉 Results day | | ty
😓 Retook an exam | Retook {what:exam} | tyam
📚 Started a foundation year | | ty
# University
🧑‍🎓 Started university | Started at {school} | tyam
🏛️ Moved into halls | | ty
🧪 Declared a major | Declared a major in {subject} | ty
🔄 Changed major | Switched to {subject} | ty
🌏 Study abroad | Studied abroad at {school} | ty
🧑‍🔬 Research internship | | tya
📄 Published first paper | Published "{what:paper title}" | yam
📝 Submitted my dissertation | | yam
📝 Submitted my thesis | | yam
🎤 Defended my thesis | | yam
🎓 Graduated from university | Graduated from {school} | yame
🎓 Graduation ceremony | | tyame
🎓 Graduated with honours | | yam
🎓 Graduated with first-class honours | | yam
🎓 Graduated summa cum laude | | yam
🎓 Graduated top of class | | tyam
🧑‍🏫 Became a teaching assistant | | yam
🏛️ Joined a fraternity or sorority | | ty
🧑‍🤝‍🧑 Joined a student society | Joined {org} | ty
🗳️ Elected to student council | | ty
🏆 Won a hackathon | Won {what:hackathon} | tyam
🎓 Dropped out | | tyam
🎓 Went back to school | Went back to study {subject} | yame
🎓 Graduated as a mature student | | ame
🎓 Lifelong-learning course | Completed a course in {subject} | yame
🖥️ Finished an online course | Completed {what:course} | tyame
🧑‍🏫 Took a sabbatical to study | | ame
🧑‍🎓 Got a student loan | | ty
💸 Paid off student loans | | yam
🎓 Honorary degree | Received an honorary degree from {school} | ame
📜 Got a professional licence | Licensed as a {what:profession} | yame
🧑‍⚕️ Started residency | Started residency at {place} | yam
🧑‍⚕️ Matched for residency | | ya
🧑‍⚖️ Called to the bar | | yam
🎖️ Fellowship | Awarded a fellowship at {org} | yam
🏅 Became a Rhodes, Fulbright or Chevening scholar | | yam
# Apprenticeships & training
🔧 Started an apprenticeship | Started an apprenticeship at {company} | tyam
🔧 Finished an apprenticeship | | tyam
🧑‍🍳 Graduated from culinary school | | yam
💻 Finished a coding bootcamp | | yam
🛠️ Finished trade school | | yam
🪖 Finished basic training | | ty
✈️ Earned a pilot's licence | | tyame
🤿 Got scuba certified | | tyame
🧑‍🚒 Finished first-aid training | | tyame

@career
# Jobs
💼 Started a new job | Started a new job as {role} at {company} | tyame
💼 First day at work | First day at {company} | tyame
🤝 Accepted a job offer | Accepted an offer from {company} | tyame
📈 Got promoted | Promoted to {role} at {company} | yame
🧑‍💼 Became a manager | | yame
🧑‍💼 Became a team lead | | yame
👔 Became a director | | ame
👑 Became CEO | Became CEO of {company} | ame
🏢 Joined the board | Joined the board of {org} | ame
🔄 Changed careers | Changed careers to {what:new field} | yame
🌍 Relocated for work | Relocated to {place} for work | yame
🏡 Started working remotely | | yame
🏢 Returned to the office | | yame
🕐 Went part-time | | yame
🧑‍💻 Started freelancing | | yame
🧳 Started a side hustle | | tyame
💬 Got a raise | | yame
🏅 Employee of the month | | tyame
🏆 Won an industry award | Won {what:award} | yame
🎤 Spoke at a conference | Spoke at {what:conference} | yame
📰 Featured in the press | Featured in {what:publication} | yame
✈️ First business trip | Business trip to {place} | yame
🧾 Signed a big client | Signed {org} | yame
🚀 Launched a product | Launched {what:product} | yame
📦 Shipped a major project | Shipped {what:project} | yame
🧑‍🏫 Started mentoring | Started mentoring {person} | yame
🧑‍🎓 Hired my first employee | Hired {person} | yame
🏖️ Took a sabbatical | | yame
🤰 Started maternity leave | | yam
👶 Started paternity leave | | yam
🍼 Started parental leave | | yam
🔙 Returned to work after a break | | yame
🤒 Took medical leave | | yame
📉 Was laid off | Laid off from {company} | yame
🚪 Resigned | Resigned from {company} | tyame
🚪 Left a job | Left {company} after {n} years | yame
🔍 Started job hunting | | tyame
✅ Passed probation | | tyame
🏛️ Joined a union | | yame
✊ Went on strike | | yame
🧑‍⚖️ Won a workplace case | | yame
🧑‍⚕️ Became a consultant | | ame
🧑‍🏫 Became a professor | Became a professor at {school} | ame
🧑‍🏫 Got tenure | | ame
🪖 Enlisted in the military | Enlisted in {org} | tyam
🎖️ Military promotion | Promoted to {rank} | tyame
🎖️ Deployed | Deployed to {place} | yam
🏠 Returned from deployment | | yam
🎖️ Left the military | | yame
🎖️ Became a veteran | | yame
🌐 Got a work visa | | yame
🕊️ Retired | Retired from {company} after {n} years | me
🎉 Retirement party | | me
🧑‍💼 Came out of retirement | | me
# Business
🚀 Started a business | Founded {company} | tyame
🏪 Opened a shop | Opened {place} | tyame
🍽️ Opened a restaurant | Opened {place} | yame
🧾 Registered a company | Registered {company} | yame
💵 First sale | First sale at {company} | tyame
💰 Raised funding | Raised {what:amount} for {company} | yame
🤝 Took on a business partner | Went into business with {person} | yame
📈 Business turned profitable | | yame
🏢 Opened a new office | Opened an office in {place} | yame
👥 Hit a team milestone | {company} reached {n} people | yame
🏆 Business award | {company} won {what:award} | yame
💼 Sold a business | Sold {company} | ame
🏁 Closed a business | Closed {company} | yame
🧑‍🌾 Started a farm | | yame
🛍️ Opened an online store | | tyame
📕 Published a book | Published "{what:book title}" | tyame
🎵 Released an album | Released "{what:album title}" | tyame
🖼️ First exhibition | Exhibited at {place} | tyame
🎬 Premiered a film | Premiered "{what:film title}" | yame
🧑‍💻 Released an app | Released {what:app} | tyame
📺 First TV appearance | | tyame
🎙️ Launched a podcast | | tyame

@relationship
# Dating
💘 Met someone special | Met {person} | tyame
☕ First date | First date with {person} at {place} | tyame
📱 Matched on a dating app | Matched with {person} | yame
💬 First "I love you" | | tyame
🤝 Became official | Started dating {person} | tyame
🫶 Became exclusive | | tyame
👨‍👩‍👧 Met the parents | Met {person}'s family | tyame
🏠 Moved in together | Moved in with {person} | tyame
🔑 Swapped keys | | tyame
✈️ First trip together | First trip with {person} to {place} | tyame
🐾 Got a pet together | | yame
🌍 Started long distance | | tyame
🛬 Ended long distance | | tyame
💞 Anniversary | {n} years with {person} | tyame
💍 Got engaged | Got engaged to {person} | yame
💍 Proposed | Proposed to {person} | yame
💍 Said yes | Said yes to {person} | yame
💒 Got married | Married {person} | yame
🤝 Entered a civil partnership | Civil partnership with {person} | yame
📝 Registered a domestic partnership | Domestic partnership with {person} | yame
🔁 Renewed vows | Renewed our vows | ame
💞 Second marriage | Married {person} | ame
👵 Fell in love later in life | Fell in love with {person} | me
# Modern relationships
🌈 Started an open relationship | | yame
💜 Started a polyamorous relationship | | yame
💜 New partner | Started seeing {person} | yame
🫂 Met a metamour | Met {person}, my partner's partner | yame
🏡 Started nesting with a partner | Became nesting partners with {person} | yame
🤍 Queerplatonic partnership | Became queerplatonic partners with {person} | tyame
🤝 Committed friendship | Committed to a life partnership with {person} | yame
🏠 Living apart together | | yame
💞 Long-term relationship without marriage | | yame
🌈 First same-sex relationship | | tyame
📜 Signed a cohabitation agreement | | yame
🫶 Co-parenting partnership | Started co-parenting with {person} | yam
🌟 Embraced being single | | tyame
🌿 Celebrated being asexual | | tyame
🌿 Celebrated being aromantic | | tyame
# Love & intimacy
💗 Fell in love | Fell in love with {person} | tyame
💗 Realised I was in love | | tyame
💌 Wrote a love letter | Wrote a love letter to {person} | ctyame
🌹 First Valentine's Day together | | tyame
🕯️ First romantic dinner | | tyame
🌙 First night together | | tyame
💞 First time being intimate | | tyame
💞 Lost my virginity | | tyame
💞 First intimate experience with a new partner | | tyame
🗝️ Chose to wait until marriage | | tyame
🌙 Wedding night | | yame
🗣️ Talked about boundaries and consent | | tyame
🗣️ Opened up about my needs | | tyame
🌈 Explored my sexuality | | tyame
🌈 Realised my sexual orientation | | tyame
🧪 Got tested together | | tyame
💊 Started PrEP | | tyame
🫶 Rekindled the spark | | yame
🛏️ Started a date-night ritual | | yame
🏝️ Romantic getaway | Romantic getaway to {place} | tyame
🛋️ Started couples therapy | | yame
🛋️ Started sex therapy | | yame
🩺 Overcame an intimacy challenge | | yame
🤍 Chose celibacy | | tyame
💞 Intimacy after childbirth | | yam
💞 Intimacy after illness | | yame
💞 Love in later life | | me
👵 Still holding hands after all these years | Still holding hands after {n} years | me
# Endings & new beginnings
💔 Broke up | Broke up with {person} | tyame
⏸️ Took a break | | tyame
🔁 Got back together | Got back together with {person} | tyame
🏠 Separated | Separated from {person} | yame
⚖️ Divorced | | yame
🎉 Divorce party | | yame
🤝 Amicable split | | yame
🫶 Stayed friends with an ex | | tyame
💒 Remarried | Remarried {person} | ame
🧭 Started dating again | | yame
🧡 Recovering from a breakup | | tyame
🛡️ Left an abusive relationship | | tyame
⚖️ Got a restraining order | | yame
# Friendship
🧑‍🤝‍🧑 Made a new friend | Met {person} |
👯 Became best friends | Became best friends with {person} |
🎉 Friendship anniversary | {n} years of friendship with {person} | ctyame
✈️ Friends' trip | Trip with friends to {place} | tyame
🫂 Reconnected with an old friend | Reconnected with {person} | tyame
💌 Found a pen pal | | ctyame
💔 Friendship break-up | | tyame
👥 Joined a friendship group | Joined {org} | tyame

@wedding
# Before the wedding
💍 Engagement party | | yame
💍 Engagement ceremony | | yame
📸 Pre-wedding shoot | | yame
💌 Sent the invitations | | yame
👗 Found the wedding outfit | | yame
👰 Bridal shower | | yame
🎉 Bachelor/bachelorette party | | yame
🎉 Hen do | | yame
🎉 Stag do | | yame
🌿 Mehndi | | yame
💛 Haldi | | yame
🎶 Sangeet | | yame
🪔 Roka | | yame
🍵 Tea ceremony | | yame
🐄 Lobola negotiations | | yame
📜 Marriage licence | | yame
🧑‍🍳 Wedding cake tasting | | yame
# The ceremony
💒 Wedding day | Married {person} at {place} | yame
⛪ Church wedding | | yame
🏛️ Civil ceremony | | yame
🏝️ Destination wedding | Married {person} in {place} | yame
🏃 Eloped | Eloped with {person} | yame
🪷 Poruwa ceremony | | yame
🏠 Homecoming (Sri Lankan wedding) | | yame
🔥 Hindu wedding (Saptapadi) | | yame
🕌 Nikah | | yame
🍽️ Walima | | yame
✡️ Jewish wedding (chuppah) | | yame
🪯 Anand Karaj | | yame
🧧 Chinese wedding ceremony | | yame
🧹 Jumped the broom | | yame
🪢 Handfasting | | yame
🌈 Same-sex wedding | Married {person} | yame
🧑‍⚖️ Courthouse wedding | | yame
🏡 Small backyard wedding | | yame
💒 Commitment ceremony | Commitment ceremony with {person} | yame
🏳️‍🌈 Officiated a wedding | Officiated {person}'s wedding | yame
🤵 Was best man / best person | At {person}'s wedding | tyame
👰 Was maid of honour | At {person}'s wedding | tyame
💐 Was a bridesmaid or groomsman | At {person}'s wedding | ctyame
💐 Flower child at a wedding | | bc
🌙 Honeymoon | Honeymoon in {place} | yame
🔁 Vow renewal | | ame
📝 Changed surname after marriage | | yame
📝 Kept my surname | | yame
🔗 Double-barrelled our names | | yame

@womens
# Body & puberty
🌸 First period | | ct
🌸 Celebrated a first moon | | ct
👙 First bra | | ct
🧑‍⚕️ First gynaecologist visit | | tyam
💉 HPV vaccine | | cty
💊 Started birth control | | tyam
💊 Stopped birth control | | tyam
🧷 Got an IUD | | tyam
🧷 Got an implant | | tyam
🩸 Started tracking my cycle | | tyam
🩺 First cervical screening | | yam
🩺 First mammogram | | ame
🩺 First breast self-exam | | tyame
🩺 Diagnosed with PCOS | | tyam
🩺 Diagnosed with endometriosis | | tyam
🩺 Diagnosed with adenomyosis | | yam
🩺 Diagnosed with fibroids | | yam
🩺 Diagnosed with PMDD | | tyam
🩺 Endometriosis surgery | | yam
🩺 Hysterectomy | | yame
🩺 Ovarian cyst removed | | tyam
🧘 Pelvic floor recovery | | yame
🌷 Breast reduction | | tyame
🌷 Breast reconstruction | | yame
🎗️ Breast cancer diagnosis | | yame
🎗️ Mastectomy | | yame
🎗️ Breast cancer survivor | | yame
🎗️ BRCA test | | yame
# Fertility
🧬 Started trying to conceive | | yam
🧬 Fertility tests | | yam
🧬 Froze my eggs | | yam
🧬 Froze embryos | | yam
🧬 Started IVF | | yam
💉 Started IVF injections | | yam
🧬 Egg retrieval | | yam
🧬 Embryo transfer | | yam
🧬 IUI | | yam
🧬 Egg donation | | yam
🧬 Sperm donation | | yam
🧬 Chose a donor | | yam
🤰 Became a surrogate | | yam
🤰 Found our surrogate | | yam
🏳️ Stopped fertility treatment | | yam
🌱 Decided to be child-free | | yame
# Pregnancy
🤰 Positive pregnancy test | | yam
💌 Told my partner I'm pregnant | | yam
📣 Announced the pregnancy | | yam
🖤 Heard the heartbeat | | yam
🩻 First scan | | yam
🩻 20-week scan | | yam
🩻 3D scan | | yam
🎈 Gender reveal | | yam
🎉 Baby shower | | yam
🍼 Godh bharai | | yam
🎁 Blessingway | | yam
🛏️ Set up the nursery | | yam
🤰 Felt the first kick | | yam
🤰 Third trimester | | yam
🤰 Pregnancy photo shoot | | yam
🩺 Gestational diabetes | | yam
🩺 Preeclampsia | | yam
🧳 Packed the hospital bag | | yam
🤰 Started maternity leave | | yam
🤰 Pregnant with twins | | yam
🤰 Pregnant after loss | | yam
🤰 Pregnant over 40 | | am
# Birth
👶 Gave birth | Gave birth to {person} | yam
🏥 Hospital birth | | yam
🏠 Home birth | | yam
💧 Water birth | | yam
🩺 C-section | | yam
🩺 Emergency C-section | | yam
🌟 VBAC | | yam
⏩ Fast labour | | yam
🌙 Long labour | | yam
👶 Premature birth | | yam
🏥 Baby in the NICU | {person} came home from the NICU | yam
🤱 Started breastfeeding | | yam
🤱 Breastfeeding milestone | Breastfed for {n} months | yam
🍼 Started pumping | | yam
🍼 Donated breast milk | | yam
🍼 Switched to formula | | yam
🌙 Postpartum confinement | | yam
💙 Recovered from postpartum depression | | yam
🧘 Six-week postnatal check | | yam
# Loss
🕊️ Miscarriage | | yam
🕊️ Chemical pregnancy | | yam
🕊️ Ectopic pregnancy | | yam
🕊️ Stillbirth | | yam
🕊️ Lost a baby | In loving memory of {person} | yam
🕊️ Ended a pregnancy | | tyam
🌈 Pregnancy and Infant Loss Awareness Day | | yame
# Menopause & later life
🌡️ Perimenopause began | | am
🌡️ First hot flash | | am
💊 Started HRT for menopause | | am
🌸 Last period | | am
🌸 Reached menopause | | am
🧘 Menopause clinic | | am
🦴 Bone density scan | | me
🦴 Diagnosed with osteoporosis | | me
👵 Became a crone (croning ceremony) | | me
💪 Postmenopausal strength training | | me

@identity
# Coming out
🏳️‍🌈 Came out | Came out as {identity} | tyame
🏳️‍🌈 Came out as gay | | tyame
🏳️‍🌈 Came out as lesbian | | tyame
💗 Came out as bisexual | | tyame
💖 Came out as pansexual | | tyame
🖤 Came out as asexual | | tyame
💚 Came out as aromantic | | tyame
🏳️‍🌈 Came out as queer | | tyame
🏳️‍⚧️ Came out as trans | | tyame
💛 Came out as non-binary | | tyame
💜 Came out as genderfluid | | tyame
🪶 Came out as Two-Spirit | | tyame
💜 Came out as intersex | | tyame
👪 Came out to my family | | tyame
🧑‍🤝‍🧑 Came out to my friends | | tyame
💼 Came out at work | | yame
🤝 A loved one came out to me | {person} came out to me | tyame
🎉 Coming-out anniversary | | tyame
# Transition & affirmation
✨ Started using a new name | Started going by {name} | tyame
✨ Started using new pronouns | Started using {pronouns} | tyame
📝 Legal name change | Legally changed my name to {name} | tyame
🪪 Updated my gender marker | | tyame
🪪 New passport with my gender | | tyame
🪪 Updated my birth certificate | | tyame
💊 Started HRT | | tyame
💉 Started testosterone | | tyame
💊 Started oestrogen | | tyame
💊 Started puberty blockers | | t
🎂 HRT anniversary | {n} years on HRT | tyame
🩺 Top surgery | | tyame
🩺 Bottom surgery | | yame
🩺 Facial feminisation surgery | | yame
🩺 Voice surgery | | yame
🎤 Started voice training | | tyame
💇 Gender-affirming haircut | | tyame
👗 First outfit that felt like me | | tyame
🦺 First binder | | tyame
🎉 Name day (new name celebration) | | tyame
🌅 Transition anniversary | | tyame
🧑‍⚖️ Gender recognition certificate | | yame
# Community & pride
🏳️‍🌈 First Pride | Went to {place} Pride | tyame
🏳️‍🌈 Marched in Pride | | tyame
🌈 Joined an LGBTQ+ group | Joined {org} | tyame
🏳️‍⚧️ Trans Day of Visibility | | tyame
🕯️ Trans Day of Remembrance | | tyame
💜 Intersex Awareness Day | | tyame
🏳️‍🌈 Went to my first queer bar | | yame
🎭 First drag show | | tyame
🎤 Performed in drag | | tyame
📣 Became an advocate | | tyame
# Neurodiversity & identity
🧠 Diagnosed with ADHD | | tyame
🧩 Diagnosed autistic | | tyame
🔤 Diagnosed with dyslexia | | ctyame
🧠 Late diagnosis | Diagnosed with {what:condition} as an adult | yame
🫂 Found my community | | tyame
🧬 Learned about my heritage | | tyame
🌏 Became a citizen | Became a citizen of {place} | tyame
🛂 Got dual citizenship | | tyame
🛂 Got permanent residency | Permanent residency in {place} | yame
🪪 Reclaimed my heritage name | | tyame
🤟 Learned I'm Deaf / embraced Deaf identity | | ctyame
♿ Embraced disability pride | | tyame

@home
# Moving
🏠 Moved | Moved to {place} |
🏠 Moved to a new city | Moved to {place} | tyame
🌍 Moved abroad | Moved to {place} | tyame
🏡 Bought a house | Bought a house in {place} | yame
🏢 Bought an apartment | | yame
🔑 First home | Got the keys to our first home | yame
🏠 First rented place | | ty
🏠 Got a roommate | Moved in with {person} | tyam
🏠 Lived alone for the first time | | tyame
🏗️ Built a house | | yame
🔨 Renovated | Renovated the {what:room} | yame
🍳 New kitchen | | yame
🛁 New bathroom | | yame
🌳 Started a garden | |
🌳 Planted a tree | Planted a {what:tree} |
🏡 Moved to the countryside | | yame
🏙️ Moved to the city | | tyame
🏖️ Moved to the coast | | yame
🚐 Started van life | | yame
⛵ Moved onto a boat | | yame
🏘️ Moved into a co-living space | | yame
🏘️ Moved into a retirement community | | e
🏠 Downsized | | me
🏚️ Lost our home | |
🏠 Found a home after homelessness | | tyame
💸 Paid off the mortgage | | ame
🏡 Sold our home | | yame
🏡 Bought a holiday home | | ame
🏠 Housewarming | | yame
🪴 Grew our first vegetables | |
🐝 Started keeping bees | | yame
🐓 Started keeping chickens | | yame
☀️ Installed solar panels | | yame
🔌 Went fully electric | | yame
♻️ Went zero-waste | | tyame
🧹 Decluttered everything | | tyame
🛋️ Furnished the place | | yame
🎨 Painted the house | | yame
🚗 Bought a car | Bought a {what:car} | tyame
🚲 Went car-free | | tyame
⚡ Bought an electric car | | yame
🔥 House fire | |
🌊 Survived a flood | |
🌪️ Survived a natural disaster | Survived the {what:disaster} |

@travel
# Firsts & adventures
✈️ First flight | |
🛳️ First cruise | |
🚂 First long train journey | |
🛂 First trip abroad | First trip abroad, to {place} |
🎒 Backpacking trip | Backpacked through {place} | tyam
🚗 Road trip | Road trip to {place} | tyame
🏕️ Camping trip | Camped at {place} |
🏝️ Island holiday | |
🏔️ Climbed a mountain | Climbed {what:mountain} | tyame
🏔️ Reached base camp | | yame
⛰️ Hiked a long-distance trail | Hiked the {what:trail} | tyame
🌋 Saw a volcano | |
🌌 Saw the northern lights | |
🌑 Saw a total solar eclipse | |
🐋 Went whale watching | |
🦁 Went on safari | Safari in {place} |
🪂 Went skydiving | | tyame
🎈 Hot-air balloon ride | | tyame
🐘 Visited an elephant sanctuary | |
🏯 Visited a world wonder | Visited {what:wonder} |
🗽 Visited a famous landmark | Visited {what:landmark} |
🛕 Pilgrimage | Pilgrimage to {place} |
⛰️ Climbed Sri Pada (Adam's Peak) | | ctyame
🏝️ Visited all the continents | | yame
🧳 Solo travel | Travelled solo to {place} | tyame
🏨 Worked remotely abroad | Worked from {place} | yame
🌍 Visited my ancestral home | Visited {place}, where my family is from |
🗺️ Country-count milestone | Visited {n} countries | tyame
🧭 Took a sabbatical to travel | | yame
🚢 Crossed an ocean | |
🛸 Went to space | | yame
`;

// ── Generated templates ──────────────────────────────────────────────────────

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
};

function stageForAge(age: number): Stage {
  return age <= 3 ? "baby" : age <= 12 ? "child" : age <= 19 ? "teen" : age <= 29 ? "young" : age <= 49 ? "adult" : age <= 64 ? "midlife" : "elder";
}

/** "lk" → 🇱🇰 */
const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const COUNTRIES = `af Afghanistan|al Albania|dz Algeria|ad Andorra|ao Angola|ag Antigua and Barbuda|ar Argentina|am Armenia|au Australia|at Austria|az Azerbaijan|bs the Bahamas|bh Bahrain|bd Bangladesh|bb Barbados|by Belarus|be Belgium|bz Belize|bj Benin|bt Bhutan|bo Bolivia|ba Bosnia and Herzegovina|bw Botswana|br Brazil|bn Brunei|bg Bulgaria|bf Burkina Faso|bi Burundi|cv Cabo Verde|kh Cambodia|cm Cameroon|ca Canada|cf the Central African Republic|td Chad|cl Chile|cn China|co Colombia|km Comoros|cg the Congo|cd the DR Congo|cr Costa Rica|ci Côte d'Ivoire|hr Croatia|cu Cuba|cy Cyprus|cz Czechia|dk Denmark|dj Djibouti|dm Dominica|do the Dominican Republic|ec Ecuador|eg Egypt|sv El Salvador|gq Equatorial Guinea|er Eritrea|ee Estonia|sz Eswatini|et Ethiopia|fj Fiji|fi Finland|fr France|ga Gabon|gm the Gambia|ge Georgia|de Germany|gh Ghana|gr Greece|gd Grenada|gt Guatemala|gn Guinea|gw Guinea-Bissau|gy Guyana|ht Haiti|hn Honduras|hu Hungary|is Iceland|in India|id Indonesia|ir Iran|iq Iraq|ie Ireland|il Israel|it Italy|jm Jamaica|jp Japan|jo Jordan|kz Kazakhstan|ke Kenya|ki Kiribati|kw Kuwait|kg Kyrgyzstan|la Laos|lv Latvia|lb Lebanon|ls Lesotho|lr Liberia|ly Libya|li Liechtenstein|lt Lithuania|lu Luxembourg|mg Madagascar|mw Malawi|my Malaysia|mv the Maldives|ml Mali|mt Malta|mh the Marshall Islands|mr Mauritania|mu Mauritius|mx Mexico|fm Micronesia|md Moldova|mc Monaco|mn Mongolia|me Montenegro|ma Morocco|mz Mozambique|mm Myanmar|na Namibia|nr Nauru|np Nepal|nl the Netherlands|nz New Zealand|ni Nicaragua|ne Niger|ng Nigeria|kp North Korea|mk North Macedonia|no Norway|om Oman|pk Pakistan|pw Palau|ps Palestine|pa Panama|pg Papua New Guinea|py Paraguay|pe Peru|ph the Philippines|pl Poland|pt Portugal|qa Qatar|ro Romania|ru Russia|rw Rwanda|kn Saint Kitts and Nevis|lc Saint Lucia|vc Saint Vincent and the Grenadines|ws Samoa|sm San Marino|st São Tomé and Príncipe|sa Saudi Arabia|sn Senegal|rs Serbia|sc Seychelles|sl Sierra Leone|sg Singapore|sk Slovakia|si Slovenia|sb the Solomon Islands|so Somalia|za South Africa|kr South Korea|ss South Sudan|es Spain|lk Sri Lanka|sd Sudan|sr Suriname|se Sweden|ch Switzerland|sy Syria|tw Taiwan|tj Tajikistan|tz Tanzania|th Thailand|tl Timor-Leste|tg Togo|to Tonga|tt Trinidad and Tobago|tn Tunisia|tr Türkiye|tm Turkmenistan|tv Tuvalu|ug Uganda|ua Ukraine|ae the United Arab Emirates|gb the United Kingdom|us the United States|uy Uruguay|uz Uzbekistan|vu Vanuatu|va Vatican City|ve Venezuela|vn Vietnam|ye Yemen|zm Zambia|zw Zimbabwe|hk Hong Kong|mo Macau|pr Puerto Rico|gl Greenland|fo the Faroe Islands|aq Antarctica`;

const SPORTS = `⚽ football|🏏 cricket|🏀 basketball|🏐 volleyball|🏉 rugby|🏈 American football|⚾ baseball|🥎 softball|🎾 tennis|🏸 badminton|🏓 table tennis|🎾 squash|🎾 padel|🥒 pickleball|🏑 field hockey|🏒 ice hockey|🥍 lacrosse|🤾 handball|🏐 netball|🏊 swimming|🤽 water polo|🤿 free diving|🏄 surfing|🏄 bodyboarding|🪁 kitesurfing|🏄 windsurfing|🏄 paddleboarding|🚣 rowing|🛶 kayaking|🛶 canoeing|⛵ sailing|🚤 waterskiing|🏃 running|🏃 trail running|🏃 sprinting|🏃 cross-country|🏃 track and field|🦘 long jump|🏋️ weightlifting|🏋️ powerlifting|🏋️ CrossFit|💪 bodybuilding|🤸 gymnastics|🤸 calisthenics|🤸 parkour|🧘 yoga|🧘 Pilates|🥊 boxing|🥋 karate|🥋 judo|🥋 taekwondo|🥋 Brazilian jiu-jitsu|🥋 kung fu|🥋 aikido|🥋 kickboxing|🥋 Muay Thai|🥋 MMA|🤺 fencing|🤼 wrestling|🥋 angampora|🥋 kalaripayattu|🥋 capoeira|🚴 cycling|🚵 mountain biking|🚴 BMX|🛹 skateboarding|🛼 roller skating|🛼 roller derby|⛸️ figure skating|⛸️ speed skating|🎿 skiing|🏂 snowboarding|🎿 cross-country skiing|🧗 rock climbing|🧗 bouldering|🧗 mountaineering|🥾 hiking|🏇 horse riding|🏇 show jumping|🏇 polo|⛳ golf|🎳 bowling|🎯 darts|🎱 snooker|🎱 pool|🏹 archery|🎯 shooting|🥏 ultimate frisbee|🥏 disc golf|🏎️ motor racing|🏍️ motocross|🏁 karting|🏐 beach volleyball|🏊 triathlon|🏃 duathlon|🏊 open-water swimming|🧗 obstacle racing|🤸 cheerleading|💃 dancesport|🧊 curling|🛷 bobsleigh|🏋️ kettlebells|🥏 dodgeball|🏏 elle|🪀 kabaddi|🏸 sepak takraw|🎽 orienteering|♟️ chess|🎮 esports`;

const LANGUAGES = `Sinhala|Tamil|English|Hindi|Bengali|Urdu|Punjabi|Gujarati|Marathi|Telugu|Kannada|Malayalam|Nepali|Pali|Sanskrit|Mandarin|Cantonese|Japanese|Korean|Vietnamese|Thai|Khmer|Lao|Burmese|Indonesian|Malay|Tagalog|Arabic|Hebrew|Persian|Turkish|Kurdish|Pashto|Dari|Spanish|Portuguese|French|Italian|German|Dutch|Afrikaans|Swedish|Norwegian|Danish|Icelandic|Finnish|Estonian|Latvian|Lithuanian|Polish|Czech|Slovak|Hungarian|Romanian|Bulgarian|Greek|Albanian|Serbian|Croatian|Bosnian|Slovenian|Macedonian|Ukrainian|Russian|Belarusian|Georgian|Armenian|Azerbaijani|Kazakh|Uzbek|Mongolian|Tibetan|Swahili|Amharic|Somali|Yoruba|Igbo|Hausa|Zulu|Xhosa|Shona|Malagasy|Welsh|Irish|Scottish Gaelic|Basque|Catalan|Galician|Maltese|Latin|Ancient Greek|Esperanto|Hawaiian|Māori|Samoan|Quechua|Navajo|Cherokee|Inuktitut|Yiddish|Haitian Creole|American Sign Language|British Sign Language|Sri Lankan Sign Language|Auslan|Braille|Python|JavaScript|Rust`;

const INSTRUMENTS = `🎹 piano|🎸 guitar|🎸 bass guitar|🎸 electric guitar|🎻 violin|🎻 viola|🎻 cello|🎻 double bass|🪕 banjo|🪕 mandolin|🪕 ukulele|🪈 flute|🪈 recorder|🎷 saxophone|🎺 trumpet|🎺 trombone|🎺 French horn|🎺 tuba|🎷 clarinet|🎷 oboe|🎷 bassoon|🥁 drums|🥁 tabla|🥁 djembe|🥁 Kandyan drum (geta bera)|🥁 thammattama|🥁 cajón|🥁 percussion|🎵 harp|🎹 organ|🎹 synthesiser|🎹 harmonium|🪗 accordion|🪗 harmonica|🪕 sitar|🪕 veena|🪕 erhu|🪕 guzheng|🪕 koto|🪕 shamisen|🪕 oud|🎵 bagpipes|🎵 steel pan|🎵 marimba|🎵 xylophone|🎵 handpan|🎧 DJ decks|🎤 singing|🎶 music production`;

const HOBBIES = `📷 photography|🎥 filmmaking|✍️ creative writing|📝 journaling|📖 poetry|📚 a book club|🎨 painting|🖌️ watercolour|🖍️ drawing|✏️ calligraphy|🏺 pottery|🗿 sculpture|🧶 knitting|🧶 crochet|🧵 sewing|🪡 embroidery|🧵 quilting|🪢 macramé|🪵 woodworking|🔨 carpentry|💍 jewellery making|🕯️ candle making|🧼 soap making|🌸 flower arranging|🌱 gardening|🌵 houseplants|🌳 bonsai|🍳 cooking|🍞 baking|🍞 sourdough|🍷 wine tasting|☕ coffee roasting|🍺 home brewing|🧀 cheese making|🎲 board games|🧩 jigsaw puzzles|🧠 crosswords|♟️ chess|🃏 card games|🎮 gaming|🕹️ retro gaming|🎲 tabletop role-playing|🤖 robotics|🔌 electronics|🖨️ 3D printing|💻 programming|🔭 astronomy|🐦 birdwatching|🦋 butterfly watching|🎣 fishing|🍄 foraging|🪨 rock collecting|🪙 coin collecting|📮 stamp collecting|💿 vinyl collecting|🚂 model trains|✈️ model aircraft|🛩️ drones|🎭 acting|🎤 stand-up comedy|🎤 karaoke|💃 dancing|💃 salsa|💃 ballet|💃 hip-hop dance|💃 Kandyan dance|💃 Bharatanatyam|🧙 cosplay|🧘 meditation|🗺️ geocaching|🧳 genealogy|🎨 digital art|🎞️ animation|📹 vlogging|🎙️ podcasting|🧑‍🍳 food blogging|🪁 kite flying|🎯 magic tricks|🌌 stargazing|♻️ upcycling|🐟 aquariums`;

const PETS = `🐶 dog|🐶 puppy|🐱 cat|🐱 kitten|🐰 rabbit|🐹 hamster|🐹 guinea pig|🐭 rat|🐭 mouse|🐿️ chinchilla|🦔 hedgehog|🦦 ferret|🐦 budgie|🦜 parrot|🦜 cockatiel|🐤 canary|🐔 chicken|🦆 duck|🐐 goat|🐑 sheep|🐄 cow|🐖 pig|🐴 horse|🫏 donkey|🦙 alpaca|🐢 tortoise|🐢 turtle|🦎 lizard|🦎 gecko|🦎 bearded dragon|🐍 snake|🐸 frog|🐟 goldfish|🐠 tropical fish|🐝 bees|🕷️ tarantula|🦀 hermit crab`;

const PROFESSIONS = `🧑‍⚕️ doctor|🧑‍⚕️ nurse|🧑‍⚕️ midwife|🧑‍⚕️ surgeon|🧑‍⚕️ paramedic|🧑‍⚕️ pharmacist|🦷 dentist|🧑‍⚕️ physiotherapist|🧠 psychologist|🧠 therapist|🧑‍⚕️ veterinarian|🧑‍🏫 teacher|🧑‍🏫 lecturer|🧑‍🏫 professor|🧑‍🏫 tutor|🧑‍🏫 early-years educator|🧑‍🔬 scientist|🧑‍🔬 researcher|🧑‍💻 software engineer|🧑‍💻 developer|🧑‍💻 data scientist|🧑‍💻 designer|🧑‍💻 product manager|🧑‍💻 engineering manager|🛡️ security engineer|🧑‍🔧 engineer|🏗️ civil engineer|⚡ electrical engineer|🛠️ mechanical engineer|🏛️ architect|🧑‍⚖️ lawyer|🧑‍⚖️ judge|🧑‍⚖️ paralegal|📊 accountant|📈 financial analyst|🏦 banker|💼 consultant|📣 marketer|📰 journalist|📸 photographer|🎬 filmmaker|🎭 actor|🎤 musician|🎨 artist|✍️ writer|📚 librarian|🧑‍🍳 chef|🍰 baker|☕ barista|🍸 bartender|🍽️ server|🛒 shop assistant|🏪 shopkeeper|💇 hairdresser|💅 beautician|💆 massage therapist|🏋️ personal trainer|🧘 yoga teacher|⚽ professional athlete|🧑‍🌾 farmer|🌿 gardener|🔧 mechanic|🔌 electrician|🚰 plumber|🪚 carpenter|🧱 builder|🎨 painter and decorator|🚚 driver|🚕 taxi driver|🛵 delivery rider|✈️ pilot|🛫 flight attendant|🚢 sailor|🚂 train driver|🧑‍🚒 firefighter|👮 police officer|🪖 soldier|🛡️ security guard|🏛️ civil servant|🗳️ politician|🧑‍💼 entrepreneur|🧑‍💼 freelancer|🧑‍💼 executive assistant|📞 customer-service agent|🧑‍🏭 factory worker|🧹 cleaner|🧑‍🍼 nanny|🧓 carer|🧑‍⚕️ social worker|🙏 priest|🙏 monk|🙏 nun|🙏 imam|🙏 rabbi|🎙️ podcaster|📹 content creator|🎮 streamer|🧑‍🔬 lab technician|🏠 estate agent|🧾 tax adviser|📦 warehouse worker|🧵 tailor|👗 fashion designer|💍 jeweller|🪡 seamstress|🌍 diplomat|🧑‍✈️ air-traffic controller|🗺️ tour guide|🏨 hotel manager|🧑‍🏫 headteacher|🧑‍⚕️ dietitian|🧑‍⚕️ optometrist|🩻 radiographer|🧑‍⚕️ occupational therapist|🧑‍⚕️ speech therapist|🧑‍🔬 pharmacologist|🦺 health-and-safety officer|🔥 welder|🧑‍🌾 fisher|🌳 forester|🐄 dairy farmer|🍵 tea planter|🧑‍🎨 tattoo artist|🎪 performer|🃏 magician|🧑‍🏫 driving instructor|🧑‍💻 IT support|🧑‍💻 DevOps engineer|🧑‍💻 UX researcher|📈 investor|🧾 auditor|🏛️ curator|📜 historian|🗣️ translator|🗣️ interpreter|🧑‍⚖️ mediator|🧑‍🤝‍🧑 community organiser|🏳️ charity worker|🧑‍🚀 astronaut`;

const DEGREES = `high-school diploma|GED|associate degree|foundation degree|higher national diploma|bachelor's degree|BA|BSc|BEng|LLB|BEd|BBA|MBBS|master's degree|MA|MSc|MBA|MEng|LLM|MPhil|PhD|doctorate|MD|JD|DDS|PharmD|EdD|postgraduate diploma|postgraduate certificate|teaching qualification`;

const SUBJECTS = `computer science|software engineering|medicine|nursing|law|engineering|mechanical engineering|electrical engineering|civil engineering|architecture|business|management|accounting|finance|economics|marketing|psychology|sociology|anthropology|history|philosophy|politics|international relations|English literature|creative writing|linguistics|journalism|media studies|film|music|fine art|graphic design|fashion design|theatre|dance|education|early-childhood education|mathematics|statistics|physics|chemistry|biology|biochemistry|genetics|neuroscience|environmental science|geology|geography|agriculture|veterinary science|pharmacy|dentistry|public health|social work|criminology|religious studies|Buddhist studies|archaeology|data science|artificial intelligence|cybersecurity|hospitality|tourism|sport science|nutrition`;

const EXAMS = `📝 G.C.E. O/L|📝 G.C.E. A/L|📝 Grade 5 scholarship exam|📝 GCSEs|📝 A-levels|📝 IB Diploma|📝 SAT|📝 ACT|📝 AP exams|📝 gaokao|📝 Suneung (CSAT)|📝 JEE|📝 NEET|📝 Matric|📝 Leaving Cert|📝 Baccalauréat|📝 Abitur|📝 HSC|📝 VCE|📝 NCEA|📝 IELTS|📝 TOEFL|📝 Duolingo English Test|📝 JLPT|📝 HSK|📝 DELF|📝 DELE|📝 Goethe exam|📝 GRE|📝 GMAT|📝 LSAT|📝 MCAT|📝 UCAT|📝 USMLE|📝 PLAB|📝 NCLEX|📝 bar exam|📝 CPA exam|📝 CFA Level I|📝 CFA Level II|📝 CFA Level III|📝 ACCA|📝 CIMA|📝 CA Sri Lanka|📝 PMP|📝 AWS certification|📝 Azure certification|📝 Google Cloud certification|📝 CCNA|📝 CISSP|📝 Scrum Master certification|📝 Six Sigma|📝 ABRSM grade exam|📝 Trinity music exam|🚗 driving theory test|🚗 driving test|🤿 PADI Open Water|🧑‍🚒 first-aid certificate|🧑‍🏫 TEFL|🥋 black-belt grading`;

const RACES = `🏃 5K|🏃 10K|🏃 parkrun|🏃 half marathon|🏃 marathon|🏃 ultramarathon|🏃 Boston Marathon|🏃 London Marathon|🏃 New York City Marathon|🏃 Colombo Marathon|🏃 Berlin Marathon|🏃 Tokyo Marathon|🏃 Chicago Marathon|🏊 sprint triathlon|🏊 Olympic triathlon|🏊 half Ironman|🏊 Ironman|🚴 century ride|🚴 cycling sportive|🧗 Tough Mudder|🧗 Spartan Race|🏊 open-water mile|🏊 Channel swim|🥾 Three Peaks Challenge|🥾 Camino de Santiago|🏔️ Everest Base Camp trek|🏔️ Kilimanjaro climb|🥾 Inca Trail`;

const FAITH = `
☸️ Took refuge (Buddhism) | | ctyame
☸️ Ordained as a monk or nun | | ctyame
☸️ Observed sil (eight precepts) | | ctyame
☸️ Vesak | Celebrated Vesak |
☸️ Poson | |
🪔 Visited a dansala | |
🍚 Gave a dana (almsgiving) | | tyame
🍚 Hosted an almsgiving in memory | Almsgiving in memory of {person} | tyame
📿 Pirith ceremony | |
🛕 Visited the Temple of the Tooth | |
🛕 Atamasthana pilgrimage | |
🛕 Kataragama pilgrimage | |
🌳 Visited Sri Maha Bodhi | |
🧘 Meditation retreat | Retreat at {place} | tyame
☀️ Sinhala and Tamil New Year | Celebrated Avurudu |
🕉️ Diwali | Celebrated Diwali |
🕉️ Thai Pongal | |
🕉️ Holi | |
🕉️ Navaratri | |
🕉️ Shivaratri | |
🕉️ Pilgrimage to Varanasi | | yame
🕉️ Kumbh Mela | | yame
🕉️ Housewarming puja (griha pravesh) | | yame
🧵 Raksha Bandhan | |
☪️ Shahada | | tyame
☪️ Converted to Islam | | tyame
☪️ First Ramadan | |
☪️ Eid al-Fitr | Celebrated Eid al-Fitr |
☪️ Eid al-Adha | Celebrated Eid al-Adha |
🕋 Performed Umrah | | tyame
🕋 Performed Hajj | | yame
📖 Completed the Quran | | ctyame
📖 Became a hafiz | | ctyame
✝️ Baptised as an adult | | tyame
✝️ Became a Christian | | tyame
✝️ Received confirmation | | ct
✝️ Christmas | Christmas with {person} |
✝️ Easter | |
✝️ Pilgrimage to Jerusalem | | tyame
✝️ Pilgrimage to Rome | | tyame
✝️ Walked the Camino | | tyame
⛪ Joined a church | Joined {place} | tyame
⛪ Ordained | Ordained at {place} | yame
✡️ Converted to Judaism | | tyame
✡️ Passover seder | Hosted a seder |
✡️ Hanukkah | |
✡️ Yom Kippur | |
✡️ Visited Israel on Birthright | | ty
🪯 Amrit Sanchar | | tyame
🪯 Vaisakhi | |
🪯 Visited the Golden Temple | |
☯️ Lunar New Year | Celebrated Lunar New Year |
🏮 Mid-Autumn Festival | |
🏮 Qingming (tomb sweeping) | |
🎎 Obon | |
⛩️ Hatsumōde | |
🪔 Lit a lamp at a shrine | |
🕯️ Day of the Dead | |
🌍 Kwanzaa | |
🌙 Nowruz | |
🎃 Halloween | |
🦃 Thanksgiving | |
🎄 Hosted Christmas | | yame
🌿 Joined a Pagan or Wiccan circle | | tyame
🌙 Solstice celebration | |
🔄 Converted | Converted to {what:faith} | tyame
🧭 Left my faith | | tyame
🧭 Found my spirituality | | tyame
🙏 Became a religious teacher | | yame
🙏 Went on a silent retreat | | tyame
🎎 Celebrated my culture's festival | Celebrated {what:festival} |
`;

const OTHER_BLOCKS = String.raw`
@health
# Diagnoses & treatment
🩺 Diagnosed | Diagnosed with {what:condition} |
🩺 Got a second opinion | |
🏥 Surgery | Had {what:surgery} |
🏥 Hospital stay | |
🏥 Discharged from hospital | |
🚑 Emergency | |
🦴 Broke a bone | Broke my {what:bone} |
🩹 Recovered from an injury | |
🎗️ Cancer diagnosis | |
💉 Started chemotherapy | | yame
☢️ Started radiotherapy | | yame
🔔 Rang the bell (finished treatment) | |
🎗️ Cancer-free | |
🎗️ In remission | |
❤️ Heart surgery | | ame
❤️ Survived a heart attack | | ame
🧠 Survived a stroke | | ame
🩸 Diagnosed with diabetes | |
🫁 Diagnosed with asthma | |
🫀 Organ transplant | Received a {what:organ} transplant |
🫀 Became an organ donor | | tyame
🩸 Donated blood | Donated blood for the {n} time | tyame
🦴 Bone marrow donation | | tyame
🧬 Genetic diagnosis | |
💊 Started new medication | |
💊 Came off medication | |
🦽 Started using a wheelchair | |
🦯 Started using a cane | |
👂 Got hearing aids | |
👂 Cochlear implant | |
👓 Laser eye surgery | | tyam
👁️ Cataract surgery | | me
🦷 Dental implants | | ame
🦠 Recovered from COVID-19 | |
💉 Got vaccinated | Got vaccinated against {what:illness} |
🩺 Annual check-up | |
🩺 Chronic illness anniversary | |
🌈 Surgery anniversary | |
# Mental health
🧠 Started therapy | | tyame
🧠 Finished therapy | | tyame
🧠 Diagnosed with depression | | tyame
🧠 Diagnosed with anxiety | | tyame
🧠 Diagnosed with bipolar disorder | | tyame
🧠 Diagnosed with OCD | | tyame
🧠 Diagnosed with PTSD | | tyame
🌱 Recovering from burnout | | yame
🌱 Recovered from an eating disorder | | tyame
🫂 Survived a dark time | | tyame
💙 Asked for help | |
💙 Mental-health day | | tyame
# Sobriety & habits
🚭 Quit smoking | | tyame
🚭 Quit vaping | | tyame
🍷 Quit drinking | | tyame
🍷 Dry January | | yame
🍷 Sober October | | yame
🍃 Went vegetarian | |
🌱 Went vegan | |
🥗 Started eating healthily | |
⚖️ Reached a goal weight | | tyame
😴 Fixed my sleep | | tyame
📵 Digital detox | | tyame
🛌 Started a morning routine | | tyame
🧘 Started meditating | | tyame
☕ Quit caffeine | | tyame
🍬 Quit sugar | | tyame

@aging
# Retirement & later life
🕊️ Retired | | me
🧓 First day of retirement | | me
🧓 Started a pension | | me
🧓 Got a senior's travel pass | | e
🧓 Senior discount | | me
🧓 Joined a seniors' club | Joined {org} | e
🧓 Started volunteering in retirement | | e
🧓 Learned to use a smartphone | | e
🧓 Started using video calls | | e
🧓 Went back to school | | me
🧓 Completed a degree in later life | | e
🧓 Wrote my memoir | | me
🧓 Recorded my life story | | me
🧓 Passed on a family recipe | | me
🧓 Passed on a family heirloom | Gave {what:heirloom} to {person} | me
🧓 Moved in with my children | | e
🧓 Moved into assisted living | | e
🧓 Moved into a care home | | e
🧓 Gave up driving | | e
🧓 Made a will | | yame
🧓 Made a living will | | ame
🧓 Arranged power of attorney | | me
🧓 Planned my funeral | | me
🧓 Hwangap (60th birthday) | | m
🧓 Kanreki (60th birthday) | | m
🧓 Shashtiabdapoorthi (60th) | | m
🧓 Sathabhishekam (80th) | | e
🧓 Met a great-grandchild | Met my great-grandchild {person} | e
🧓 Five generations photo | | e
🧓 Celebrated 50 years of marriage | | me
🧓 Celebrated 60 years of marriage | | e
🧓 Letter from the monarch or president | | e
🧓 Became a centenarian | | e
🧓 Oldest in the family | | e
🧓 Downsized the family home | | me
🧓 Started gardening in retirement | | me
🧓 Grandchildren's sleepover | | me
🧓 Took the grandchildren on holiday | | me
🧓 Taught a grandchild a skill | Taught {person} to {what:skill} | me
🧓 Reunion with old classmates | | me
🧓 Fifty-year school reunion | | e
🧓 Hip replacement | | me
🧓 Knee replacement | | me
🧓 Started using a walker | | e
🧓 Diagnosed with dementia | | me
🧓 Caring for a spouse | | me
🧓 Became a widow or widower | | me

@civic
# Citizenship & community
🗳️ Registered to vote | | tyame
🗳️ Voted in an election | Voted in the {what:election} | tyame
🗳️ Ran for office | Ran for {what:office} | yame
🗳️ Elected | Elected as {what:office} | yame
🗳️ Election volunteer | | tyame
🧑‍⚖️ Jury duty | | yame
🌏 Citizenship ceremony | | tyame
🛂 Got a visa | Got a {what:visa} visa | tyame
🛂 Became a refugee | |
🏠 Resettled as a refugee | Resettled in {place} |
📜 Took an oath of office | | yame
✊ Joined a protest | Joined the {what:protest} | tyame
✊ Organised a campaign | | tyame
✍️ Started a petition | | tyame
🤝 Started volunteering | Volunteering at {org} | ctyame
🤝 Volunteer milestone | {n} hours volunteering | ctyame
🎗️ Fundraiser | Raised {what:amount} for {org} | ctyame
🏃 Charity run | Ran for {org} | ctyame
✂️ Donated hair | | ctyame
🧑‍🚒 Joined the volunteer fire service | | tyame
🦺 Disaster-relief volunteer | | tyame
🌳 Community clean-up | | ctyame
🌳 Planted trees for the community | | ctyame
🏘️ Joined a residents' association | | yame
🏫 Joined the school board | | yame
🏫 Joined the PTA | | yame
🧑‍🏫 Became a coach | Coaching {team} | tyame
🧑‍🏫 Became a scout leader | | yame
🏅 Received a civic honour | Received {what:honour} | yame
🎖️ Received a bravery award | |
🦸 Saved a life | | tyame
🫀 Learned CPR | | tyame
📰 Wrote to a newspaper | | tyame
🏛️ Met a head of state | Met {person} |
🏛️ Gave evidence to parliament | | yame
🌍 Joined a global movement | Joined {org} | tyame

@money
# Money milestones
🏦 Opened a savings account | | cty
💰 First savings goal | Saved for {what:goal} | ctyame
💳 First credit card | | ty
📈 First investment | | tyame
📈 Started a pension | | yame
📈 Bought first shares | | tyame
🪙 Bought crypto | | tyame
💸 Paid off a credit card | | tyame
💸 Became debt-free | | tyame
🏠 Saved a house deposit | | yame
🏠 Got a mortgage | | yame
💸 Paid off the car | | yame
💸 Emergency fund complete | | tyame
💰 Hit a net-worth milestone | Reached {what:amount} | yame
💰 Hit financial independence | | ame
🎰 Won the lottery | | tyame
🎁 Received an inheritance | |
🧾 Filed my first tax return | | ty
🧾 Got a tax refund | | yame
💸 Bankruptcy | | yame
🌱 Recovered from bankruptcy | | yame
🤝 Made a big donation | Donated {what:amount} to {org} | yame
🎓 Started a college fund | Started a college fund for {person} | yame
🧾 Started budgeting | | tyame
💼 Sold something big | Sold {what:item} | tyame

@achievement
# Personal bests
🏆 Won an award | Won {what:award} |
🥇 Won a competition | Won {what:competition} |
🥈 Came second | |
🥉 Came third | |
🏅 Got a medal | |
🎖️ National honour | Received {what:honour} | yame
📕 Finished writing a book | | tyame
📕 Book became a bestseller | | yame
📝 Got published | Published in {what:publication} | tyame
🎤 Performed on stage | Performed at {place} |
🎤 First open-mic | | tyame
📺 Appeared on TV | |
📰 Made the news | |
🌐 Went viral | | tyame
🏅 Guinness World Record | |
🧠 Learned something hard | Learned {what:skill} |
✅ Completed a bucket-list item | {what:bucket-list item} |
📚 Reading goal reached | Read {n} books in a year | ctyame
📸 Photo exhibited | | tyame
🖼️ Sold first artwork | | tyame
🎵 Wrote a song | | ctyame
🧑‍💻 Open-source contribution | Contributed to {what:project} | tyame
🧑‍🔬 Patent granted | Patent for {what:invention} | yame
🎓 Gave a TED talk | | yame
🦸 Faced a fear | Faced my fear of {what:fear} |
🧗 Overcame a challenge | |
🎯 Reached a goal | {what:goal} |
💯 100-day streak | {n}-day streak of {what:habit} |
🧘 Personal transformation | | tyame

@remembrance
# Loss
🕊️ In loving memory | In loving memory of {person} |
🕊️ Lost a parent | Said goodbye to {person} |
🕊️ Lost my mother | |
🕊️ Lost my father | |
🕊️ Lost a spouse | | yame
🕊️ Lost a partner | | tyame
🕊️ Lost a child | | yame
🕊️ Lost a sibling | |
🕊️ Lost a grandparent | |
🕊️ Lost a friend | |
🕊️ Lost a colleague | | yame
🕊️ Lost a mentor | |
🕊️ Lost a pet | Said goodbye to {name} |
🕯️ Funeral | {person}'s funeral |
🕯️ Memorial service | |
🕯️ Celebration of life | |
🍚 Seventh-day almsgiving | |
🍚 Three-month almsgiving | |
🍚 One-year almsgiving | |
🕯️ Shiva | |
🕯️ Yahrzeit | |
🕯️ Shraddha | |
🕯️ Chehlum | |
🕯️ Scattered the ashes | |
🪦 Unveiled the headstone | |
🕯️ Anniversary of a death | {n} years since {person} passed |
💐 Visited a grave | Visited {person}'s grave |
📜 Wrote a eulogy | |
📜 Executor of an estate | | yame
🫂 Joined a grief group | |
🌱 Planted a memorial tree | |
💌 Letter to someone I lost | |
🕊️ Survived a loss by suicide | |
🎗️ Memorial fundraiser | |

@other
# Other
⭐ Something worth remembering | |
🍀 Lucky day | |
🌈 A turning point | |
📦 A fresh start | |
💡 A big decision | |
🧳 A new chapter | |
🎉 A celebration | |
🔁 Changed my mind about something | |
🌤️ A perfect day | |
📅 A day I'll never forget | |
`;

// ── Assembly ─────────────────────────────────────────────────────────────────

const TEMPLATES: LifeEventTemplate[] = [];
const GROUP_EMOJI = new Map<string, string>();
const byId = new Map<string, LifeEventTemplate>();

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\{[^}]*\}/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

function add(category: string, group: string, emoji: string, label: string, title = "", stages: Stage[] = ALL_STAGES, slug = slugify(label), tone?: Tone) {
  let id = `${category}.${slug}`;
  for (let n = 2; byId.has(id); n++) id = `${category}.${slug}_${n}`;
  const t: LifeEventTemplate = { id, category, group, emoji, label, title: title || label, stages, ...(tone && { tone }) };
  TEMPLATES.push(t);
  byId.set(id, t);
}

function parse(block: string, fallbackCategory?: string) {
  let category = fallbackCategory ?? "other";
  let group = "General";
  let tone: Tone | undefined;
  for (const raw of block.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("@")) {
      category = line.slice(1).trim();
      group = "General";
      tone = undefined;
    } else if (line.startsWith("## ")) {
      // "## spicy" / "## hard" mark the lines that follow, within the group.
      const t = line.slice(3).trim();
      tone = t === "spicy" || t === "hard" ? t : undefined;
    } else if (line.startsWith("# ")) {
      group = line.slice(2).trim();
      tone = group === "Spicy & naughty" ? "spicy" : group === "Heartache & mistakes" ? "hard" : undefined;
      // "# 🧑‍🏫 Teacher": a group with its own icon (roles).
      const icon = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}\u200d\ufe0f\p{Emoji_Modifier}]*)\s+(.*)$/u.exec(group);
      if (icon) {
        group = icon[2];
        GROUP_EMOJI.set(`${category}/${group}`, icon[1]);
      }
    } else {
      const [head, title = "", codes = ""] = line.split("|").map((s) => s.trim());
      const space = head.indexOf(" ");
      const stages = codes ? [...codes].map((c) => CODES[c]).filter(Boolean) : ALL_STAGES;
      const label = head.slice(space + 1).trim();
      // Roles share event names ("First day in uniform"), so their ids include the role.
      const slug = category === "roles" ? `${slugify(group)}_${slugify(label)}`.slice(0, 70) : undefined;
      add(category, group, head.slice(0, space), label, title, stages, slug, tone);
    }
  }
}

/** Every job role also gets the common workplace crushes and hard days. */
function addWorkplaceMoments() {
  const roles = [...new Set(TEMPLATES.filter((t) => t.category === "roles").map((t) => t.group))];
  for (const role of roles) {
    if (/^(Student|University student)/.test(role)) continue;
    for (const [lines, tone] of [[WORK_SPICY, "spicy"], [WORK_HARD, "hard"]] as const) {
      for (const line of lines.trim().split("\n")) {
        const [head, title = "", codes = ""] = line.split("|").map((s) => s.trim());
        const space = head.indexOf(" ");
        const label = head.slice(space + 1).trim();
        const stages = codes ? [...codes].map((c) => CODES[c]).filter(Boolean) : ALL_STAGES;
        const slug = `${slugify(role)}_${slugify(label)}`.slice(0, 70);
        if (!byId.has(`roles.${slug}`)) add("roles", role, head.slice(0, space), label, title, stages, slug, tone);
      }
    }
  }
}

const each = (list: string, fn: (emoji: string, name: string) => void) =>
  list.split("|").forEach((entry) => {
    const e = entry.trim();
    const space = e.indexOf(" ");
    // Entries without an emoji are plain names.
    if (/^\p{Extended_Pictographic}|^\p{Regional_Indicator}/u.test(e)) fn(e.slice(0, space), e.slice(space + 1));
    else fn("", e);
  });

const YOUNG_ON: Stage[] = ["child", "teen", "young", "adult", "midlife", "elder"];
const GROWN: Stage[] = ["teen", "young", "adult", "midlife", "elder"];
const ADULT: Stage[] = ["young", "adult", "midlife", "elder"];

parse(DATA);
parse(FAITH, "faith");
parse(OTHER_BLOCKS);
parse(ROLES);
parse(MORE_ROLES);
addWorkplaceMoments();
parse(PARENT_CHILD);
parse(EVERYDAY);
parse(STYLE);
parse(LOVE_SPICY);

// Baby: monthly milestones and pregnancy weeks.
for (let m = 1; m <= 24; m++) add("baby", "Monthly milestones", "🍼", `Baby turned ${m} month${m > 1 ? "s" : ""}`, `{person} is ${m} month${m > 1 ? "s" : ""} old`, ["baby", "young", "adult"], `month_${m}`);
for (let w = 4; w <= 42; w++) add("womens", "Pregnancy week by week", "🤰", `Pregnancy week ${w}`, `${w} weeks pregnant`, ["teen", "young", "adult"], `pregnancy_week_${w}`);
for (let g = 1; g <= 13; g++) add("education", "School years", "🎒", `Started grade ${g}`, `{person} started grade ${g}`, g < 8 ? ["child"] : ["child", "teen"], `grade_${g}`);

// Education: degrees, subjects and exams.
each(DEGREES, (_, d) => add("education", "Degrees & diplomas", "🎓", `Earned a ${d}`, `Earned a ${d} from {school}`, GROWN, `degree_${slugify(d)}`));
each(SUBJECTS, (_, s) => add("education", "Fields of study", "📚", `Started studying ${s}`, `Started studying ${s} at {school}`, GROWN, `study_${slugify(s)}`));
each(EXAMS, (e, x) => {
  add("education", "Exams & certifications", e, `Sat the ${x}`, "", YOUNG_ON, `sat_${slugify(x)}`);
  add("education", "Exams & certifications", "✅", `Passed the ${x}`, `Passed the ${x} with {what:result}`, YOUNG_ON, `passed_${slugify(x)}`);
});

// Career: professions.
each(PROFESSIONS, (e, p) => add("career", "Became a…", e, `Became ${/^[aeiou]/i.test(p) ? "an" : "a"} ${p}`, `Started working as ${/^[aeiou]/i.test(p) ? "an" : "a"} ${p} at {company}`, GROWN, `became_${slugify(p)}`));

for (const n of [1, 2, 3, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) add("career", "Work anniversaries", "🎉", `${n} year${n > 1 ? "s" : ""} at work`, `${n} year${n > 1 ? "s" : ""} at {company}`, ADULT, `work_anniversary_${n}`);

// Travel: every country, visited and moved to.
each(COUNTRIES, (_, entry) => {
  const code = entry.slice(0, 2);
  const name = entry.slice(3);
  const plain = name.replace(/^the /, "");
  add("travel", "Countries visited", flag(code), `Visited ${plain}`, `Visited ${name}`, ALL_STAGES, `visited_${code}`);
  add("travel", "Countries lived in", flag(code), `Moved to ${plain}`, `Moved to {place}, ${name}`, ALL_STAGES, `moved_${code}`);
});

// Fitness: sports and races.
each(SPORTS, (e, s) => {
  add("fitness", "Sports", e, `Took up ${s}`, "", YOUNG_ON, `started_${slugify(s)}`);
  add("fitness", "Competitions", e, `First ${s} competition`, `Competed in {what:event}`, YOUNG_ON, `competed_${slugify(s)}`);
  add("fitness", "Wins & titles", "🏆", `Won a ${s} title`, `Won the {what:title} in ${s}`, YOUNG_ON, `won_${slugify(s)}`);
});
each(RACES, (e, r) => add("fitness", "Races & challenges", e, `Finished a ${r}`, `Finished the {what:race} in {time}`, YOUNG_ON, `finished_${slugify(r)}`));
for (const s of ["first pull-up", "first push-up", "100 push-ups", "a 5-minute plank", "the splits", "a handstand", "a body-weight squat", "a body-weight deadlift"])
  add("fitness", "Personal bests", "💪", `Did ${s}`, "", YOUNG_ON, `did_${slugify(s)}`);

// Hobbies and learning.
each(HOBBIES, (e, h) => add("hobbies", "New hobbies", e, `Took up ${h}`, "", ALL_STAGES.slice(1), `took_up_${slugify(h)}`));
each(INSTRUMENTS, (e, i) => {
  const what = i === "singing" || i === "music production" || i === "percussion" ? i : `the ${i}`;
  add("hobbies", "Music", e, `Started learning ${what}`, "", YOUNG_ON, `learning_${slugify(i)}`);
  add("hobbies", "Music", "🎶", `First performance on ${what}`, `Performed on ${what} at {place}`, YOUNG_ON, `performed_${slugify(i)}`);
});
each(LANGUAGES, (_, l) => {
  add("learning", "Languages", "🗣️", `Started learning ${l}`, "", YOUNG_ON, `learning_${slugify(l)}`);
  add("learning", "Languages", "💬", `Became fluent in ${l}`, "", YOUNG_ON, `fluent_${slugify(l)}`);
});
for (const s of ["to cook", "to drive", "to swim", "to code", "to sew", "to dance", "to type", "first aid", "sign language", "to fix a car", "to knit", "to meditate", "to play chess", "to ride a horse", "to sail", "to fly a plane", "to surf", "to ski", "a magic trick", "to juggle"])
  add("learning", "Skills", "🧠", `Learned ${s}`, "", ALL_STAGES.slice(1), `learned_${slugify(s)}`);

// Pets.
each(PETS, (e, p) => {
  const a = /^[aeiou]/i.test(p) ? "an" : "a";
  add("pets", "New arrivals", e, `Welcomed ${a} ${p}`, `Welcomed {name}, our ${p}`, ALL_STAGES, `welcomed_${slugify(p)}`);
});
parse(`@pets
# Pet life
🐾 Adopted from a shelter | Adopted {name} from {place} |
🐾 Fostered an animal | |
🎂 Pet's birthday | {name} turned {n} |
🎓 Finished puppy training | |
🏅 Pet won a show | |
🐶 Pet learned a trick | {name} learned to {what:trick} |
🏥 Pet's surgery | |
🌈 Crossed the rainbow bridge | Said goodbye to {name} |
🐣 Pet had babies | |
🐾 Became a dog walker | | ctyame
🐴 First riding lesson | | ctyame
🐾 Rescued an animal | | `);

// Birthdays: every age, plus anniversaries and sobriety.
for (let n = 1; n <= 110; n++) {
  const emoji = n === 100 ? "💯" : n % 10 === 0 ? "🎉" : "🎂";
  add("birthday", "Birthdays", emoji, `Turned ${n}`, `{person} turned ${n}`, [stageForAge(n)], `turned_${n}`);
}
const GIFTS: Record<number, string> = {
  1: "paper", 2: "cotton", 3: "leather", 4: "linen", 5: "wood", 6: "iron", 7: "wool", 8: "bronze", 9: "pottery", 10: "tin",
  11: "steel", 12: "silk", 13: "lace", 14: "ivory", 15: "crystal", 20: "china", 25: "silver", 30: "pearl", 35: "coral",
  40: "ruby", 45: "sapphire", 50: "gold", 55: "emerald", 60: "diamond", 65: "blue sapphire", 70: "platinum", 75: "diamond & gold",
};
for (let n = 1; n <= 75; n++) {
  if (n > 40 && n % 5 !== 0) continue;
  const gift = GIFTS[n] ? ` (${GIFTS[n]})` : "";
  add("birthday", "Wedding anniversaries", "💍", `${ordinal(n)} wedding anniversary${gift}`, `${ordinal(n)} wedding anniversary with {person}`, ADULT, `wedding_${n}`);
}
for (let n = 1; n <= 50; n++) {
  if (n > 20 && n % 5 !== 0) continue;
  add("birthday", "Together anniversaries", "💞", `${n} year${n > 1 ? "s" : ""} together`, `${n} year${n > 1 ? "s" : ""} together with {person}`, GROWN, `together_${n}`);
}
for (const [label, slug] of [["24 hours", "1d"], ["1 week", "1w"], ["30 days", "30d"], ["60 days", "60d"], ["90 days", "90d"], ["6 months", "6m"], ["9 months", "9m"]] as const)
  add("health", "Sobriety milestones", "🌱", `${label} sober`, "", GROWN, `sober_${slug}`);
for (let n = 1; n <= 40; n++) {
  if (n > 10 && n % 5 !== 0) continue;
  add("health", "Sobriety milestones", "🌱", `${n} year${n > 1 ? "s" : ""} sober`, "", GROWN, `sober_${n}y`);
}

// One catch-all per category, keyed by the category id, so old posts and
// "something else" both have a home.
for (const c of CATEGORIES) {
  const t: LifeEventTemplate = { id: c.id, category: c.id, group: "Other", emoji: c.emoji, label: `Other ${c.label.toLowerCase()} event`, title: "", stages: ALL_STAGES };
  if (!byId.has(c.id)) {
    TEMPLATES.push(t);
    byId.set(c.id, t);
  }
}

/** Phase-2 life-event keys that are not category ids. */
const ALIASES: Record<string, string> = { work: "career" };

export const LIFE_EVENTS: readonly LifeEventTemplate[] = TEMPLATES;
export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

/** The template for a stored event type, falling back to the "Other" catch-all. */
export function lifeEvent(id: string): LifeEventTemplate {
  return byId.get(ALIASES[id] ?? id) ?? byId.get("other")!;
}

/** A category's sub-groups (for roles: the roles), in catalog order. */
export function groupsOf(category: string): { name: string; emoji: string; count: number }[] {
  const out = new Map<string, { name: string; emoji: string; count: number }>();
  for (const t of TEMPLATES) {
    if (t.category !== category) continue;
    const g = out.get(t.group) ?? { name: t.group, emoji: GROUP_EMOJI.get(`${category}/${t.group}`) ?? t.emoji, count: 0 };
    g.count++;
    out.set(t.group, g);
  }
  return [...out.values()];
}

/** Count of templates per category, for the picker's sidebar. */
export const CATEGORY_COUNTS = new Map(CATEGORIES.map((c) => [c.id, TEMPLATES.filter((t) => t.category === c.id).length]));

// ── Placeholders ─────────────────────────────────────────────────────────────

export type FieldKind = "person" | "place" | "number" | "text";
export interface TemplateField {
  /** The placeholder as written, e.g. "what:book title". */
  key: string;
  kind: FieldKind;
  label: string;
}

const PLACE_KEYS = new Set(["place", "school", "org", "company", "team"]);

export function fieldsOf(title: string): TemplateField[] {
  const out: TemplateField[] = [];
  for (const [, key] of title.matchAll(/\{([^}]+)\}/g)) {
    if (out.some((f) => f.key === key)) continue;
    const [name, hint] = key.split(":");
    const kind: FieldKind = name === "person" || name === "partner" || name === "grandparent" ? "person" : PLACE_KEYS.has(name) ? "place" : name === "n" ? "number" : "text";
    const label = hint ?? { person: "Who", partner: "Partner", grandparent: "Grandparent", place: "Where", school: "School", org: "Organisation", company: "Company", team: "Team", n: "Number" }[name] ?? name;
    out.push({ key, kind, label: label[0].toUpperCase() + label.slice(1) });
  }
  return out;
}

/** Every life event of a milestone post: the main one, then any combined ones. */
export const eventsOf = (post: { eventType: string; alsoEventTypes?: string[] }) => [post.eventType, ...(post.alsoEventTypes ?? [])].filter(Boolean);

/** "Graduated from X", "Got engaged to Y" → "Graduated from X and got engaged to Y". */
export function combineTitles(titles: string[]): string {
  const parts = titles
    .filter(Boolean)
    // Lower-case the start of later parts, but not names or acronyms ("Visited Japan", "IVF").
    .map((t, i) => (i > 0 && /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t));
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The title with every placeholder filled in, or `null` when one is still empty. */
export function fillTitle(template: LifeEventTemplate, values: Record<string, string>): string | null {
  let missing = false;
  const filled = template.title.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const v = values[key]?.trim();
    if (!v) missing = true;
    return v ?? "";
  });
  return missing ? null : filled;
}

// ── Search ───────────────────────────────────────────────────────────────────

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const haystacks = new Map(TEMPLATES.map((t) => [t.id, fold(`${t.label} ${t.group} ${categoryOf(t.category).label} ${t.title.replace(/\{[^}]*\}/g, "")}`)]));

/** Templates matching every word of `query`, best first: label starts, then word starts, then anywhere. */
export function searchLifeEvents(query: string, opts: { category?: string; group?: string; stage?: Stage; tone?: Tone } = {}): LifeEventTemplate[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const scored: [LifeEventTemplate, number][] = [];
  for (const t of TEMPLATES) {
    if (opts.category && t.category !== opts.category) continue;
    if (opts.group && t.group !== opts.group) continue;
    if (opts.tone && t.tone !== opts.tone) continue;
    if (opts.stage && !t.stages.includes(opts.stage)) continue;
    if (words.length === 0) {
      scored.push([t, 0]);
      continue;
    }
    const hay = haystacks.get(t.id)!;
    const label = fold(t.label);
    let score = 0;
    for (const w of words) {
      if (!hay.includes(w)) {
        score = -1;
        break;
      }
      score += label.startsWith(w) ? 3 : new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label) ? 2 : label.includes(w) ? 1 : 0;
    }
    if (score >= 0) scored.push([t, score]);
  }
  if (words.length === 0) return scored.map(([t]) => t);
  return scored.sort((a, b) => b[1] - a[1] || a[0].label.length - b[0].label.length).map(([t]) => t);
}
