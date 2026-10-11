// Role-based life events: pick a role (a school, a job), then its own
// milestones, from getting in and the first uniform to leaving. Same format as
// lifeEvents.ts: `# emoji Role` starts a role, then `emoji Label | title | stages`.
// Ids are `roles.<role>_<event>`, so never rename a role or an event label.

export const ROLES = String.raw`
@roles
# 👦 Student — boys' school
🏫 Got into a boys' school | Got into {school} | c
👔 First day in the school uniform | | c
👔 Wore my first school tie | | c
🎒 First day at {school} | | c
🏏 Made the school cricket team | | ct
🏉 Made the school rugby team | | ct
🥁 Joined the school band or cadets | | ct
🏆 Big match / Battle of the Blues | Watched the {what:big match} | ct
🎖️ Got my prefect badge | | t
👑 Became head prefect | | t
🤝 Old boys' day | | tyame
🧑‍🤝‍🧑 Made lifelong friends at school | | ct
📝 Sat the O/L | | t
📝 Sat the A/L | | t
😬 Detention or caning | | ct
🎓 Last day of school | | t
👔 Wore the old boys' tie | | tyame
# 👧 Student — girls' school
🏫 Got into a girls' school | Got into {school} | c
👗 First day in the white uniform | | c
🎀 First school ribbons and plaits | | c
🎒 First day at {school} | | c
🏐 Made the school netball team | | ct
🎶 Joined the school choir | | ct
💃 Danced at the school concert | | ct
🧕 Joined the Girl Guides | | ct
🎖️ Got my prefect badge | | t
👑 Became head girl | | t
🧑‍🤝‍🧑 Made lifelong friends at school | | ct
📝 Sat the O/L | | t
📝 Sat the A/L | | t
🥻 Wore a saree to the school prize-giving | | t
🎓 Last day of school | | t
🤝 Past pupils' day | | tyame
# 🧒 Student — mixed school
🎒 First day at {school} | | c
👕 First day in the school uniform | | c
🧑‍🤝‍🧑 First best friend at school | Became best friends with {person} | c
💌 First school crush | | ct
🎖️ Became a prefect | | t
🏅 Sports day win | | ct
📝 Sat the O/L | | t
📝 Sat the A/L | | t
🎓 Last day of school | | t
🎓 School leavers' party | | t
# 🧑‍🎓 University student
📩 Got my university admission | Admitted to {school} | ty
🎒 First day at university | First day at {school} | ty
🏛️ Moved into the hostel / halls | | ty
😬 Survived ragging / freshers' week | | ty
🧑‍🤝‍🧑 Met my batchmates | | ty
👕 Got the batch T-shirt | | ty
📚 First all-nighter | | ty
📝 First semester exams | | ty
😓 Failed a module | | ty
🔁 Passed a repeat exam | | ty
🧑‍💻 Final-year project | | ty
🏢 Started an internship | Started an internship at {company} | ty
🎭 Joined a society | Joined {org} | ty
🏆 Represented the university | | ty
💞 Campus romance | | ty
🎉 Batch trip | Batch trip to {place} | ty
🎓 Wore the graduation gown | | yame
🎓 Convocation | | yame
👨‍👩‍👧 Parents at my graduation | | yame
# 🧑‍💻 Intern software engineer
📨 Applied for internships | | ty
🎤 First technical interview | | ty
🤝 Got an internship offer | Internship offer from {company} | ty
🪪 First day as an intern | First day at {company} | ty
💻 Got my first work laptop | | ty
👕 Got the company swag | | ty
🧑‍🏫 Met my mentor | Met my mentor {person} | ty
🔧 Set up my dev environment | | ty
✅ First pull request merged | | ty
🐛 Fixed my first bug | | ty
🚀 First deploy to production | | ty
💥 Broke the build | | ty
🎤 Intern demo day | | ty
🍕 First team lunch | | ty
💵 First intern stipend | | ty
⭐ Good internship review | | ty
🎉 Got a full-time offer | Full-time offer from {company} | ty
👋 Last day of internship | | ty
# 🧑‍💻 Software engineer
💼 First job as a software engineer | Joined {company} | yame
🧑‍💻 First code review given | | yame
📟 First on-call rotation | | yame
🔥 Survived my first production incident | | yame
📈 Promoted to senior engineer | | yame
📈 Became a tech lead | | yame
📈 Became a staff or principal engineer | | yame
🧑‍💼 Became an engineering manager | | yame
🎤 Gave my first tech talk | | yame
🌍 Open-source maintainer | | yame
🚀 Joined a startup | Joined {company} | yame
🏢 Joined a big tech company | Joined {company} | yame
🏡 Went fully remote | | yame
🧑‍💻 Became a CTO | | ame
# 🧑‍🏫 Part-time teacher
📝 Started giving tuition | | tyame
🏠 First home-tuition student | Started tutoring {person} | tyame
🏫 First part-time teaching job | Started teaching at {school} | tyame
💵 First tuition fees earned | | tyame
👩‍🏫 Started my own tuition class | | yame
🧑‍🎓 First batch of my students sat their exams | | yame
🏆 A student got top results | {person} got top results | yame
🖥️ Started teaching online | | yame
📈 Class grew to {n} students | | yame
🤹 Balancing teaching with studies or work | | tyame
# 🧑‍🏫 Primary teacher
🎓 Started teacher training college | | yame
🎓 Qualified as a primary teacher | | yame
🥻 First day teaching in a saree | | yame
👔 First day teaching in my new clothes | | yame
🏫 First appointment | Appointed to {school} | yame
🧒 Met my first class | | yame
🔤 Taught a child to read | | yame
🎨 First classroom decorated | | yame
🎭 Put on the class concert | | yame
🏆 Class did well in the Grade 5 exam | | yame
🧸 A child who changed me | | yame
💐 Teachers' Day gifts | | yame
🔁 Transferred to a new school | Transferred to {school} | yame
👩‍🏫 Became a sectional head | | ame
🕊️ Retired from teaching | | me
# 🧑‍🏫 Teacher
🎓 Started a teaching degree or PGDE | | yame
🎓 Qualified as a teacher | | yame
🏫 First teaching post | Started teaching at {school} | yame
🥻 First day in a saree as a teacher | | yame
👔 First day in a suit as a teacher | | yame
📚 First class of my own | | yame
🧑‍🏫 Became a class teacher | | yame
🗓️ First parents' meeting | | yame
📝 First exam I set | | yame
🧪 Took students on a field trip | | yame
🏆 Students got top results | | yame
💌 A student came back to say thanks | | yame
👩‍🏫 Became head of department | | yame
👩‍🏫 Became a deputy principal | | ame
👑 Became a principal | Became principal of {school} | ame
😓 Burned out | | yame
🕊️ Retired from teaching | | me
# 🧑‍⚕️ Nurse
🎓 Started nursing school | | tyame
👗 First day in the nursing uniform | | tyame
🧢 Capping ceremony | | tyame
📍 Pinning ceremony | | yame
🕯️ Lamp-lighting / nursing oath | | tyame
🏥 First clinical placement | Placement at {place} | tyame
✅ Passed the nursing exam | | yame
🪪 Registered as a nurse | | yame
🌙 First night shift | | yame
💉 First IV line on my own | | yame
💔 First patient I lost | | yame
💖 A patient I'll never forget | | yame
🚑 Joined the ICU or emergency ward | | yame
🏅 Became a nursing sister / charge nurse | | yame
✈️ Moved abroad as a nurse | Started nursing in {place} | yame
🦠 Worked through the pandemic | | yame
🕊️ Retired from nursing | | me
# 🤰 Midwife
🎓 Started midwifery training | | tyame
👗 First day in the midwife's uniform | | yame
👶 Delivered my first baby | | yame
🔢 Delivered my {n}th baby | | yame
🏠 First home visit as a field midwife | | yame
💔 A delivery that broke my heart | | yame
💖 A family that thanked me | | yame
🏅 Became a senior midwife | | ame
# ✈️ Flight attendant / air hostess
📝 Applied to an airline | Applied to {company} | yame
🎤 Passed the cabin-crew interview | | yame
⚖️ Passed the grooming check | | yame
🎓 Started cabin-crew training | | yame
🏊 Passed sea-survival training | | yame
🛩️ Got my wings | | yame
👗 First time in the uniform | | yame
🥻 First flight in the saree / kebaya uniform | | yame
💄 Mastered the uniform look | | yame
🛫 First flight as cabin crew | First flight to {place} | yame
🌍 First long-haul flight | | yame
🧳 First layover abroad | Layover in {place} | yame
😮 First turbulence scare | | yame
🩹 Handled a medical emergency on board | | yame
⭐ Got a passenger compliment | | yame
🏅 Promoted to purser / chief steward | | yame
✈️ Flew with a celebrity on board | | yame
👋 Last flight | | ame
# 🩺 Doctor
🎓 Got into medical school | Got into {school} | tyame
🥼 White-coat ceremony | | tyame
💀 First anatomy dissection | | tyame
🩺 Bought my first stethoscope | | tyame
🏥 First clinical rotation | | tyame
📝 Passed medical finals | | yame
🎓 Graduated as a doctor | | yame
📜 Took the Hippocratic oath | | yame
🏥 Started internship | Internship at {place} | yame
🌙 First on-call night | | yame
💔 First patient I lost | | yame
👶 Delivered a baby | | yame
🩺 Chose my specialty | | yame
📝 Passed postgraduate exams | | yame
✈️ Training abroad | Trained in {place} | yame
🧑‍⚕️ Became a consultant | | ame
🏠 Started private practice / channelling | | ame
🕊️ Retired from medicine | | me
# 🧑‍⚖️ Lawyer
🎓 Got into law school / law college | | tyame
📚 Passed the law exams | | yame
⚖️ Took oaths as an attorney-at-law | | yame
🥼 First day in the court gown / robe | | yame
👔 Bought my first court suit | | yame
🏛️ First court appearance | | yame
🏆 Won my first case | | yame
😓 Lost a case | | yame
🧑‍⚖️ Became an associate | Joined {company} | yame
🤝 Made partner | | ame
🏢 Started my own practice | | yame
👑 Became President's Counsel / senior counsel | | ame
🧑‍⚖️ Appointed a judge | | ame
# 💄 Beautician & makeup artist
🎓 Did a beauty course | | tyame
✂️ First client | | tyame
👰 First bridal makeover | | yame
💄 Did makeup for a photoshoot | | tyame
🏪 Opened my own salon | Opened {place} | yame
📸 Work featured online | | tyame
🏆 Won a beauty competition | | tyame
👩‍🏫 Started teaching beauty classes | | yame
# 💇 Hairdresser
🎓 Started hairdressing training | | tyame
✂️ First haircut on a client | | tyame
👰 First bridal hairstyle | | yame
🎨 Mastered colour | | yame
🪑 Got my own chair | | yame
🏪 Opened my own salon | Opened {place} | yame
# 👗 Fashion designer & tailor
✏️ First sketch I was proud of | | ctyame
🧵 Sewed my first dress | | ctyame
🎓 Started fashion school | | tyame
👗 First commissioned outfit | | tyame
👰 Designed a wedding dress | | yame
👠 First fashion show | | tyame
🏷️ Launched my own label | | yame
🛍️ First online order | | tyame
🏪 Opened a boutique | Opened {place} | yame
# 📸 Model
📸 First photoshoot | | tyame
🤝 Signed with an agency | Signed with {company} | tyame
👠 First runway show | | tyame
📰 First magazine feature | | tyame
📺 First TV commercial | | tyame
👑 Entered a beauty pageant | | tyame
👑 Won a beauty pageant | | tyame
# 💃 Dancer
🩰 First dance class | | bcty
🎭 First performance | | ctyame
🥁 Ves bandeema (Kandyan dance graduation) | | ctyame
💃 Arangetram | | ctyame
🎓 Graduated in dance | | tyame
🏫 Opened a dance school | | yame
🌍 Performed abroad | Performed in {place} | tyame
# 🗂️ Receptionist & office worker
🪪 First office job | Started at {company} | tyame
👗 First day in office wear | | tyame
☎️ First day on the front desk | | tyame
🧾 Learned the systems | | tyame
⭐ Employee of the month | | tyame
📈 Promoted to office manager | | yame
🧑‍💼 Became a personal assistant | | yame
# 🏦 Bank officer
📝 Passed the bank exam | | yame
🤝 Joined a bank | Joined {company} | yame
👔 First day at the counter | | yame
💰 Balanced my first day | | yame
📈 Promoted to branch officer | | yame
🏦 Became branch manager | | ame
# 🧵 Garment factory worker
🏭 First day at the factory | First day at {company} | tyame
🧵 Learned to run the machine | | tyame
🎯 Hit my first production target | | tyame
👩‍🏭 Became a line supervisor | | yame
🏠 Moved to the boarding house | | tyame
💸 Sent money home | | tyame
👩‍🏫 Became a trainer | | yame
# 🌏 Working abroad
📝 Got a foreign job offer | Job offer in {place} | yame
🛂 Got my work visa | | yame
✈️ Left home to work abroad | Left for {place} | yame
📞 First call home from abroad | | yame
💸 First salary sent home | | yame
🏠 Built a house with my earnings | | yame
🛬 Came home for good | | ame
# 🏡 Homemaker & stay-at-home parent
🏡 Became a full-time homemaker | | yame
🍲 Mastered the family recipes | | yame
🧮 Ran the household budget | | yame
🧒 Raised the children full-time | | yame
🧵 Started a home business | | yame
🔙 Went back to work after years at home | | ame
# 🧸 Preschool & Montessori teacher
🎓 Did a Montessori diploma | | tyame
🧸 First day with the little ones | | tyame
🎭 First preschool concert | | yame
🏫 Opened my own preschool | | yame
# 🧑‍🍼 Nanny & caregiver
🍼 First nanny job | Started caring for {person} | tyame
🧓 First elder-care job | | tyame
💖 A family that became my own | | tyame
🎓 Got a caregiving certificate | | tyame
# 👮 Police officer
🎓 Started police training | | yame
👮 First day in uniform | | yame
🚓 First patrol | | yame
🕵️ Became a detective | | yame
🎖️ Received a commendation | | yame
# 🪖 Armed forces
🎓 Started basic or officer training | | tyame
🎖️ Passing-out parade | | tyame
🪖 First day in uniform | | tyame
🎖️ Commissioned as an officer | | yame
📍 First posting | Posted to {place} | yame
🎖️ Received a medal | | yame
🏠 Came home from service | | yame
# 🧑‍✈️ Pilot
🛩️ First flying lesson | | tyame
🛩️ First solo flight | | tyame
🪪 Got my commercial pilot licence | | yame
👨‍✈️ First flight as first officer | | yame
👨‍✈️ Became a captain | | ame
# 🧑‍🍳 Chef
🔪 First kitchen job | | tyame
👨‍🍳 First day in chef's whites | | tyame
🍽️ Became sous chef | | yame
👑 Became head chef | | yame
⭐ Earned a Michelin star | | yame
🍽️ Opened my own restaurant | Opened {place} | yame
# 🏗️ Engineer
🎓 Graduated in engineering | | yame
🦺 First site visit in a hard hat | | yame
📐 First project completed | | yame
🪪 Became a chartered engineer | | yame
🏗️ Led a major project | | ame
# 📊 Accountant
📝 Passed CA / ACCA / CIMA exams | | yame
🎓 Qualified as an accountant | | yame
📅 Survived my first audit season | | yame
💼 Became a finance manager | | yame
💼 Became CFO | | ame
`;

