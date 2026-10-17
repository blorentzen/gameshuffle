/**
 * The Daily Dex's three nods per Pokémon (src/lib/originals/dailyDex.ts), in
 * our own words: retold from Pokédex entries and the games, never quoted, each
 * checked against Bulbapedia or Serebii. Vague first: nod 1 shows before the
 * first guess, nod 2 after one miss, nod 3 after two.
 *
 * Rules for every nod: never the Pokémon's name, a piece of it, or its
 * evolutions' names; no move names that contain the name; no dashes. Written
 * in the order the answers come up, kept about 90 days ahead (Platform ▸
 * Originals warns about upcoming answers without nods). Sources for each are
 * kept in specs/research/2026-10-16-daily-dex/nods-sources.json.
 */

export const DEX_NODS: Record<string, [string, string, string]> = {
  "Honedge": [
    "Legend says it is born when a departed soul settles into an old weapon, the very blade that took its life.",
    "Grab its handle and its long blue sash coils around your arm to drain your life energy.",
    "Its true body is the blue eye on its handguard, and at level 35 it splits into two floating blades.",
  ],
  "Ariados": [
    "It ties a strand to captured prey and lets it go, then follows the line to the prey's friends.",
    "A face-like pattern on its rear makes both ends look alike, and it spins thread from each of them.",
    "Evolves at level 22, and Pokémon Hunter J's partner of this kind tied up her targets with String Shot.",
  ],
  "Sudowoodo": [
    "Older folks love it so much there's a magazine where fans fuss over the angle of its arms.",
    "Poses as a tree along paths, though its body is more like stone, and it runs for cover when rain falls.",
    "In older games it blocked a road until sprayed with water, and its younger form evolves by learning Mimic.",
  ],
  "Shiftry": [
    "Old tales tell of an evil bird whose beak and wings were taken away and replaced as divine punishment.",
    "Dwells atop trees over a thousand years old and stirs up house-leveling gales with the leafy fans on its hands.",
    "Evolves with a Leaf Stone. In the anime, one kidnapped Nurse Joy so she would heal a hurt forest friend.",
  ],
  "Flapple": [
    "Seasoned fighters have a clay-colored fruit shell, and they mend it using their own body fluid.",
    "Darts around waiting for an opening, then spits an acid from its cheeks strong enough to corrode metal.",
    "Eating a sour fruit sparked its evolution. Folding its peel wings lets it pass for a piece of produce.",
  ],
  "Torkoal": [
    "Abandoned mines are often crawling with them, still digging tirelessly for the dark rock that powers them.",
    "Fills hollows in its shell with fuel and burns it, and its smoky snort sounds like a train's horn.",
    "Ash caught one that cried and puffed smoke when happy. If its inner fire goes out, it dies.",
  ],
  "Kleavor": [
    "Settlers once collected the stone chips it lost in battle and shaped them into tools.",
    "Hot-tempered and crude, it chops down tall trees with heavy stone blades. Anyone who meets one should run.",
    "Evolves when a mantis is exposed to Black Augurite, and one was revered as a Noble with its own warden.",
  ],
  "Cinderace": [
    "Cheering crowds fire it up, though its love of showing off sometimes gets it into trouble.",
    "Kicks a pebble up and keeps it aloft until it turns into a blazing ball, then fires it at foes.",
    "Its ability changes its type to match each move it uses, and Leon's partner of this kind went Gigantamax against Ash.",
  ],
  "Shedinja": [
    "Legend warns that gazing into the dark hollow inside its back can rob you of your soul.",
    "A motionless husk that floats without moving its wings, never breathes, and wears a halo over its head.",
    "Appears in a spare Poké Ball when a certain bug evolves. It has just 1 HP, shielded by Wonder Guard.",
  ],
  "Flabébé": [
    "Right after birth it drifts around hunting for the perfect blossom, then cares for it the rest of its life.",
    "Rides one flower in any of five colors and wears a crown of pollen with hidden healing power.",
    "Goh caught one of every flower color, including the rare white. Every one of its kind is female.",
  ],
  "Armarouge": [
    "It swears loyalty to its partner, yet keeps slipping off alone to train its mind.",
    "Wears old battle gear that belonged to a famed fighter, and it believes in fighting fair, facing any foe head-on.",
    "Joins its floating shoulder guards into a cannon that fires blazing shots. Liko's partner evolved into it in the anime.",
  ],
  "Vileplume": [
    "Never stroll up to pretty jungle blossoms, since some shed pollen that sets off terrible allergy attacks.",
    "Bears the world's largest petals, almost too heavy to hold up, and uses them to lure prey it then paralyzes.",
    "Erika's signature Pokémon. Its line needs a Leaf Stone to reach it, while a Sun Stone leads to a dancer instead.",
  ],
  "Musharna": [
    "When the haze around it darkens, keep your distance, or your worst nightmares may become real.",
    "Dozes and dreams nonstop, even with its eyes open, and gets very cranky if woken up.",
    "Pink mist from its forehead forms shapes from dreams it has eaten. Fennel studied one in the anime.",
  ],
  "Guzzlord": [
    "Supposedly it has eaten entire mountains and gulped down buildings, yet no droppings have ever turned up.",
    "Eats every waking moment, pulling rock, rivers and anything in its path into its maw with long, arm-like tongues.",
    "An Ultra Beast from another world. In the anime, one devoured Dia's home world, leaving behind the barren Ultra Ruin.",
  ],
  "Rufflet": [
    "Soon after hatching, it challenges its own parent to a fight to earn their acceptance.",
    "Picks fights with foes far bigger than itself and bawls when it loses. Its talons crack hard berries and shells.",
    "Every one is male. In the anime, one at a nursery kept feuding with a female rival until he saved her.",
  ],
  "Bibarel": [
    "Folks living along rivers appreciate its work, because the streams it dams never flood their banks.",
    "Sluggish and awkward on land but a speedy swimmer, it builds nests from branches and roots cut with its sharp front teeth.",
    "Evolves at level 15. In the anime, a stonecutter's partner refused to help build a bridge it knew was unsafe.",
  ],
  "Nacli": [
    "Long ago people treasured it, because it would share a precious seasoning with them.",
    "Born deep underground, it scrapes along leaving crumbs of its body behind, and its insides keep making more.",
    "People have called its trails salt roads for ages, and its mild-tasting salt even flavors ice cream.",
  ],
  "Silcoon": [
    "People once believed it went hungry until it changed, but it actually sips rainwater that gathers on its body.",
    "Ties itself to a tree branch with threads and hangs still, peeking out through two small holes.",
    "A hidden value decides if a red caterpillar becomes it or its look-alike. May's evolved into a butterfly.",
  ],
  "Magby": [
    "A famous potter shares a home with one, and its gentle flames reportedly fire fine pottery.",
    "Its breath reveals its health: yellow flames mean it is doing well, while black smoke means it is tired.",
    "Flames dribbling from its nose mean it caught a cold, so it soaks in molten rock. It evolves at level 30.",
  ],
  "Woobat": [
    "The mark it leaves on someone's body is said to bring them good fortune.",
    "Suction from its nose holds it to cave walls while it sleeps, leaving heart-shaped prints behind.",
    "Jessie caught one but had to hand it over to Giovanni. It evolves once it grows close to its Trainer.",
  ],
  "Larvesta": [
    "Ancient people believed it fell from the sun, and some called it the thief of the sun.",
    "Lives at the foot of volcanoes and sprays fire from five horns, hot enough to slice through sheets of iron.",
    "The only Pokémon that evolves at level 59, it does so by sealing itself inside a shell of flames.",
  ],
  "Drednaw": [
    "One old story says it chewed a mountain to bits and dammed a flood with the leftover rubble.",
    "Waits by the water's edge, then whips its neck out to snap up prey that wander over for a drink.",
    "Gym Leader Nessa's partner goes Gigantamax and rises onto two legs. It evolves at level 22.",
  ],
  "Togekiss": [
    "It never shows up anywhere there is fighting, and lately it has barely been spotted at all.",
    "Ancient lucky charms bear its image, and it showers blessings on people who respect one another.",
    "Evolves with a Shiny Stone and is Cynthia's partner. Dawn received one from a princess who traded places with her.",
  ],
  "Grookey": [
    "When it beats out a rhythm, the sound waves revive wilted plants and flowers nearby.",
    "Carries a special stick tucked in its hair that grows harder and more flexible by soaking up its energy.",
    "A first partner that evolves at level 16. Goh's ditched Team Rocket's prize machine to join his team.",
  ],
  "Finneon": [
    "Seaside resorts put out food for them, since divers love watching their patterns glow after dark.",
    "Powerful double tails launch it into high leaps, and hungry gulls swoop in to grab it midair.",
    "Its fluttering twin tails earned it the nickname butterfly of the sea, and Zoey used one in the Wallace Cup.",
  ],
  "Walrein": [
    "Its herd of 20 to 30 follows a leader willing to lay down its life to protect the group.",
    "Massive tusks smash ten-ton blocks of ice in one blow, and thick blubber makes attacks bounce right off.",
    "Elite Four member Glacia's ace. Tusks it breaks in battle grow back to full size within a year.",
  ],
  "Rolycoly": [
    "Until about a century ago, nearly every household kept one for cooking and warming the home.",
    "Zips around like a unicycle on rough, rocky ground, snacking on grass that tangles in its wheel.",
    "First found in mines about 400 years ago. Hermit crab Pokémon often mistake it for a rock to live in.",
  ],
  "Drilbur": [
    "Plenty of farmers grumble about it, because it ruins their vegetable patches.",
    "Puts its claws together and spins its body to tunnel at 30 mph, fast enough to race a car up above.",
    "Iris's longtime partner started out as one, as seen in flashbacks. It evolves at level 31.",
  ],
  "Calyrex": [
    "Lore says it once moved an entire forest, and every creature living there, to a new home overnight.",
    "Revered as a merciful ancient ruler that mends hearts and makes fields of crops and flowers spring up.",
    "It borrows Peony's body to speak, and regains full power riding a bonded steed with the Reins of Unity.",
  ],
  "Vulpix": [
    "It can make orbs of fire drift like spirits, and some people mistake them for ghosts.",
    "Born with a single white tail that gains color and splits from the tip as it grows, until there are six.",
    "Evolves with a Fire Stone, or an Ice Stone for its icy form. Brock raised one, and Lillie raised Snowy.",
  ],
  "Haxorus": [
    "It eats soil for the minerals it needs, all to keep its beloved tusks razor sharp.",
    "Usually kind, it turns ferocious if anyone touches its tusks, which slice clean through steel beams. It nests in old mines.",
    "Reportedly the first design of its generation. In the anime, Iris's tiny partner returns hundreds of episodes later fully grown into it.",
  ],
  "Urshifu": [
    "Wild ones live in remote mountains and train by racing across sheer cliff faces.",
    "It masters one of two fighting styles: a single crushing blow, or nonstop strikes that flow like a river.",
    "Its cub form evolves after studying one of two special scrolls. It's the only Legendary with two Gigantamax forms.",
  ],
  "Iron Hands": [
    "A paranormal magazine floated a theory that it was once a gravely injured athlete, kept alive as a cyborg.",
    "It presses the glowing panels on its palms together to release energy, and hovers slightly to dash and turn.",
    "It bears an uncanny likeness to a sumo-slapping Pokémon, and has the highest HP of any Pokémon with either of its types.",
  ],
  "Totodile": [
    "It sleeps with one eye open, resting just half of its brain at a time.",
    "This scrappy biter snaps at whatever moves, its own trainer included, so it's unwise to turn away from it.",
    "Ash won his in a battle against Misty, and it was famous for breaking into dance even in big matches.",
  ],
  "Alcremie": [
    "Pastry chefs covet it, since what it makes tastes richer and sweeter the happier it feels.",
    "To show trust, it decorates berries with a sweet topping from its hands. When attacked, it flings that topping back.",
    "It evolves when a trainer spins while its pre-evolution holds a Sweet. No species has more forms.",
  ],
  "Staraptor": [
    "Once it evolves, it quits its flock to go solo, now tough enough to fend for itself.",
    "Fussy about the shape of its crest, it keeps attacking even when hurt and boldly takes on far bigger foes.",
    "Ash's evolved during a PokéRinger final against Paul. It's the only Pokémon whose primary type changes when it Mega Evolves.",
  ],
  "Camerupt": [
    "Its humps formed from its own reshaped bones and hold magma said to reach 18,000 degrees Fahrenheit.",
    "It lives in volcano craters, and the vents on its back spew lava once a decade or whenever it loses its temper.",
    "Team Magma's leader relies on it. In the anime, Vicky Winstrate's went berserk after a hit to the nose.",
  ],
  "Gorebyss": [
    "Whatever it leaves behind after feeding drifts down to the ocean floor and feeds the creatures below.",
    "A graceful deep-water swimmer that sips prey's fluids through a thin mouth. Its hue brightens each spring.",
    "Evolves when its shellfish pre-evolution is traded holding a Deep Sea Scale. Shells on its chest give it a mermaid look.",
  ],
  "Scream Tail": [
    "Just a single sighting is on record, and it lines up with a strange figure drawn in an old explorer's journal.",
    "A shaggy, savage round critter with a long curl of fur. It floats instead of walking and attacks anyone who comes close.",
    "Rumored to be an ancient version of a famous lullaby singer, but it can't sing and just shrieks loudly instead.",
  ],
  "Zebstrika": [
    "At the first rumble of a storm, it guides its herd toward the clouds so the foals can power up on lightning.",
    "Ill-tempered and quick, it gallops with a thunderous din. Its mane glows yellow just before it lashes out.",
    "Evolves at level 27, Gym Leader Elesa battles with one, and every one of its Abilities grants an immunity.",
  ],
  "Charjabug": [
    "Campers are glad to have one around, since its stored power could run a household for a day.",
    "Mostly motionless, it hides under leaf litter eating decayed plant matter, and stepping on it earns you a jolt.",
    "Its evolved form clutches it like a power pack. In the anime, Ash caged one as a farewell gift for Sophocles.",
  ],
  "Poliwag": [
    "Fans can tell where one lives just by which way the pattern on its belly turns.",
    "Its see-through skin reveals its innards as a spiral, and its freshly grown legs are too wobbly for much walking.",
    "Evolves at level 25, then branches: a Water Stone makes a brawler, while a trade with a King's Rock makes a frog.",
  ],
  "Regice": [
    "A colossal being is said to have made it. People once worshipped it, then sealed it away in fear.",
    "A shroud of minus 328 degree air surrounds it, freezing anything nearby, and even a bath in magma can't melt it.",
    "Players first found it by decoding Braille puzzles. Its face is seven yellow dots arranged in a plus sign.",
  ],
  "Blissey": [
    "Its downy coat works like a sadness detector, and it will hurry any distance to cheer up someone feeling low.",
    "A born nurse that tends the sick. One bite of the egg it carries makes anyone kind and caring.",
    "Evolves through strong friendship, ties for the highest base HP of any Pokémon, and helps Nurse Joy in the anime.",
  ],
  "Ludicolo": [
    "Legend has it that children singing on hiking trips can summon it.",
    "Cheerful rhythms energize every cell in its body, boosting its power and sending it into an irresistible dance.",
    "Brock's evolved after touching a Water Stone. It looks like a dancing duck with a lily pad for a hat.",
  ],
  "Nuzleaf": [
    "Travelers lost in the woods hear its eerie flute music and feel a creeping sense of dread.",
    "It climbs trees deep in the forest, and its long pointed nose is both its main sensor and its weak spot.",
    "Evolves from an acorn-like Pokémon at level 14, and its look borrows from the long-nosed tengu of Japanese folklore.",
  ],
  "Kilowattrel": [
    "On a good wind it can log over 430 miles in just one day.",
    "Its wings generate electricity, which it stores in a throat sac that glows like a light bulb when puffed up.",
    "Its nearly oil-free feathers make it a poor swimmer. In the anime, Roy's evolved to save him from a fall.",
  ],
  "Togepi": [
    "Get a dozing one up on its feet, and an old saying promises you good fortune.",
    "Kindness from the people around it is its fuel. It bottles that good feeling inside its shell and hands it back out.",
    "Hatched from an egg Ash found, it imprinted on Misty and traveled with her for years in the anime.",
  ],
  "Espathra": [
    "When it spots people, it fans its feathers, cries out and charges, but it has to stop to change direction.",
    "It pins foes in place with psychic power from its huge eyes and can sprint faster than 120 mph.",
    "Only it can learn Lumina Crash. In the anime, Elite Four member Tulip fights alongside one.",
  ],
  "Wailmer": [
    "On rare occasions entire pods beach themselves, apparently pulled ashore by ancestral memories of life on land.",
    "It gulps seawater to puff up and bounce along beaches, and loves startling people with jets from its nostrils.",
    "Evolves at level 40 into a true giant, as one did in the anime to ferry Ash's group to a ship.",
  ],
  "Tyranitar": [
    "Its rampages flatten peaks and bury whole rivers, leaving cartographers no choice but to start their maps over.",
    "It prowls mountain ranges hunting for a good fight, and it brushes past any challenger it considers beneath it.",
    "Evolves at level 55 and kicks up a sandstorm on arrival. In the anime, Ash helped return a lost hatchling to one.",
  ],
  "Tapu Lele": [
    "It feels no remorse over its cruel streak, and the fragrance of flowers is what fuels it.",
    "Its shimmering scales drift down as it flits about, and a single touch is said to mend wounds instantly.",
    "Its arrival blankets the field in psychic energy. In the anime, it healed Ash after he rescued a trapped Pokémon.",
  ],
  "Dragapult": [
    "Little ones crowd around whichever member of the group flies fastest, eager to tag along at sonic speed.",
    "It tucks its young into holes in its horns, then launches them at foes like supersonic missiles.",
    "Focusing its mind turns it invisible. Leon battles with one, and a 2020 poll named it its generation's favorite.",
  ],
  "Toucannon": [
    "Because its couples get along so well, people invite it to weddings as a lucky charm.",
    "It fires seeds by igniting gas in its bill, smashing boulders apart, and that bill can heat past 212 degrees Fahrenheit.",
    "They talk by smacking bills together. In the anime, a flock leader let a little owl leave the flock to join Ash.",
  ],
  "Simipour": [
    "It keeps a reserve of water in the tuft on its head and refills it by slurping through its tail.",
    "It sticks to spots with clean water and blasts water from its tail hard enough to smash a concrete wall.",
    "Evolves with a Water Stone, one of a trio of elemental monkeys. In Pokémon GO it appears mostly in the Americas.",
  ],
  "Staryu": [
    "Tales told in many lands say it was born from sky dust that drifted down into the sea.",
    "Its red core flickers at night like a heartbeat, and it regrows any lost limb as long as that core survives.",
    "One of Misty's main battlers in the anime, and a Water Stone triggers its only evolution.",
  ],
  "Geodude": [
    "One idle researcher reportedly tallied a hundred of them lining just one road.",
    "Trail hikers mistake it for a boulder all the time, and a careless step earns them a flurry of angry punches.",
    "Ash's first Gym Leader used one in their rematch, and it got zapped by an electric attack despite being immune.",
  ],
  "Dipplin": [
    "What looks like one critter is actually a pair, with one partner's head poking out front and another's tail out back.",
    "The pair coats their fruit home in layers of fragrant syrup, which can captivate foes or engulf them.",
    "The only Pokémon that needs a TM to evolve, since it must know Dragon Cheer first.",
  ],
  "Chesnaught": [
    "Peaceful at heart, it would rather not fight, but it will throw itself in front of friends to protect them.",
    "Crossing its fists over its face lets it shrug off a bomb blast, and its tackle can overturn a 50-ton tank.",
    "It boasts the highest Defense of any final-stage starter, yet Clemont's partner only reached this form in a dream.",
  ],
  "Jumpluff": [
    "Its travels last only as long as its supply of spores, and when those are spent, its life ends too.",
    "It drifts around the globe on seasonal winds, steering its puffs even in fierce gales, and lands when it meets cold air.",
    "It evolves at level 27. In the anime, Gym Leader Ramos sent one to battle Ash.",
  ],
  "Suicune": [
    "A cold wind from the north always seems to blow wherever it runs.",
    "It roams far and wide in search of fouled water, cleansing it with one touch and even walking across it.",
    "The cover star of Crystal, it keeps dashing off across the map while a mystic named Eusine chases it.",
  ],
  "Centiskorch": [
    "It brews burnable gas from its food, then lights it along its belly like a stovetop.",
    "It picks fights with anything that comes close, rearing up to slam its red-hot belly into foes or squeeze them.",
    "When it Gigantamaxes it sprouts a full hundred legs, and in the anime one rampages through a town until Leon arrives.",
  ],
  "Regigigas": [
    "An old legend claims it once towed whole continents into place using ropes.",
    "A master craftsman, it shaped other giants out of rock, ice and magma, and it can command them.",
    "Its attack and speed are halved for five turns, and it sleeps in an icy temple until its three creations come.",
  ],
  "Orbeetle": [
    "Its mind reaches far beyond its eyes, quietly studying things more than six miles away.",
    "A ladybug-like genius with a huge brain, eyebrow-like antennae and a red stripe that looks like a mustache.",
    "Gigantamax turns it into a glowing flying saucer whose full power could control the minds of everyone nearby.",
  ],
  "Magneton": [
    "Outbreaks of it tend to follow surges of sunspots, and some cities sound sirens when they arrive.",
    "It forms when three small floating units lock together, merging their brains without tripling their smarts.",
    "It evolves again when leveled up in certain special areas or with a Thunder Stone, and Clemont's splits apart to dodge.",
  ],
  "Pansage": [
    "Anyone weary who nibbles a leaf from its head finds their tiredness melting away.",
    "It lives deep in forests, gathering berries from all over and kindly sharing them with friends.",
    "Cilan's partner in the anime, it was a gift for players who chose the fire starter, and evolves with a Leaf Stone.",
  ],
  "Maractus": [
    "It shakes out an upbeat rhythm and dance to scare off birds hungry for its seeds.",
    "It lives in dry deserts, and every rhythmic sway makes a rattling sound like party shakers.",
    "Its yearly seed drop feeds other wildlife, and in the anime a trainer's trio of them struggles with a stage routine.",
  ],
  "Golbat": [
    "Its hollow fangs work like drinking straws, which makes them surprisingly fragile.",
    "A nighttime blood drinker, it can gulp so much at once that it ends up too full to stay airborne.",
    "It evolves through close friendship, and Brock owned one that later reached its final form.",
  ],
  "Latios": [
    "It can project whatever it sees or imagines straight into another's mind as a picture.",
    "Gentle and smart enough to understand human speech, it tucks its arms in to outfly a jet.",
    "In a canal city movie, it gives its life to stop a huge wave, leaving behind a new Soul Dew.",
  ],
  "Arctibax": [
    "It chills the air around itself to build a mask of ice over its face.",
    "Strong legs let it front-flip into the air and slash foes with a back fin frozen into a blade.",
    "Reached at level 35 and evolving again at 54, it gets stronger instead of burned when hit by fire.",
  ],
  "Rattata": [
    "If you spot one, odds are about forty more are hiding somewhere close by.",
    "Its front teeth never stop growing, so it gnaws on anything hard, even door frames and table legs.",
    "Youngster Joey keeps phoning to brag that his is in the top percentage of its kind.",
  ],
  "Simisear": [
    "It has a real sweet tooth, because sugary treats feed the flame inside its body.",
    "When excited it heats up, and embers drift from its swirly head tuft and tail to burn foes.",
    "It came dead last in a big Japanese fan poll, and was given away anyway to mark the loss.",
  ],
  "Butterfree": [
    "It can sniff out blooming flowers more than six miles away from its nest.",
    "Its wings shed a water-repellent powder, so it keeps gathering nectar in the rain and dusts enemies with poison.",
    "Ash's first catch became this, and he sadly let it go to join a pink mate in a famous farewell episode.",
  ],
  "Zigzagoon": [
    "It rubs its bristly back against trees to stake out territory, and may play dead to fool foes.",
    "Curious about everything, it wanders back and forth with its nose to the ground, never in a straight line.",
    "Great at finding lost items, it's the wild one chasing the professor when you pick your first partner in Emerald.",
  ],
  "Meditite": [
    "It eats just one berry a day, believing hunger sharpens its spirit.",
    "It trains for hours in mountain yoga, but keeps losing focus, so its practice never ends.",
    "Its special ability doubles its attack power, and its Shiny form swaps its blue body for pink.",
  ],
  "Drizzile": [
    "Clever but famously lazy, it lines its territory with traps so it doesn't have to fight.",
    "It squeezes moisture from pores in its palms to form water balloons it hurls at opponents.",
    "It evolves from a shy, teary first partner at level 16 and becomes a sharpshooting spy at level 35.",
  ],
  "Tentacruel": [
    "The older it gets, the fewer of its many stinging arms it seems to have left.",
    "Red orbs on its head glow and flash as warnings just before it fires ultrasonic blasts.",
    "Its 80 arms can form a venomous net, and in an early episode a giant one storms a seaside city.",
  ],
  "Type: Null": [
    "Its heavy helmet keeps a hidden power locked away, and also slows it down.",
    "Built in a lab as a weapon against otherworldly beasts, it went berserk and was frozen away.",
    "Gladion's partner, it breaks its mask when it evolves through deep friendship with its trainer.",
  ],
  "Eevee": [
    "Scientists suspect its oddly unstable genes could finally explain how evolution works.",
    "Rare in the wild, it adapts to its surroundings and can even start to resemble its trainer's face.",
    "It can evolve into eight different species, the most of any, and one Let's Go game is built around it.",
  ],
  "Rillaboom": [
    "Whoever drums best leads the troop, though it prefers keeping the peace in its group.",
    "It pounds a drum carved from a special tree stump, and the stump's roots obey its beat in battle.",
    "Gigantamax fuses it with a full drum kit, and Leon leads with one in the anime's Masters Eight.",
  ],
  "Silicobra": [
    "Its nose is so specialized for firing things out that its sense of smell is poor.",
    "It stores swallowed sand in a neck pouch, then blasts it from its nostrils to blind foes before burrowing.",
    "An ability only its family has stirs up a sandstorm whenever it's hit, and it evolves at level 36.",
  ],
  "Mankey": [
    "It flies into a rage so fast that nobody nearby ever has time to get away.",
    "It lives in treetop troops where one angry member sets off the whole group, so it's almost never quiet.",
    "In the anime, a wild one steals Ash's hat, evolves mid-chase, and ends up on his team.",
  ],
  "Mareanie": [
    "Cut off any limb and it grows back after a good night's sleep, but its head can't.",
    "It creeps along beaches and seafloors, jabbing prey with the venom spike on its head before its ten arms finish the job.",
    "Coral branches are its favorite feast, and James catches one in the anime that adores him.",
  ],
  "Panpour": [
    "Plants watered with the nutritious liquid stored in its head tuft grow unusually large.",
    "Dry air doesn't suit it, so it stays moist by spraying stored water out through the tip of its tail.",
    "Cress's partner in the anime, it's gifted to players who picked the grass starter and evolves with a Water Stone.",
  ],
  "Carracosta": [
    "It eats prey down to the last shell and bone, which makes its own armor thicker.",
    "One slap from its flippers can punch a hole in a tanker, and its jaws crunch steel beams.",
    "It evolves at level 37 from a Pokémon revived from a fossil, and is a strict adoptive dad in Super Mystery Dungeon.",
  ],
  "Wartortle": [
    "Algae growing on its back is a sign that this one has lived a very long time.",
    "It balances with its furry ears and tail while swimming fast, and that tail deepens in color with age.",
    "It arrives at level 16 and evolves again at 36, and in the anime a firefighting squad is made of them.",
  ],
  "Abomasnow": [
    "It only shows up while certain wintry flowers bloom, then vanishes once their petals fall.",
    "It hides inside the blizzards it creates on frozen peaks, and just shaking its body can blot out all visibility.",
    "It chases off packs hunting its young for berries, and Wulfric Mega Evolves his in an anime rematch with Ash.",
  ],
  "Goldeen": [
    "Admirers say its billowing tail looks like a fancy ball gown, which earned it a regal nickname.",
    "It refuses captivity: drop it in a fish tank and it rams its way out, glass and all.",
    "In spring, schools of them swim upriver, and Misty's is famous for flopping around helplessly on land.",
  ],
  "Shelgon": [
    "It skips food and water entirely while waiting to evolve, and researchers can't explain how it stays alive.",
    "Locked in heavy bone-like armor, it barely moves, hiding in caves while its body rebuilds itself inside.",
    "It dreams of flying, and at level 50 its armor peels away to reveal wings at last.",
  ],
  "Latias": [
    "Hostile feelings nearby make it puff up its downy feathers and shriek to scare the threat off.",
    "Its glassy down bends light so it can turn invisible or take on another shape entirely.",
    "In a canal city movie, it disguises itself as a girl, and might be the one who kisses Ash goodbye.",
  ],
};
