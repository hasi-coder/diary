// Shared vocabularies: the things life events and activities talk about.
// "Became {role}", "Visited {country}" (life events) and "working as {role}",
// "wearing {clothing}" (activities) all pick from these lists, so each thing is
// listed once. Ids are stored in posts (`travel.visited@jp`): never change one.
import { MORE_ROLES, ROLES } from "./lifeEventRoles";

export type VocabKind =
  | "role"
  | "clothing"
  | "occasion"
  | "moment"
  | "spicy"
  | "struggle"
  | "sport"
  | "race"
  | "hobby"
  | "instrument"
  | "language"
  | "country"
  | "pet"
  | "exam"
  | "degree"
  | "subject";

export interface Thing {
  kind: VocabKind;
  id: string;
  emoji: string;
  /** For lists and chips: "Saree", "Office party". */
  label: string;
  /** In a sentence: "a saree", "an office party", "the Netherlands". */
  phrase: string;
  /** Roles only: a student role (school life) rather than a job (work life). */
  student?: boolean;
}

export const KINDS: Record<VocabKind, { label: string; plural: string; any: string }> = {
  role: { label: "Role", plural: "roles", any: "a role" },
  clothing: { label: "Clothing", plural: "clothes", any: "something" },
  occasion: { label: "Occasion", plural: "occasions", any: "an occasion" },
  moment: { label: "Moment", plural: "moments", any: "a moment" },
  spicy: { label: "Spicy", plural: "spicy moments", any: "something spicy" },
  struggle: { label: "Hard time", plural: "hard times", any: "something hard" },
  sport: { label: "Sport", plural: "sports", any: "a sport" },
  race: { label: "Race", plural: "races", any: "a race" },
  hobby: { label: "Hobby", plural: "hobbies", any: "a hobby" },
  instrument: { label: "Instrument", plural: "instruments", any: "an instrument" },
  language: { label: "Language", plural: "languages", any: "a language" },
  country: { label: "Country", plural: "countries", any: "a country" },
  pet: { label: "Pet", plural: "pets", any: "a pet" },
  exam: { label: "Exam", plural: "exams", any: "an exam" },
  degree: { label: "Degree", plural: "degrees", any: "a degree" },
  subject: { label: "Subject", plural: "subjects", any: "a subject" },
};

export const isVocabKind = (name: string): name is VocabKind => name in KINDS;

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\{[^}]*\}/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const aOrAn = (s: string) => (/^(?:[aeio]|u(?!ni|s[eu])|hour|honou?r)/i.test(s) ? "an" : "a");
/** "saree" → "a saree"; plurals ("heels") and names ("Vesak") take no article. */
const withArticle = (s: string) => (/^[A-Z]/.test(s) || (/s$/.test(s) && !/ss$/.test(s)) ? s : `${aOrAn(s)} ${s}`);

/**
 * Parses "emoji name|emoji name|…". A name may carry its own sentence form
 * after "=": "jeans=a pair of jeans". Names without an emoji use `fallback`.
 */
function list(kind: VocabKind, source: string, fallback: string, phrase: (name: string) => string = (n) => n, id = (name: string) => slugify(name)): Thing[] {
  return source
    .split("|")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((entry) => {
      const icon = /^(\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]*)\s+(.*)$/u.exec(entry);
      const [name, own] = (icon ? icon[2] : entry).split("=");
      return { kind, id: id(name), emoji: icon?.[1] ?? fallback, label: capitalize(name), phrase: own ?? phrase(name) };
    });
}

// ── Roles: every role with milestones in lifeEventRoles.ts, plus professions ──

/** Sentence forms for role headings that don't read well lower-cased. */
const ROLE_PHRASES: Record<string, string> = {
  "Student — boys' school": "a boys' school student",
  "Student — girls' school": "a girls' school student",
  "Student — mixed school": "a school student",
  "Flight attendant / air hostess": "a flight attendant",
  "Beautician & makeup artist": "a beautician",
  "Fashion designer & tailor": "a fashion designer",
  "Receptionist & office worker": "a receptionist",
  "Secretary & personal assistant": "a secretary",
  "Typist & stenographer": "a typist",
  "Government clerk & officer": "a government officer",
  "Bus conductor & driver": "a bus conductor",
  "Tea plucker & estate worker": "a tea plucker",
  "Housemaid & domestic worker": "a domestic worker",
  "Waiter & waitress": "a waiter",
  "Homemaker & stay-at-home parent": "a homemaker",
  "Preschool & Montessori teacher": "a preschool teacher",
  "Nanny & caregiver": "a nanny",
  "Part-time job (while studying)": "a part-timer",
  "Working abroad": "a migrant worker",
  "Armed forces": "a member of the armed forces",
  "Garment factory worker": "a garment worker",
  "Post office worker": "a postal worker",
  "Sex worker & escort": "a sex worker",
  "Sex educator & intimacy coordinator": "a sex educator",
};