export const STYLE = String.raw`
@style
# Firsts
👔 First school uniform | | bc
👟 First pair of sports shoes | | bc
👠 First pair of heels | | ctyame
💄 First lipstick | | tyame
👙 First bikini or swimsuit | | ctyame
🩱 First lingerie set | | tyame
👔 First suit | | tyame
👔 First tie | | ctyame
⌚ First watch | | ctyame
💍 First piece of real jewellery | | ctyame
👜 First designer bag | | tyame
🕶️ First sunglasses | | ctyame
💇 First salon haircut | | ctyame
💅 First manicure | | ctyame
🖋️ First tattoo | | tyame
# Traditional & cultural dress
🥻 Wore a saree for the first time | | ctyame
🥻 Wore an osariya (Kandyan saree) | | tyame
👘 Half-saree ceremony | | ct
🥻 Wore my mother's wedding saree | | tyame
🧥 Wore a sarong for the first time | | ctyame
👕 Wore national dress | | ctyame
👗 Wore a lehenga | | ctyame
👘 Wore a kimono | | ctyame
👗 Wore a hanbok | | ctyame
👗 Wore a cheongsam / qipao | | ctyame
🧕 Started wearing the hijab | | ctyame
🧕 Stopped wearing the hijab | | tyame
🪖 Tied my first turban | | ctyame
👗 Avurudu outfit | |
👗 Diwali outfit | |
👗 Eid outfit | |
🎄 Christmas outfit | |
# Big-day outfits
🎓 Graduation gown | | tyame
💃 Prom or formal dress | | ty
🤵 Prom or formal suit | | ty
👰 Found my wedding dress | | yame
🥻 Chose my wedding saree | | yame
🤵 Got my wedding suit or nilame outfit | | yame
👗 Bridesmaid dress | | ctyame
👗 Party outfit I loved | | tyame
🎭 Costume party | Dressed as {what:costume} |
# Style changes
✨ Found my style | | tyame
💇 Big haircut | |
🎨 Dyed my hair | Dyed my hair {what:colour} | tyame
🪒 Shaved my head | | tyame
🧔 Grew a beard | | tyame
👓 New glasses | |
🏳️‍⚧️ Gender-affirming wardrobe | | tyame
👗 Wore a dress for the first time | | tyame
🛍️ Wardrobe clear-out | | tyame
♻️ Went thrift-only | | tyame
🧵 Made my own clothes | | ctyame
👗 Wore something I was scared to wear | | tyame
`;

