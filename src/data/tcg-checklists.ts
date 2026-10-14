/**
 * Pokémon TCG checklists: public pages at /pokemon-tcg/checklists/<slug>
 * that collectors tick off as they pull cards (ticks stay in their browser).
 * They double as the shop's digital lists (shop-seed.json digital_lists point
 * here), so every list says which GameShuffle packs carry its cards.
 *
 * Facts only, each with where it was checked. The 30th Celebration list was
 * checked 2026-10-12: numbers on Serebii's set list, artists on two
 * independent checklists that agree card for card. Its Japanese numbers (set
 * M6a, 103 cards) were checked 2026-10-13 on two Japanese set lists: the same
 * 30 artists in the same order at 017 to 046, Pikachu ex (Double Rare) at 047
 * and 048. The Ascended Heroes list
 * (2026-10-12): names and rarities agree across Limitless, PkmnCards and the
 * Pokémon TCG API (Serebii's rarity icons were off on 15 cards) and match our
 * own catalog on all 91 cards it holds; artists from the Pokémon TCG API only.
 */

export interface ChecklistItem {
  /** The printed number in its set ("023"). */
  no: string;
  name: string;
  /** Position in a numbered subset ("01/30"). */
  label?: string;
  rarity?: "Common" | "Uncommon";
  artist?: string;
  /** The same card's number in another printing ("Japanese 017/103"). */
  alt?: string;
  note?: string;
}

export interface ChecklistSection {
  id: string;
  title: string;
  blurb?: string;
  items: ChecklistItem[];
}

export interface Checklist {
  slug: string;
  /** The <title> and share title. */
  title: string;
  h1: string;
  description: string;
  lede: string;
  set: { name: string; total: string; released: string };
  checked: string;
  sources: { title: string; url: string }[];
  sections: ChecklistSection[];
  /** Shop products that carry these cards (shop-seed SKUs), for the "Packed by GameShuffle" line. */
  shopSkus: string[];
  /** What the shop line says about them. */
  shopLine: string;
  faq: { q: string; a: string }[];
}

export const CHECKLISTS_PATH = "/pokemon-tcg/checklists";
export const checklistUrl = (slug: string) => `${CHECKLISTS_PATH}/${slug}`;

const PIKACHU_30: [string, string][] = [
  ["023", "Ken Sugimori"], ["024", "danciao"], ["025", "satoma"], ["026", "Takeshi Nakamura"], ["027", "Asako Ito"],
  ["028", "sowsow"], ["029", "James Turner"], ["030", "DOM"], ["031", "Atsushi Furusawa"], ["032", "Tomokazu Komiya"],
  ["033", "Narumi Sato"], ["034", "USGMEN"], ["035", "Susumu Maeya"], ["036", "OKACHEKE"], ["037", "Yuu Nishida"],
  ["038", "Tetsu Kayama"], ["039", "Teeziro"], ["040", "Shinji Kanda"], ["041", "Rianti Hidayat"], ["042", "Akira Komayama"],
  ["043", "OOYAMA"], ["044", "akagi"], ["045", "Naoyo Kimura"], ["046", "svlt"], ["047", "Atsuko Nishida"],
  ["048", "Kiyotaka Oshiyama"], ["049", "Nurikabe"], ["050", "Shimaris Yukichi"], ["051", "nagimiso"], ["052", "Kazuki Minami"],
];