/** Role headings ("# 🧑‍⚕️ Nurse") in the role milestone lists, in order. */
export const ROLE_GROUPS: Thing[] = (() => {
  const seen = new Set<string>();
  const out: Thing[] = [];
  for (const m of `${ROLES}\n${MORE_ROLES}`.matchAll(/^# (\p{Extended_Pictographic}[\p{Extended_Pictographic}‍️\p{Emoji_Modifier}]*)\s+(.+)$/gmu)) {
    const [, emoji, label] = m;
    const id = slugify(label);
    if (seen.has(id)) continue;
    seen.add(id);
    const phrase = ROLE_PHRASES[label] ?? withArticle(label.charAt(0).toLowerCase() + label.slice(1));
    out.push({ kind: "role", id, emoji, label, phrase, student: /^(Student|University student)/.test(label) });
  }
  return out;
})();

const PROFESSIONS = `🧑‍⚕️ doctor|🧑‍⚕️ nurse|🧑‍⚕️ midwife|🧑‍⚕️ surgeon|🧑‍⚕️ paramedic|🧑‍⚕️ pharmacist|🦷 dentist|🧑‍⚕️ physiotherapist|🧠 psychologist|🧠 therapist|🧑‍⚕️ veterinarian|🧑‍🏫 teacher|🧑‍🏫 lecturer|🧑‍🏫 professor|🧑‍🏫 tutor|🧑‍🏫 early-years educator|🧑‍🔬 scientist|🧑‍🔬 researcher|🧑‍💻 software engineer|🧑‍💻 developer|🧑‍💻 data scientist|🧑‍💻 designer|🧑‍💻 product manager|🧑‍💻 engineering manager|🛡️ security engineer|🧑‍🔧 engineer|🏗️ civil engineer|⚡ electrical engineer|🛠️ mechanical engineer|🏛️ architect|🧑‍⚖️ lawyer|🧑‍⚖️ judge|🧑‍⚖️ paralegal|📊 accountant|📈 financial analyst|🏦 banker|💼 consultant|📣 marketer|📰 journalist|📸 photographer|🎬 filmmaker|🎭 actor|🎤 musician|🎨 artist|✍️ writer|📚 librarian|🧑‍🍳 chef|🍰 baker|☕ barista|🍸 bartender|🍽️ server|🛒 shop assistant|🏪 shopkeeper|💇 hairdresser|💅 beautician|💆 massage therapist|🏋️ personal trainer|🧘 yoga teacher|⚽ professional athlete|🧑‍🌾 farmer|🌿 gardener|🔧 mechanic|🔌 electrician|🚰 plumber|🪚 carpenter|🧱 builder|🎨 painter and decorator|🚚 driver|🚕 taxi driver|🛵 delivery rider|✈️ pilot|🛫 flight attendant|🚢 sailor|🚂 train driver|🧑‍🚒 firefighter|👮 police officer|🪖 soldier|🛡️ security guard|🏛️ civil servant|🗳️ politician|🧑‍💼 entrepreneur|🧑‍💼 freelancer|🧑‍💼 executive assistant|📞 customer-service agent|🧑‍🏭 factory worker|🧹 cleaner|🧑‍🍼 nanny|🧓 carer|🧑‍⚕️ social worker|🙏 priest|🙏 monk|🙏 nun|🙏 imam|🙏 rabbi|🎙️ podcaster|📹 content creator|🎮 streamer|🧑‍🔬 lab technician|🏠 estate agent|🧾 tax adviser|📦 warehouse worker|🧵 tailor|👗 fashion designer|💍 jeweller|🪡 seamstress|🌍 diplomat|🧑‍✈️ air-traffic controller|🗺️ tour guide|🏨 hotel manager|🧑‍🏫 headteacher|🧑‍⚕️ dietitian|🧑‍⚕️ optometrist|🩻 radiographer|🧑‍⚕️ occupational therapist|🧑‍⚕️ speech therapist|🧑‍🔬 pharmacologist|🦺 health-and-safety officer|🔥 welder|🧑‍🌾 fisher|🌳 forester|🐄 dairy farmer|🍵 tea planter|🧑‍🎨 tattoo artist|🎪 performer|🃏 magician|🧑‍🏫 driving instructor|🧑‍💻 IT support|🧑‍💻 DevOps engineer|🧑‍💻 UX researcher|📈 investor|🧾 auditor|🏛️ curator|📜 historian|🗣️ translator|🗣️ interpreter|🧑‍⚖️ mediator|🧑‍🤝‍🧑 community organiser|🏳️ charity worker|🧑‍🚀 astronaut|💃 stripper|📹 cam model|👙 lingerie model|📸 glamour model|🎨 nude art model|⛓️ dominatrix|✍️ erotic writer|🤸 pole dance instructor|💋 escort|🎬 adult film director`;

// Professions that already have a role heading ("flight attendant" → "Flight attendant / air hostess").
const roleIds = new Set(ROLE_GROUPS.map((r) => r.id));
const coveredBy = (id: string) => ROLE_GROUPS.find((r) => r.id === id || r.id.startsWith(`${id}_`));

const ROLE_LIST: Thing[] = [
  ...ROLE_GROUPS,
  ...list("role", PROFESSIONS, "💼", (p) => `${aOrAn(p)} ${p}`).filter((p) => !roleIds.has(p.id) && !coveredBy(p.id)),
];

// ── Clothing, occasions and everyday moments ──

const CLOTHING = `🥻 saree|🥻 osariya (Kandyan saree)=an osariya|🥻 half-saree|👗 lehenga|👗 salwar kameez|👗 kurta|👘 kimono|👗 hanbok|👗 cheongsam|👗 kebaya|🧕 hijab|🧕 abaya|🧥 sarong|👔 national dress=national dress|👕 T-shirt|👔 shirt|👚 blouse|👗 dress|👗 little black dress|👗 maxi dress|👗 sundress|👗 ball gown|👰 wedding dress|🤵 wedding suit|🤵 nilame outfit|👔 suit|👔 tie|🎀 bow tie|🧥 blazer|🧥 jacket|🧥 leather jacket|🧥 coat|🧣 scarf|👖 jeans=jeans|👖 trousers=trousers|🩳 shorts=shorts|👗 skirt|👗 mini skirt|🩱 swimsuit|👙 bikini|🩲 swimming trunks=swimming trunks|🩱 lingerie=lingerie|👘 robe|🩴 slippers=slippers|👟 sneakers=sneakers|👠 heels=heels|👢 boots=boots|🥿 flats=flats|🧢 cap|👒 hat|🕶️ sunglasses=sunglasses|💍 ring|📿 necklace|💎 earrings=earrings|⌚ watch|👜 handbag|🎒 backpack|🏫 school uniform|🩺 nurse's uniform|🥼 white coat|✈️ cabin-crew uniform|👮 police uniform|🪖 military uniform|⚖️ court gown|🎓 graduation gown|🧑‍🍳 chef's whites=chef's whites|🦺 work uniform|🏋️ gym clothes=gym clothes|🩳 pyjamas=pyjamas|🎭 costume|🏳️‍⚧️ gender-affirming outfit|👗 matching outfits=matching outfits|🧶 hand-knitted jumper|♻️ thrifted outfit|👗 designer outfit|🪖 turban|🕶️ my favourite outfit=my favourite outfit|👗 something new=something new|🩱 mother's saree=my mother's saree`;

const OCCASIONS = `🎉 party|🏢 office party|🎄 office Christmas party|🎂 birthday party|👶 baby shower|👰 bridal shower|🍾 bachelor party|🍾 bachelorette party|💍 engagement party|💒 wedding|💒 wedding reception|🏠 homecoming|🏡 housewarming|🎓 graduation|🎓 convocation|🏫 school prize-giving|🏫 school concert|🏫 sports meet|🏫 parents' meeting|🏫 school reunion|🏫 past pupils' day|🏫 big match|💃 prom|💃 dance|🎤 concert|🎪 carnival|🎭 play|🎬 film premiere|🏟️ match|🏃 race|🏛️ conference|💼 job interview|💼 meeting|💼 workshop|💼 team outing|💼 business trip|🍽️ dinner party|🍽️ family dinner|🍽️ date|☕ coffee date|🍻 night out|🎤 karaoke night|🎮 game night|🎲 board-game night|🎬 movie night|🏖️ beach party|🔥 BBQ|🧺 picnic|🏕️ camping trip|🚗 road trip|✈️ holiday|🛍️ shopping trip|💆 spa day|🕯️ funeral|🕯️ memorial service|🍚 almsgiving|📿 pirith ceremony|🛕 temple festival|⛪ church service|🕌 Friday prayers=Friday prayers|☸️ Vesak|☸️ Poson|☀️ Avurudu|🪔 Diwali|🪔 Thai Pongal|🕌 Eid|🌙 Iftar|🎄 Christmas|🐣 Easter|🧧 Lunar New Year|🎆 New Year's Eve|❤️ Valentine's Day|👩 Mother's Day|👨 Father's Day|🧑‍🏫 Teachers' Day|🧒 Children's Day|🏳️‍🌈 Pride|🎃 Halloween|🦃 Thanksgiving|🗳️ election day|✊ protest|🤝 charity event|🏥 hospital visit|🩺 doctor's appointment|💇 salon appointment|📸 photoshoot|🎨 exhibition|📚 book launch|🧑‍🍳 cooking class|🧘 yoga retreat|🎉 reunion|🎉 surprise party|🎉 farewell party|🎉 welcome party|🎉 retirement party|🪔 dansala|🎨 Holi|🪔 Navaratri|🕉️ Shivaratri|🧵 Raksha Bandhan|🕌 Eid al-Adha|🕎 Hanukkah|✡️ Yom Kippur|🍷 Passover seder|🪯 Vaisakhi|🏮 Mid-Autumn Festival|🏮 Qingming|🎎 Obon|⛩️ Hatsumōde|🕯️ Day of the Dead|🌍 Kwanzaa|🌙 Nowruz|🌞 solstice celebration|👪 family reunion|📸 family photo shoot|🧘 meditation retreat|🤫 silent retreat|🎒 backpacking trip|🏝️ island holiday|🧳 solo trip|🐋 whale-watching trip|🐘 elephant sanctuary visit|🧹 community clean-up|🩺 annual check-up|💻 workation|🍰 workplace birthday surprise|💑 romantic getaway|👯 friends' trip|🛍️ shopping trip with Mum=a shopping trip with Mum|🗽 famous landmark|🎂 children's party`;

const MOMENTS = `☕ perfect morning coffee|🌅 sunrise|🌇 beautiful sunset|🌧️ rainy day in|🌈 rainbow|📚 good book|🎬 movie night|🎶 song on repeat|😂 laugh attack|💌 lovely message|🎁 small surprise|😊 kind stranger|💐 bunch of flowers|🛁 long bath|😴 lie-in|🧘 quiet moment|🍀 lucky find|💇 good hair day|💪 productive day|🧹 big clean-up|🪴 new plant|🛋️ furniture rearrange|🧺 laundry day|🔧 DIY fix|🔌 power cut|🏠 lazy Sunday|👨‍👩‍👧 family dinner|📺 binge-watch|📞 long call with family|🧑‍🍳 cook-up for everyone|🍳 new recipe|🍰 baking session|🍜 new favourite place|🥘 taste of home|🍛 rice and curry|🍦 ice cream|🍕 pizza night|🍵 evening tea|🥂 celebratory drink|🚶 long walk|🚦 traffic jam|🛒 big grocery run|🛍️ shopping day|🎡 day out|🏖️ beach day|⛰️ weekend hike|💵 payday|📝 exam day|✅ to-do list ticked off|🎉 Friday feeling|🏁 big task finished|🌙 late night at work|🏡 work-from-home day|🥰 lovely day|🙏 grateful day|🌱 small win|💭 big realisation|🌙 date night|🛏️ lazy morning in bed|💋 stolen kiss|🍷 candlelit dinner|🫂 long cuddle|💃 girls' night|🍻 boys' night|🎮 game night|💆 spa day|🔥 BBQ|🧺 picnic|🏨 staycation|🧁 cheat day|🏋️ gym day|🛌 sick day|😞 bad day|😢 good cry|😤 argument|🤝 making up|😰 anxious day|😴 sleepless night|🔑 lost-keys morning|📱 broken phone|🚗 breakdown|💸 tight month|😔 lonely evening|🫠 overwhelming week|🍀 lucky day|☀️ perfect day|🎉 little celebration|📖 bedtime story|🎨 craft afternoon|🏕️ backyard camp-out|🔧 fix-it afternoon|👗 matching-outfits day|🧹 decluttering weekend|🎨 painting weekend`;

/** Spicy and naughty: complete "-ing" clauses, so they read after is/was ("was making out with Dev"). */
const SPICY = `😏 flirting|😏 flirting shamelessly|💋 kissing|🌧️ kissing in the rain|💋 kissing a stranger|💋 making out|🚗 making out in the car|🤝 holding hands|🫂 cuddling|💃 slow dancing|💃 dirty dancing|💌 passing love notes|💌 writing a love letter|😍 having a crush|☕ crushing on a colleague|😏 crushing on the boss|🏢 having a workplace romance|🤫 having an office affair|🌍 having a holiday romance|✈️ having a layover romance|🌙 having a night-shift romance|🤫 seeing someone in secret|🌙 sneaking out to see someone|😳 getting caught|📱 getting someone's number|💬 getting asked out|💬 asking someone out|☕ going on a first date|🙈 going on a blind date|📱 swiping on dating apps|📱 sexting|📸 sending a risky photo|🌊 skinny dipping|🍸 hooking up|🍸 hooking up at a party|🌙 having a one-night stand|🛏️ being friends with benefits|🤷 being in a situationship|📞 having a late-night booty call|🌅 doing the walk of shame|🏨 spending a weekend in a hotel room|🛏️ having a lazy morning in bed|🔥 having a spontaneous afternoon|😈 having the best night ever|🎁 planning a lingerie surprise|🎭 having a role-play night|🔥 trying something new in bed|🧸 trying a new toy|🗝️ exploring a kink|💞 having a threesome|✈️ joining the mile-high club|🚿 showering together|🛍️ visiting an adult store|📸 doing a boudoir shoot|📸 doing intimate poses|💑 getting intimate|😌 having quality time together|🔁 sleeping with an ex|📱 drunk-texting an ex|💐 getting flowers from a secret admirer|💃 feeling the chemistry with my dance partner`;

/** Hard times happening now (or then), as "-ing" clauses: "was crying in the supply room". */
const STRUGGLES = `😢 crying|😢 crying at work|😓 having the toughest day at work|🌙 pulling an all-nighter|🏥 working a 36-hour shift|🔁 pulling a double shift|🤔 thinking about quitting|💸 running out of money|😤 dealing with a difficult boss|😤 dealing with a difficult customer|😤 dealing with an unruly passenger|⚖️ feeling the pressure to look perfect|😤 having a jealousy fight|😤 fighting with my partner|👊 fighting with my sibling|💔 going through a breakup|🕊️ grieving|🌱 healing|🏥 waiting for test results|🏥 sitting by a hospital bed|🔍 job hunting|📚 studying all night for exams|😰 panicking|😔 struggling to get out of bed|🫠 burning out|💊 recovering|🧳 missing home|🌧️ getting through a hard week`;

// ── Lists shared with the life-event generators ──

const COUNTRIES = `af Afghanistan|al Albania|dz Algeria|ad Andorra|ao Angola|ag Antigua and Barbuda|ar Argentina|am Armenia|au Australia|at Austria|az Azerbaijan|bs the Bahamas|bh Bahrain|bd Bangladesh|bb Barbados|by Belarus|be Belgium|bz Belize|bj Benin|bt Bhutan|bo Bolivia|ba Bosnia and Herzegovina|bw Botswana|br Brazil|bn Brunei|bg Bulgaria|bf Burkina Faso|bi Burundi|cv Cabo Verde|kh Cambodia|cm Cameroon|ca Canada|cf the Central African Republic|td Chad|cl Chile|cn China|co Colombia|km Comoros|cg the Congo|cd the DR Congo|cr Costa Rica|ci Côte d'Ivoire|hr Croatia|cu Cuba|cy Cyprus|cz Czechia|dk Denmark|dj Djibouti|dm Dominica|do the Dominican Republic|ec Ecuador|eg Egypt|sv El Salvador|gq Equatorial Guinea|er Eritrea|ee Estonia|sz Eswatini|et Ethiopia|fj Fiji|fi Finland|fr France|ga Gabon|gm the Gambia|ge Georgia|de Germany|gh Ghana|gr Greece|gd Grenada|gt Guatemala|gn Guinea|gw Guinea-Bissau|gy Guyana|ht Haiti|hn Honduras|hu Hungary|is Iceland|in India|id Indonesia|ir Iran|iq Iraq|ie Ireland|il Israel|it Italy|jm Jamaica|jp Japan|jo Jordan|kz Kazakhstan|ke Kenya|ki Kiribati|kw Kuwait|kg Kyrgyzstan|la Laos|lv Latvia|lb Lebanon|ls Lesotho|lr Liberia|ly Libya|li Liechtenstein|lt Lithuania|lu Luxembourg|mg Madagascar|mw Malawi|my Malaysia|mv the Maldives|ml Mali|mt Malta|mh the Marshall Islands|mr Mauritania|mu Mauritius|mx Mexico|fm Micronesia|md Moldova|mc Monaco|mn Mongolia|me Montenegro|ma Morocco|mz Mozambique|mm Myanmar|na Namibia|nr Nauru|np Nepal|nl the Netherlands|nz New Zealand|ni Nicaragua|ne Niger|ng Nigeria|kp North Korea|mk North Macedonia|no Norway|om Oman|pk Pakistan|pw Palau|ps Palestine|pa Panama|pg Papua New Guinea|py Paraguay|pe Peru|ph the Philippines|pl Poland|pt Portugal|qa Qatar|ro Romania|ru Russia|rw Rwanda|kn Saint Kitts and Nevis|lc Saint Lucia|vc Saint Vincent and the Grenadines|ws Samoa|sm San Marino|st São Tomé and Príncipe|sa Saudi Arabia|sn Senegal|rs Serbia|sc Seychelles|sl Sierra Leone|sg Singapore|sk Slovakia|si Slovenia|sb the Solomon Islands|so Somalia|za South Africa|kr South Korea|ss South Sudan|es Spain|lk Sri Lanka|sd Sudan|sr Suriname|se Sweden|ch Switzerland|sy Syria|tw Taiwan|tj Tajikistan|tz Tanzania|th Thailand|tl Timor-Leste|tg Togo|to Tonga|tt Trinidad and Tobago|tn Tunisia|tr Türkiye|tm Turkmenistan|tv Tuvalu|ug Uganda|ua Ukraine|ae the United Arab Emirates|gb the United Kingdom|us the United States|uy Uruguay|uz Uzbekistan|vu Vanuatu|va Vatican City|ve Venezuela|vn Vietnam|ye Yemen|zm Zambia|zw Zimbabwe|hk Hong Kong|mo Macau|pr Puerto Rico|gl Greenland|fo the Faroe Islands|aq Antarctica`;

/** "lk" → 🇱🇰 */
const flag = (code: string) => String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const COUNTRY_LIST: Thing[] = COUNTRIES.split("|").map((entry) => {
  const code = entry.slice(0, 2);
  const name = entry.slice(3);
  return { kind: "country", id: code, emoji: flag(code), label: name.replace(/^the /, ""), phrase: name };
});

const SPORTS = `⚽ football|🏏 cricket|🏀 basketball|🏐 volleyball|🏉 rugby|🏈 American football|⚾ baseball|🥎 softball|🎾 tennis|🏸 badminton|🏓 table tennis|🎾 squash|🎾 padel|🥒 pickleball|🏑 field hockey|🏒 ice hockey|🥍 lacrosse|🤾 handball|🏐 netball|🏊 swimming|🤽 water polo|🤿 free diving|🏄 surfing|🏄 bodyboarding|🪁 kitesurfing|🏄 windsurfing|🏄 paddleboarding|🚣 rowing|🛶 kayaking|🛶 canoeing|⛵ sailing|🚤 waterskiing|🏃 running|🏃 trail running|🏃 sprinting|🏃 cross-country|🏃 track and field|🦘 long jump|🏋️ weightlifting|🏋️ powerlifting|🏋️ CrossFit|💪 bodybuilding|🤸 gymnastics|🤸 calisthenics|🤸 parkour|🧘 yoga|🧘 Pilates|🥊 boxing|🥋 karate|🥋 judo|🥋 taekwondo|🥋 Brazilian jiu-jitsu|🥋 kung fu|🥋 aikido|🥋 kickboxing|🥋 Muay Thai|🥋 MMA|🤺 fencing|🤼 wrestling|🥋 angampora|🥋 kalaripayattu|🥋 capoeira|🚴 cycling|🚵 mountain biking|🚴 BMX|🛹 skateboarding|🛼 roller skating|🛼 roller derby|⛸️ figure skating|⛸️ speed skating|🎿 skiing|🏂 snowboarding|🎿 cross-country skiing|🧗 rock climbing|🧗 bouldering|🧗 mountaineering|🥾 hiking|🏇 horse riding|🏇 show jumping|🏇 polo|⛳ golf|🎳 bowling|🎯 darts|🎱 snooker|🎱 pool|🏹 archery|🎯 shooting|🥏 ultimate frisbee|🥏 disc golf|🏎️ motor racing|🏍️ motocross|🏁 karting|🏐 beach volleyball|🏊 triathlon|🏃 duathlon|🏊 open-water swimming|🧗 obstacle racing|🤸 cheerleading|💃 dancesport|🧊 curling|🛷 bobsleigh|🏋️ kettlebells|🥏 dodgeball|🏏 elle|🪀 kabaddi|🏸 sepak takraw|🎽 orienteering|♟️ chess|🎮 esports`;

const RACES = `🏃 5K|🏃 10K|🏃 parkrun|🏃 half marathon|🏃 marathon|🏃 ultramarathon|🏃 Boston Marathon|🏃 London Marathon|🏃 New York City Marathon|🏃 Colombo Marathon|🏃 Berlin Marathon|🏃 Tokyo Marathon|🏃 Chicago Marathon|🏊 sprint triathlon|🏊 Olympic triathlon|🏊 half Ironman|🏊 Ironman|🚴 century ride|🚴 cycling sportive|🧗 Tough Mudder|🧗 Spartan Race|🏊 open-water mile|🏊 Channel swim|🥾 Three Peaks Challenge|🥾 Camino de Santiago|🏔️ Everest Base Camp trek|🏔️ Kilimanjaro climb|🥾 Inca Trail`;

const LANGUAGES = `Sinhala|Tamil|English|Hindi|Bengali|Urdu|Punjabi|Gujarati|Marathi|Telugu|Kannada|Malayalam|Nepali|Pali|Sanskrit|Mandarin|Cantonese|Japanese|Korean|Vietnamese|Thai|Khmer|Lao|Burmese|Indonesian|Malay|Tagalog|Arabic|Hebrew|Persian|Turkish|Kurdish|Pashto|Dari|Spanish|Portuguese|French|Italian|German|Dutch|Afrikaans|Swedish|Norwegian|Danish|Icelandic|Finnish|Estonian|Latvian|Lithuanian|Polish|Czech|Slovak|Hungarian|Romanian|Bulgarian|Greek|Albanian|Serbian|Croatian|Bosnian|Slovenian|Macedonian|Ukrainian|Russian|Belarusian|Georgian|Armenian|Azerbaijani|Kazakh|Uzbek|Mongolian|Tibetan|Swahili|Amharic|Somali|Yoruba|Igbo|Hausa|Zulu|Xhosa|Shona|Malagasy|Welsh|Irish|Scottish Gaelic|Basque|Catalan|Galician|Maltese|Latin|Ancient Greek|Esperanto|Hawaiian|Māori|Samoan|Quechua|Navajo|Cherokee|Inuktitut|Yiddish|Haitian Creole|American Sign Language|British Sign Language|Sri Lankan Sign Language|Auslan|Braille|Python|JavaScript|Rust`;

const INSTRUMENTS = `🎹 piano|🎸 guitar|🎸 bass guitar|🎸 electric guitar|🎻 violin|🎻 viola|🎻 cello|🎻 double bass|🪕 banjo|🪕 mandolin|🪕 ukulele|🪈 flute|🪈 recorder|🎷 saxophone|🎺 trumpet|🎺 trombone|🎺 French horn|🎺 tuba|🎷 clarinet|🎷 oboe|🎷 bassoon|🥁 drums|🥁 tabla|🥁 djembe|🥁 Kandyan drum (geta bera)|🥁 thammattama|🥁 cajón|🥁 percussion|🎵 harp|🎹 organ|🎹 synthesiser|🎹 harmonium|🪗 accordion|🪗 harmonica|🪕 sitar|🪕 veena|🪕 erhu|🪕 guzheng|🪕 koto|🪕 shamisen|🪕 oud|🎵 bagpipes|🎵 steel pan|🎵 marimba|🎵 xylophone|🎵 handpan|🎧 DJ decks`;

const HOBBIES = `📷 photography|🎥 filmmaking|✍️ creative writing|📝 journaling|📖 poetry|📚 a book club|🎨 painting|🖌️ watercolour|🖍️ drawing|✏️ calligraphy|🏺 pottery|🗿 sculpture|🧶 knitting|🧶 crochet|🧵 sewing|🪡 embroidery|🧵 quilting|🪢 macramé|🪵 woodworking|🔨 carpentry|💍 jewellery making|🕯️ candle making|🧼 soap making|🌸 flower arranging|🌱 gardening|🌵 houseplants|🌳 bonsai|🍳 cooking|🍞 baking|🍞 sourdough|🍷 wine tasting|☕ coffee roasting|🍺 home brewing|🧀 cheese making|🎲 board games|🧩 jigsaw puzzles|🧠 crosswords|♟️ chess|🃏 card games|🎮 gaming|🕹️ retro gaming|🎲 tabletop role-playing|🤖 robotics|🔌 electronics|🖨️ 3D printing|💻 programming|🔭 astronomy|🐦 birdwatching|🦋 butterfly watching|🎣 fishing|🍄 foraging|🪨 rock collecting|🪙 coin collecting|📮 stamp collecting|💿 vinyl collecting|🚂 model trains|✈️ model aircraft|🛩️ drones|🎭 acting|🎤 stand-up comedy|🎤 karaoke|🎤 singing|🎶 music production|💃 dancing|💃 salsa|💃 ballet|💃 hip-hop dance|💃 Kandyan dance|💃 Bharatanatyam|🧙 cosplay|🧘 meditation|🗺️ geocaching|🧳 genealogy|🎨 digital art|🎞️ animation|📹 vlogging|🎙️ podcasting|🧑‍🍳 food blogging|🪁 kite flying|🎯 magic tricks|🌌 stargazing|♻️ upcycling|🐟 aquariums`;

const PETS = `🐶 dog|🐶 puppy|🐱 cat|🐱 kitten|🐰 rabbit|🐹 hamster|🐹 guinea pig|🐭 rat|🐭 mouse|🐿️ chinchilla|🦔 hedgehog|🦦 ferret|🐦 budgie|🦜 parrot|🦜 cockatiel|🐤 canary|🐔 chicken|🦆 duck|🐐 goat|🐑 sheep|🐄 cow|🐖 pig|🐴 horse|🫏 donkey|🦙 alpaca|🐢 tortoise|🐢 turtle|🦎 lizard|🦎 gecko|🦎 bearded dragon|🐍 snake|🐸 frog|🐟 goldfish|🐠 tropical fish|🐝 bees|🕷️ tarantula|🦀 hermit crab`;

const EXAMS = `📝 G.C.E. O/L|📝 G.C.E. A/L|📝 Grade 5 scholarship exam|📝 GCSEs|📝 A-levels|📝 IB Diploma|📝 SAT|📝 ACT|📝 AP exams|📝 gaokao|📝 Suneung (CSAT)|📝 JEE|📝 NEET|📝 Matric|📝 Leaving Cert|📝 Baccalauréat|📝 Abitur|📝 HSC|📝 VCE|📝 NCEA|📝 IELTS|📝 TOEFL|📝 Duolingo English Test|📝 JLPT|📝 HSK|📝 DELF|📝 DELE|📝 Goethe exam|📝 GRE|📝 GMAT|📝 LSAT|📝 MCAT|📝 UCAT|📝 USMLE|📝 PLAB|📝 NCLEX|📝 bar exam|📝 CPA exam|📝 CFA Level I|📝 CFA Level II|📝 CFA Level III|📝 ACCA|📝 CIMA|📝 CA Sri Lanka|📝 PMP|📝 AWS certification|📝 Azure certification|📝 Google Cloud certification|📝 CCNA|📝 CISSP|📝 Scrum Master certification|📝 Six Sigma|📝 ABRSM grade exam|📝 Trinity music exam|🚗 driving theory test|🚗 driving test|🤿 PADI Open Water|🧑‍🚒 first-aid certificate|🧑‍🏫 TEFL|🥋 black-belt grading`;

const DEGREES = `high-school diploma|GED|associate degree|foundation degree|higher national diploma|bachelor's degree|BA|BSc|BEng|LLB|BEd|BBA|MBBS|master's degree|MA|MSc|MBA|MEng|LLM|MPhil|PhD|doctorate|MD|JD|DDS|PharmD|EdD|postgraduate diploma|postgraduate certificate|teaching qualification`;

const SUBJECTS = `computer science|software engineering|medicine|nursing|law|engineering|mechanical engineering|electrical engineering|civil engineering|architecture|business|management|accounting|finance|economics|marketing|psychology|sociology|anthropology|history|philosophy|politics|international relations|English literature|creative writing|linguistics|journalism|media studies|film|music|fine art|graphic design|fashion design|theatre|dance|education|early-childhood education|mathematics|statistics|physics|chemistry|biology|biochemistry|genetics|neuroscience|environmental science|geology|geography|agriculture|veterinary science|pharmacy|dentistry|public health|social work|criminology|religious studies|Buddhist studies|archaeology|data science|artificial intelligence|cybersecurity|hospitality|tourism|sport science|nutrition`;

const article = (n: string) => withArticle(n);
/** Degrees are mostly acronyms ("an MBA", "a BSc"): the article follows the letter's sound. */
const degreeArticle = (d: string) => (/^[A-Z]{2}/.test(d) ? `${/^[AEFHILMNORSX]/.test(d) ? "an" : "a"} ${d}` : `${aOrAn(d)} ${d}`);

export const VOCAB: Record<VocabKind, Thing[]> = {
  role: ROLE_LIST,
  clothing: list("clothing", CLOTHING, "👗", article),
  occasion: list("occasion", OCCASIONS, "🎉", article),
  moment: list("moment", MOMENTS, "✨", article),
  spicy: list("spicy", SPICY, "🌶️"),
  struggle: list("struggle", STRUGGLES, "💔"),
  sport: list("sport", SPORTS, "🏅"),
  race: list("race", RACES, "🏃", (r) => (/^[a-z0-9]/.test(r) ? `${aOrAn(r)} ${r}` : `the ${r}`)),
  hobby: list("hobby", HOBBIES, "✨"),
  instrument: list("instrument", INSTRUMENTS, "🎵", (i) => `the ${i}`),
  language: list("language", LANGUAGES, "🗣️"),
  country: COUNTRY_LIST,
  pet: list("pet", PETS, "🐾", article),
  exam: list("exam", EXAMS, "📝", (x) => `the ${x}`),
  degree: list("degree", DEGREES, "🎓", degreeArticle),
  subject: list("subject", SUBJECTS, "📚"),
};

const index = new Map(Object.values(VOCAB).flatMap((items) => items.map((t) => [`${t.kind}:${t.id}`, t] as const)));
// Professions merged into a role heading still resolve: "flight_attendant" → "Flight attendant / air hostess".
for (const p of list("role", PROFESSIONS, "💼")) {
  const role = coveredBy(p.id);
  if (role && !index.has(`role:${p.id}`)) index.set(`role:${p.id}`, role);
}

export const thing = (kind: VocabKind, id: string) => index.get(`${kind}:${id}`);

/** The thing whose label (or sentence form) is exactly `text`, ignoring case. */
export function findThing(kinds: VocabKind[], text: string): Thing | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  for (const kind of kinds) {
    const hit = VOCAB[kind].find((x) => x.label.toLowerCase() === t || x.phrase.toLowerCase() === t);
    if (hit) return hit;
  }
  return undefined;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Things of the given kinds containing every word of `query`, labels starting with it first. */
export function searchThings(kinds: VocabKind[], query: string, limit = 60): Thing[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const all = kinds.flatMap((k) => VOCAB[k]);
  if (words.length === 0) return all.slice(0, limit);
  return all
    .filter((t) => words.every((w) => fold(t.label).includes(w)))
    .sort((a, b) => Number(!fold(a.label).startsWith(words[0])) - Number(!fold(b.label).startsWith(words[0])))
    .slice(0, limit);
}