export const LOVE_SPICY = String.raw`
@relationship
# Spicy & naughty
💋 First make-out session | | tyame
🌧️ Kissed in the rain | | tyame
💋 Kissed a stranger | | tyame
💋 Kissed my crush | Kissed {person} | tyame
🚗 Made out in the car | | tyame
😏 Flirted shamelessly | | tyame
🤫 Secret relationship | | tyame
🌙 Snuck out to see someone | | tyame
😳 Got caught by my parents | | tyame
💃 Dirty dancing at a party | | tyame
📱 Sexting | | yame
📸 Sent a risky photo | | yame
🌊 Skinny dipping | | yame
🍸 Hooked up at a party | | yame
🌙 One-night stand | | yame
🛏️ Friends with benefits | With {person} | yame
🤷 Situationship | With {person} | yame
📞 Late-night booty call | | yame
🌅 Walk of shame | | yame
🏨 Weekend in a hotel room | | yame
🛍️ Visited an adult store | | yame
🎁 Lingerie surprise | | yame
🎭 Role-play night | | yame
🔥 Tried something new in bed | | yame
🧸 Bought our first toy | | yame
🗝️ Explored a kink | | yame
💞 Had a threesome | | yame
✈️ Joined the mile-high club | | yame
🚿 Showered together | | yame
😈 Best night ever | | yame
# Heartache & mistakes
💔 Unrequited love | | ctyame
🙅 Got rejected by a crush | | ctyame
💍 Proposal turned down | | yame
👻 Got ghosted | | tyame
👻 Ghosted someone | | tyame
🎭 Got catfished | | tyame
💸 Romance scam | | tyame
📱 Drunk-texted an ex | | yame
🔁 Slept with an ex | | yame
😬 Regretted a hookup | | yame
💔 Was cheated on | | tyame
🕵️ Caught my partner cheating | | tyame
😔 Cheated on my partner | | tyame
🤐 Had an affair | | yame
💘 Fell for someone who was taken | | tyame
😤 Jealousy fight | | tyame
📱 Broken up with by text | | tyame
🌀 Was love-bombed | | tyame
🧪 Pregnancy scare | | tyame
🧪 STI scare | | yame
🩺 Tested positive for an STI | | yame
✅ Treated and in the clear | | yame
📸 Private photos leaked | | tyame
🛡️ Stalked by an ex | | tyame
🌪️ Left a toxic relationship | | tyame
🧠 Realised I was being gaslit | | tyame
🛡️ Survived sexual assault | | ctyame
📣 Reported harassment | | tyame
🌱 Started healing | | ctyame
🫶 Forgave myself | | tyame
`;