/** Ascended Heroes commons (C) and uncommons (U), 001 to 217: number, name, rarity, artist. */
const ASC_CU: [string, string, "C" | "U", string | null][] = [
  ["001", "Erika's Oddish", "C", "Yoriyuki Ikegami"],
  ["002", "Erika's Gloom", "U", "MARINA Chikazawa"],
  ["004", "Erika's Bellsprout", "C", "sui"],
  ["005", "Erika's Weepinbell", "U", "LINNE"],
  ["007", "Erika's Tangela", "C", "GIDORA"],
  ["008", "Chikorita", "C", "Kariya"],
  ["009", "Bayleef", "U", "Tomomi Ozaki"],
  ["011", "Wurmple", "C", "USGMEN"],
  ["012", "Silcoon", "C", "Eri Yamaki"],
  ["013", "Beautifly", "U", "Narumi Sato"],
  ["014", "Cascoon", "C", "Dsuke"],
  ["015", "Dustox", "U", "kamonabe"],
  ["016", "Budew", "C", "Yoriyuki Ikegami"],
  ["017", "Grubbin", "C", "Jerky"],
  ["018", "Team Rocket's Tarountula", "C", "Saboteri"],
  ["020", "Charmander", "C", "Orca"],
  ["021", "Charmeleon", "U", "Julie Hang"],
  ["023", "Ethan's Slugma", "C", "Sanosuke Sakuma"],
  ["027", "Numel", "C", "Ounishi"],
  ["028", "Camerupt", "U", "Minahamu"],
  ["029", "Tepig", "C", "Uninori"],
  ["030", "Pignite", "U", "Aliya Chen"],
  ["032", "N's Darumaka", "C", "Gemi"],
  ["033", "N's Darmanitan", "U", "nagimiso"],
  ["034", "Salandit", "C", "Felicia Chen"],
  ["035", "Salazzle", "U", "Taiga Kasai"],
  ["036", "Scorbunny", "C", "Cona Nitanda"],
  ["037", "Raboot", "C", "aspara"],
  ["039", "Psyduck", "C", "Jiro Sasumo"],
  ["040", "Golduck", "U", "Jiro Sasumo"],
  ["041", "Totodile", "C", "REND"],
  ["042", "Croconaw", "U", "Felicia Chen"],
  ["044", "Sneasel", "C", "Krgc"],
  ["045", "Weavile", "U", "aspara"],
  ["046", "Snorunt", "C", "Wintr Wandr"],
  ["049", "N's Vanillite", "C", "yuu"],
  ["050", "N's Vanillish", "C", "kirisAki"],
  ["051", "N's Vanilluxe", "U", "imoniii"],
  ["052", "Snom", "C", "Izucch"],
  ["053", "Frosmoth", "U", "cochi8i"],
  ["054", "Glastrier", "U", "mashu"],
  ["055", "Pikachu", "C", "kamonabe"],
  ["056", "Raichu", "U", "Iori Suzuki"],
  ["059", "Tynamo", "C", "Jerky"],
  ["060", "Eelektrik", "U", "Jerky"],
  ["062", "Stunfisk", "C", "Tetsu Kayama"],
  ["063", "Helioptile", "C", "Tika Matsuno"],
  ["064", "Heliolisk", "U", "svlt"],
  ["065", "Charjabug", "C", "Misa Tsutsui"],
  ["066", "Vikavolt", "U", "Shiburingaru"],
  ["069", "Iono's Tadbulb", "C", "kurumitsu"],
  ["071", "Iono's Wattrel", "C", "Akira Komayama"],
  ["074", "Clefairy", "C", "satoma"],
  ["075", "Clefable", "U", "satoma"],
  ["077", "Team Rocket's Exeggcute", "C", "Gapao"],
  ["080", "Togepi", "C", "Yoko Hishida"],
  ["081", "Togetic", "C", "Teeziro"],
  ["083", "Marill", "C", "Yoshimoto Yoshimon"],
  ["085", "Misdreavus", "C", "Kazuhisa Uragami"],
  ["087", "Ralts", "C", "Terada Tera"],
  ["088", "Kirlia", "C", "satoma"],
  ["090", "Shuppet", "C", "miki kudo"],
  ["091", "Banette", "U", "Anesaki Dynamic"],
  ["092", "Rotom", "C", "mingo"],
  ["093", "Swirlix", "C", "Saya Tsuruta"],
  ["094", "Slurpuff", "U", "Natsumi Yoshida"],
  ["095", "Hop's Phantump", "C", "tono"],
  ["097", "Team Rocket's Mimikyu", "U", "DOM"],
  ["100", "Team Rocket's Diglett", "C", "Yuriko Akase"],
  ["101", "Team Rocket's Dugtrio", "U", "KEIICHIRO ITO"],
  ["102", "Hitmontop", "C", "Kouki Saitou"],
  ["103", "Meditite", "C", "Lee HyunJung"],
  ["104", "Medicham", "C", "GIDORA"],
  ["106", "Solrock", "U", "Whisker"],
  ["109", "Cynthia's Gible", "C", "Tomomi Ozaki"],
  ["110", "Cynthia's Gabite", "U", "Taira Akitsu"],
  ["112", "Riolu", "C", "hncl"],
  ["115", "Pancham", "C", "Minato"],
  ["117", "Carbink", "U", "Eri Kamei"],
  ["118", "Rolycoly", "C", "Kurata So"],
  ["119", "Carkol", "C", "Apios"],
  ["123", "Gastly", "C", "Saboteri"],
  ["124", "Haunter", "U", "Rianti Hidayat"],
  ["126", "Team Rocket's Murkrow", "C", "Mugi Hamada"],
  ["128", "Poochyena", "C", "Miki Tanaka"],
  ["129", "Mightyena", "U", "akagi"],
  ["130", "Galarian Zigzagoon", "C", "osare"],
  ["131", "Galarian Linoone", "C", "Tomowaka"],
  ["132", "Galarian Obstagoon", "U", "Dsuke"],
  ["133", "Cynthia's Spiritomb", "U", "satoma"],
  ["134", "Scraggy", "C", "Shimaris Yukichi"],
  ["136", "N's Zorua", "C", "Jiro Sasumo"],
  ["138", "Vullaby", "C", "Nisota Niso"],
  ["140", "Pangoro", "U", "takashi shiraishi"],
  ["144", "Mawile", "U", "CHORISO"],
  ["146", "Pawniard", "C", "Yuya Oka"],
  ["147", "Bisharp", "C", "Scav"],
  ["150", "Dratini", "C", "HYOGONOSUKE"],
  ["151", "Dragonair", "U", "Gemi"],
  ["156", "Noibat", "C", "Eri Kamei"],
  ["157", "Noivern", "U", "Natsumi Miyanose"],
  ["158", "Dreepy", "C", "Scav"],
  ["159", "Drakloak", "C", "cochi8i"],
  ["161", "Team Rocket's Meowth", "C", "Megumi Mizutani"],
  ["163", "Larry's Dunsparce", "C", "0313"],
  ["165", "Skitty", "C", "Yoko Hishida"],
  ["166", "Delcatty", "U", "buchi"],
  ["168", "Larry's Starly", "C", "Natsumi Miyanose"],
  ["169", "Larry's Staravia", "U", "Fujimoto Gold"],
  ["171", "Fan Rotom", "C", "Toshinao Aoki"],
  ["173", "Larry's Rufflet", "C", "cochi8i"],
  ["174", "Larry's Braviary", "U", "Ryuta Fuse"],
  ["175", "Larry's Komala", "C", "ryoma uratsuka"],
  ["176", "Drampa", "U", "Scav"],
  ["177", "Hop's Cramorant", "U", "Saboteri"],
  ["180", "Acerola's Mischief", "U", "Yuu Nishida"],
  ["181", "Air Balloon", "U", "Studio Bora Inc."],
  ["182", "Anthea & Concordia", "U", "Sanosuke Sakuma"],
  ["183", "Boss's Orders", "U", "akagi"],
  ["184", "Buddy-Buddy Poffin", "C", "AYUMI ODASHIMA"],
  ["185", "Canari", "U", "Naoki Saito"],
  ["186", "Counter Gain", "C", "Toyste Beach"],
  ["187", "Fighting Gong", "U", "Toyste Beach"],
  ["188", "Forest of Vitality", "U", "AYUMI ODASHIMA"],
  ["189", "Glass Trumpet", "C", "Toyste Beach"],
  ["190", "Iris's Fighting Spirit", "U", "yuu"],
  ["191", "Light Ball", "U", "Studio Bora Inc."],
  ["192", "Lillie's Determination", "U", "Atsushi Furusawa"],
  ["193", "Mega Signal", "C", "inose yukie"],
  ["194", "Mystery Garden", "U", "AYUMI ODASHIMA"],
  ["195", "N's PP Up", "U", "Toyste Beach"],
  ["196", "Night Stretcher", "C", "Toyste Beach"],
  ["197", "Nighttime Mine", "U", "Takashi Yamaguchi"],
  ["198", "Poké Pad", "C", "Studio Bora Inc."],
  ["199", "Premium Power Pro", "U", "Toyste Beach"],
  ["200", "Surfer", "C", "Hideki Ishikawa"],
  ["201", "Team Rocket's Archer", "U", "Hideki Ishikawa"],
  ["202", "Team Rocket's Ariana", "U", "hncl"],
  ["203", "Team Rocket's Factory", "U", "imoniii"],
  ["204", "Team Rocket's Giovanni", "U", "DOM"],
  ["205", "Team Rocket's Great Ball", "U", "Toyste Beach"],
  ["206", "Team Rocket's Hypnotizer", "U", "Toyste Beach"],
  ["207", "Team Rocket's Petrel", "U", "GOSSAN"],
  ["208", "Team Rocket's Proton", "U", "Naoki Saito"],
  ["209", "Team Rocket's Transceiver", "U", "inose yukie"],
  ["210", "Team Rocket's Watchtower", "U", "AYUMI ODASHIMA"],
  ["211", "Thick Scale", "U", "Toyste Beach"],
  ["212", "Tool Scrapper", "C", "Studio Bora Inc."],
  ["213", "Ultra Ball", "C", "Ayaka Yoshida"],
  ["214", "Urbain", "U", "Teeziro"],
  ["215", "Waitress", "C", "Cona Nitanda"],
  ["216", "Prism Energy", "U", null],
  ["217", "Team Rocket's Energy", "U", null],
];
const ascItems = (from: number, to: number): ChecklistItem[] =>
  ASC_CU.filter(([no]) => Number(no) >= from && Number(no) <= to)
    .map(([no, name, r, artist]) => ({ no, name, rarity: r === "C" ? "Common" : "Uncommon", ...(artist ? { artist } : {}) }));

export const CHECKLISTS: Checklist[] = [
  {
    slug: "30th-celebration-pikachu",
    title: "30th Celebration Pikachu Checklist: All 30 Artists",
    h1: "30th Celebration Pikachu checklist",
    description: "Every Pikachu in Pokémon TCG 30th Celebration, 023 to 052 of 128, with the artist who drew each one, plus Pikachu ex 053 and 054, and the Japanese set numbers. Tick them off as you pull them.",
    lede: "Thirty Pikachu, each drawn by a different artist, numbered 023 to 052 in the 30th Celebration set, plus the two Pikachu ex. The Japanese numbers are beside each card. Tick each one as you pull it; your ticks stay on this device.",
    set: { name: "30th Celebration", total: "128", released: "2026-09-16" },
    checked: "2026-10-13",
    sources: [
      { title: "Serebii: 30th Celebration set list", url: "https://www.serebii.net/card/30thcelebration/" },
      { title: "Bill's Archive: all 30 Pikachu", url: "https://billsarchive.com/30th-celebration-pikachu.html" },
      { title: "Pooka: Japanese set M6a", url: "https://pooka.app/list/set/cards/ja-m6a/30th%20Celebration" },
      { title: "Samurai Sword Tokyo: the 30 Japanese Pikachu", url: "https://samuraiswordtokyo.com/blogs/news/30-pikachu-illustrators-30th-celebration-card-list" },
    ],
    sections: [
      {
        id: "pikachu",
        title: "The 30 Pikachu",
        blurb: "Numbered 01/30 to 30/30 on the card: 023 to 052 in the English set, 017 to 046 in the Japanese set (M6a).",
        items: PIKACHU_30.map(([no, artist], i) => ({ no, name: "Pikachu", label: `${String(i + 1).padStart(2, "0")}/30`, artist, alt: `Japanese ${String(17 + i).padStart(3, "0")}/103` })),
      },
      {
        id: "pikachu-ex",
        title: "Pikachu ex",
        blurb: "The pair that rounds out the run.",
        items: [
          { no: "053", name: "Pikachu ex", alt: "Japanese 047/103" },
          { no: "054", name: "Pikachu ex", alt: "Japanese 048/103" },
        ],
      },
    ],
    shopSkus: ["thirty-hunt-1", "thirty-hunt-3", "thirty-set", "thirty-set-jp"],
    shopLine: "Every Thirty Hunt pack has a 30th Celebration Pikachu, and the Anniversary Thirty Set has all 30 plus both Pikachu ex, in English or Japanese.",
    faq: [
      { q: "How many Pikachu are in 30th Celebration?", a: "Thirty, numbered 01/30 to 30/30 on the card and 023 to 052 in the 128-card set, each drawn by a different artist. Two Pikachu ex, 053 and 054, follow them." },
      { q: "Who drew the 30th Celebration Pikachu?", a: "Thirty different artists, starting with Ken Sugimori at 01/30. The full list is above, card by card." },
      { q: "What are the Japanese numbers?", a: "The Japanese set, 30th Celebration (M6a), has the same 30 Pikachu by the same artists in the same order, numbered 017 to 046 of 103. Its Pikachu ex are 047 and 048. Each card above shows both numbers." },
      { q: "Where do my ticks go?", a: "They're kept in this browser only. Nothing is sent anywhere, so you don't need an account." },
    ],
  },
  {
    slug: "ascended-heroes-commons-uncommons",
    title: "Ascended Heroes Checklist: Every Common and Uncommon",
    h1: "Ascended Heroes commons and uncommons",
    description: "All 153 commons and uncommons in Pokémon TCG Ascended Heroes, 001 to 217, with the artist of each: 84 commons and 69 uncommons. Tick off what you have.",
    lede: "Every common and uncommon in Ascended Heroes, in number order: 84 commons and 69 uncommons from the 217-card main set. Tick what you have; your ticks stay on this device.",
    set: { name: "Ascended Heroes", total: "217", released: "2026-01-30" },
    checked: "2026-10-12",
    sources: [
      { title: "Limitless TCG: Ascended Heroes", url: "https://limitlesstcg.com/cards?q=set:ASC&display=list&sort=number&show=all" },
      { title: "PkmnCards: Ascended Heroes", url: "https://pkmncards.com/set/ascended-heroes/" },
      { title: "the Pokémon TCG API (artists)", url: "https://pokemontcg.io/" },
    ],
    sections: [
      { id: "pokemon", title: "Pokémon", blurb: "001 to 179, commons and uncommons only (the rares and ex cards aren't listed).", items: ascItems(1, 179) },
      { id: "trainers", title: "Trainers", blurb: "180 to 215: items, tools, Supporters and Stadiums.", items: ascItems(180, 215) },
      { id: "energy", title: "Special Energy", items: ascItems(216, 217) },
    ],
    shopSkus: ["set-builder-100"],
    shopLine: "Our Set Builder 100 is 100 different cards from this list, in number order. Tick off what's in your box and you'll see what's left.",
    faq: [
      { q: "How many commons and uncommons are in Ascended Heroes?", a: "153: 84 commons and 69 uncommons, out of 217 cards in the main set. The secret rares, 218 to 295, are all rarer." },
      { q: "Are the Trainers and Energy included?", a: "Yes. Trainers run 180 to 215 and the two Special Energy cards are 216 and 217, and their commons and uncommons are on the list." },
      { q: "Where do my ticks go?", a: "They're kept in this browser only. Nothing is sent anywhere, so you don't need an account." },
    ],
  },
];

export const checklistBySlug = (slug: string) => CHECKLISTS.find((c) => c.slug === slug) ?? null;
export const checklistCount = (c: Checklist) => c.sections.reduce((n, s) => n + s.items.length, 0);
