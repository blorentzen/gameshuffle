/**
 * Daily Duel: the player's pool. Each day deals six of these (the same six for everyone). Picked by
 * `scripts/populate-duel-cards.ts --pool` from cards already in our catalog: English prints, one per
 * species, every type with small, middle and big cards, ex/V/Mega at most ~17%, no trainer's own
 * cards and none on a trainer's team. APPEND ONLY: past days were dealt from this list in this order.
 */
export const DUEL_POOL: string[] = [
  "sv7-167", // Hydrapple ex · Grass · 330 HP
  "swsh4-167", // Zarude V · Grass · 210 HP
  "me2pt5-220", // Dustox · Grass · 140 HP
  "me2pt5-219", // Beautifly · Grass · 130 HP
  "me1-133", // Bulbasaur · Grass · 80 HP
  "sv3pt5-198", // Venusaur ex · Grass · 340 HP
  "swsh6-18", // Rillaboom · Grass · 180 HP
  "sv9-160", // Maractus · Grass · 110 HP
  "me1-136", // Shuckle · Grass · 80 HP
  "xy1-14", // Chesnaught · Grass · 160 HP
  "sv7-144", // Ledian · Grass · 90 HP
  "bwp-BW11", // Pansage · Grass · 60 HP
  "swsh9-152", // Shaymin V · Grass · 190 HP
  "base2-9", // Pinsir · Grass · 60 HP
  "svp-185", // Yanma · Grass · 60 HP
  "swsh5-142", // Kricketune V · Grass · 180 HP
  "sv6-169", // Sunflora · Grass · 100 HP
  "sv6-170", // Dipplin · Grass · 80 HP
  "sv3pt5-167", // Ivysaur · Grass · 100 HP
  "swsh11-19", // Dottler · Grass · 80 HP
  "swsh12pt5-17", // Calyrex · Grass · 110 HP
  "sv3pt5-178", // Tangela · Grass · 80 HP
  "swsh11tg-TG01", // Parasect · Grass · 120 HP
  "sv4pt5-93", // Gloom · Grass · 70 HP
  "swsh8-3", // Butterfree · Grass · 120 HP
  "sv4pt5-97", // Skiploom · Grass · 70 HP
  "ex6-1", // Beedrill · Grass · 90 HP
  "swsh45sv-SV004", // Grookey · Grass · 60 HP
  "ecard2-H5", // Bellossom · Grass · 90 HP
  "basep-45", // Scyther · Grass · 60 HP
  "ecard3-H21", // Nidoqueen · Grass · 110 HP
  "swsh12pt5gg-GG32", // Paras · Grass · 70 HP
  "sv8pt5-146", // Flareon ex · Fire · 270 HP
  "rsv10pt5-166", // Reshiram ex · Fire · 230 HP
  "mep-74", // Delphox · Fire · 160 HP
  "me55-130", // Moltres · Fire · 120 HP
  "me1-138", // Vulpix · Fire · 70 HP
  "me4-99", // Mega Pyroar ex · Fire · 340 HP
  "mcd24-1", // Charizard · Fire · 170 HP
  "rsv10pt5-100", // Simisear · Fire · 100 HP
  "sv8-196", // Larvesta · Fire · 70 HP
  "sv3pt5-169", // Charmeleon · Fire · 100 HP
  "mep-38", // Charmander · Fire · 80 HP
  "sm10-194", // Reshiram & Charizard-GX · Fire · 270 HP
  "sv1-203", // Armarouge · Fire · 130 HP
  "xyp-XY02", // Fennekin · Fire · 60 HP
  "swsh12pt5-21", // Entei · Fire · 120 HP
  "mep-47", // Cyndaquil · Fire · 70 HP
  "swsh12tg-TG01", // Braixen · Fire · 90 HP
  "me3-15", // Salandit · Fire · 70 HP
  "hgss3-6", // Magcargo · Fire · 100 HP
  "sv3pt5-58", // Growlithe · Fire · 80 HP
  "sm11-99", // Salazzle · Psychic · 110 HP
  "sv10-29", // Ponyta · Fire · 70 HP
  "sv3pt5-126", // Magmar · Fire · 90 HP
  "ecard1-91", // Quilava · Fire · 70 HP
  "me3-118", // Mega Starmie ex · Water · 330 HP
  "rsv10pt5-167", // Keldeo ex · Water · 210 HP
  "me5-88", // Primarina · Water · 150 HP
  "zsv10pt5-102", // Simipour · Water · 100 HP
  "me5-87", // Goldeen · Water · 70 HP
  "me2pt5-275", // Mega Froslass ex · Water · 310 HP
  "sm11-217", // Slowpoke & Psyduck-GX · Water · 250 HP
  "sm6-28", // Aurorus · Water · 160 HP
  "me55-132", // Articuno · Water · 120 HP
  "me2pt5-226", // Psyduck · Water · 70 HP
  "g1-24", // Vaporeon-EX · Water · 180 HP
  "me3-22", // Lapras ex · Water · 210 HP
  "pgo-16", // Wartortle · Water · 90 HP
  "swsh8-68", // Panpour · Water · 60 HP
  "sv3pt5-176", // Poliwhirl · Water · 90 HP
  "svp-137", // Horsea · Water · 60 HP
  "sv3pt5-180", // Omanyte · Water · 100 HP
  "mep-39", // Squirtle · Water · 80 HP
  "sv2-209", // Arctibax · Water · 90 HP
  "sv2-204", // Marill · Water · 70 HP
  "sv4pt5-117", // Slowbro · Water · 100 HP
  "sv8pt5-18", // Slowpoke · Water · 70 HP
  "swsh45sv-SV026", // Drizzile · Water · 90 HP
  "sma-SV9", // Wooper · Water · 70 HP
  "sm8-59", // Suicune · Water · 110 HP
  "mep-48", // Totodile · Water · 80 HP
  "sm7-46", // Kyogre · Water · 130 HP
  "ecard2-H20", // Octillery · Water · 80 HP
  "ecard1-4", // Blastoise · Water · 100 HP
  "ecard1-15", // Kingler · Water · 80 HP
  "swsh8-67", // Gorebyss · Water · 110 HP
  "dp2-29", // Mantine · Water · 80 HP
  "swsh1-61", // Drednaw · Water · 130 HP
  "ex7-27", // Qwilfish · Water · 60 HP
  "me5-114", // Mega Zeraora ex · Lightning · 270 HP
  "zsv10pt5-166", // Zekrom ex · Lightning · 230 HP
  "me4-90", // Ampharos · Lightning · 160 HP
  "sv5-169", // Charjabug · Lightning · 100 HP
  "sv4pt5-226", // Pawmi · Lightning · 60 HP
  "me1-158", // Mega Manectric ex · Lightning · 330 HP
  "sv8pt5-153", // Jolteon ex · Lightning · 260 HP
  "sv4pt5-137", // Luxray · Lightning · 150 HP
  "mcd23-8", // Kilowattrel · Lightning · 120 HP
  "cel25-5", // Pikachu · Lightning · 60 HP
  "sv4-248", // Iron Hands ex · Lightning · 230 HP
  "swsh12tg-TG03", // Flaaffy · Lightning · 90 HP
  "swsh45sv-SV044", // Morpeko · Lightning · 80 HP
  "swsh4-46", // Electrode · Lightning · 90 HP
  "sm12-242", // Magnemite · Lightning · 60 HP
  "xy8-55", // Raikou · Lightning · 120 HP
  "pl1-128", // Electabuzz · Lightning · 70 HP
  "hgss2-86", // Lanturn · Lightning · 110 HP
  "swsh12pt5gg-GG34", // Mareep · Lightning · 60 HP
  "me2pt5-64", // Heliolisk · Lightning · 120 HP
  "bwp-BW34", // Luxio · Lightning · 80 HP
  "me3-26", // Shinx · Lightning · 70 HP
  "me2pt5-282", // Mega Diancie ex · Psychic · 270 HP
  "svp-38", // Togekiss · Psychic · 150 HP
  "me2pt5-236", // Slurpuff · Psychic · 120 HP
  "sv6-78", // Clefairy · Psychic · 60 HP
  "swsh8-270", // Espeon VMAX · Psychic · 310 HP
  "sv8-239", // Latias ex · Psychic · 210 HP
  "sv9-73", // Grimmsnarl · Psychic · 170 HP
  "sv8-203", // Latios · Psychic · 120 HP
  "me1-144", // Shedinja · Psychic · 60 HP
  "sv3pt5-188", // Alakazam ex · Psychic · 310 HP
  "sv6pt5-73", // Fezandipiti · Psychic · 120 HP
  "rsv10pt5-119", // Woobat · Psychic · 60 HP
  "sv7-59", // Mewtwo · Psychic · 130 HP
  "sv6pt5-16", // Drowzee · Psychic · 70 HP
  "swsh45sv-SV009", // Orbeetle · Grass · 130 HP
  "sm12-243", // Koffing · Psychic · 60 HP
  "swsh2-75", // Clefable · Psychic · 110 HP
  "swsh12pt5gg-GG10", // Mew · Psychic · 60 HP
  "sm8-150", // Tapu Lele · Psychic · 110 HP
  "me2-37", // Snubbull · Psychic · 70 HP
  "xy5-104", // Azumarill · Psychic · 100 HP
  "ecard3-H32", // Xatu · Psychic · 80 HP
  "xyp-XY163", // Weezing · Psychic · 100 HP
  "ecard2-H12", // Hypno · Psychic · 80 HP
  "hgss1-13", // Wobbuffet · Psychic · 90 HP
  "sm8-92", // Unown · Psychic · 60 HP
  "sm8-138", // Granbull · Psychic · 130 HP
  "sv5-66", // Girafarig · Psychic · 90 HP
  "sm5-55", // Drapion · Psychic · 130 HP
  "swsh12-72", // Meditite · Psychic · 60 HP
  "svp-132", // Greninja ex · Water · 300 HP
  "me2pt5-283", // Mega Hawlucha ex · Fighting · 250 HP
  "swsh11-88", // Machamp · Fighting · 150 HP
  "hgss1-5", // Hitmontop · Fighting · 60 HP
  "zsv10pt5-124", // Drilbur · Fighting · 70 HP
  "me2pt5-113", // Mega Lucario ex · Fighting · 340 HP
  "swsh9tg-TG29", // Single Strike Urshifu VMAX · Fighting · 330 HP
  "swsh10-85", // Kleavor · Fighting · 140 HP
  "sv2-219", // Sudowoodo · Fighting · 110 HP
  "zsv10pt5-125", // Timburr · Fighting · 70 HP
  "ex3-91", // Golem ex · Fighting · 160 HP
  "mep-70", // Tyrunt · Fighting · 100 HP
  "me2-23", // Swinub · Water · 70 HP
  "sm9-76", // Omastar · Fighting · 130 HP
  "sv8-205", // Phanpy · Fighting · 80 HP
  "ecard3-H24", // Poliwrath · Fighting · 110 HP
  "sv3-203", // Larvitar · Fighting · 70 HP
  "me2pt5-105", // Lunatone · Fighting · 110 HP
  "me1-82", // Nacli · Fighting · 70 HP
  "sv3pt5-105", // Marowak · Fighting · 120 HP
  "swsh45sv-SV067", // Rolycoly · Fighting · 70 HP
  "sm10-84", // Sandslash · Fighting · 110 HP
  "svp-120", // Pupitar · Fighting · 80 HP
  "sm9-72", // Primeape · Fighting · 90 HP
  "clv-11", // Hitmonlee · Fighting · 120 HP
  "me2pt5-104", // Medicham · Fighting · 120 HP
  "me2pt5-112", // Riolu · Fighting · 80 HP
  "me2pt5-106", // Solrock · Fighting · 110 HP
  "sv3pt5-104", // Cubone · Fighting · 70 HP
  "sv3pt5-111", // Rhyhorn · Fighting · 100 HP
  "me2pt5-285", // Mega Scrafty ex · Darkness · 330 HP
  "swsh3-99", // Galarian Slowbro V · Darkness · 210 HP
  "sv3pt5-174", // Nidoking · Darkness · 170 HP
  "swsh45sv-SV082", // Thievul · Darkness · 100 HP
  "sv3pt5-23", // Ekans · Darkness · 70 HP
  "swsh7-188", // Umbreon V · Darkness · 200 HP
  "sv2-222", // Tyranitar · Darkness · 180 HP
  "sv4-205", // Yveltal · Darkness · 130 HP
  "sv3pt5-29", // Nidoran ♀ · Darkness · 60 HP
  "sma-SV26", // Guzzlord · Darkness · 160 HP
  "sv4-207", // Brute Bonnet · Darkness · 120 HP
  "sv3pt5-32", // Nidoran ♂ · Darkness · 60 HP
  "sv8pt5-65", // Roaring Moon · Darkness · 140 HP
  "me1-92", // Grafaiai · Darkness · 100 HP
  "sv3pt5-88", // Grimer · Darkness · 80 HP
  "swsh12pt5-80", // Pangoro · Darkness · 140 HP
  "sv7-97", // Bombirdier · Darkness · 100 HP
  "swsh7-96", // Nuzleaf · Darkness · 80 HP
  "ex12-11", // Muk · Grass · 70 HP
  "sv4pt5-183", // Weavile · Darkness · 110 HP
  "swsh11-120", // Darkrai · Darkness · 120 HP
  "swsh12tg-TG06", // Malamar · Psychic · 120 HP
  "dp2-10", // Honchkrow · Darkness · 90 HP
  "sv4-122", // Lokix · Darkness · 120 HP
  "mep-101", // Nidorina · Darkness · 90 HP
  "sv3pt5-33", // Nidorino · Darkness · 90 HP
  "sma-SV72", // Scizor-GX · Metal · 210 HP
  "me5-93", // Bastiodon · Metal · 160 HP
  "sv8-131", // Gholdengo · Metal · 130 HP
  "sm9-99", // Jirachi · Metal · 70 HP
  "me1-150", // Steelix · Metal · 200 HP
  "me4-94", // Metang · Metal · 100 HP
  "ex10-6", // Forretress · Metal · 70 HP
  "sm9-103", // Ferrothorn · Metal · 120 HP
  "me3-98", // Doublade · Metal · 100 HP
  "ecard1-27", // Skarmory · Metal · 60 HP
  "sv7-155", // Archaludon · Metal · 180 HP
  "rsv10pt5-150", // Durant · Metal · 110 HP
  "swsh2-133", // Honedge · Metal · 60 HP
  "sv5-178", // Metagross · Metal · 180 HP
  "zsv10pt5-144", // Cobalion · Metal · 120 HP
  "sv4pt5-193", // Revavroom · Metal · 140 HP
  "sv6-184", // Lairon · Metal · 110 HP
  "swsh12pt5gg-GG18", // Magnezone · Metal · 150 HP
  "swsh10tg-TG11", // Bronzong · Metal · 110 HP
  "sv4pt5-187", // Kingambit · Darkness · 170 HP
  "swsh7-112", // Dialga · Dragon · 130 HP
  "pgo-46", // Melmetal · Metal · 160 HP
  "swsh4-129", // Duraludon · Metal · 130 HP
  "swsh3-123", // Aggron · Metal · 160 HP
  "swsh12tg-TG29", // Rayquaza VMAX · Dragon · 320 HP
  "me55-143", // Kommo-o · Dragon · 180 HP
  "me4-95", // Sliggoo · Dragon · 90 HP
  "sv6-186", // Tatsugiri · Dragon · 70 HP
  "sma-SV40", // Garchomp · Dragon · 150 HP
  "me2pt5-248", // Drakloak · Dragon · 90 HP
  "sv4-95", // Gabite · Fighting · 100 HP
  "swsh7-115", // Hydreigon · Dragon · 170 HP
  "sv8-211", // Appletun · Dragon · 90 HP
  "bw7-152", // Altaria · Dragon · 70 HP
  "sm7-106", // Salamence · Dragon · 150 HP
  "sv6pt5-77", // Fraxure · Dragon · 100 HP
  "me2pt5-151", // Dragonair · Dragon · 100 HP
  "sm6-94", // Goodra · Dragon · 160 HP
  "sv4pt5-195", // Cyclizar · Dragon · 120 HP
  "bw7-99", // Flygon · Dragon · 140 HP
  "swsh12tg-TG09", // Druddigon · Dragon · 120 HP
  "swsh7-116", // Kyurem · Dragon · 120 HP
  "swsh4-93", // Zygarde · Fighting · 150 HP
  "swsh7-124", // Regidrago · Dragon · 130 HP
  "sv5-184", // Drampa · Colorless · 120 HP
  "xyp-XY10", // Dragalge · Dragon · 100 HP
  "sv8-136", // Palkia · Dragon · 130 HP
  "sma-SV79", // Silvally-GX · Colorless · 210 HP
  "svp-122", // Snorlax · Colorless · 160 HP
  "me3-99", // Raticate · Colorless · 90 HP
  "me1-151", // Spearow · Colorless · 60 HP
  "sm8-153", // Blissey · Colorless · 160 HP
  "me2-105", // Wigglytuff · Colorless · 120 HP
  "zsv10pt5-154", // Rufflet · Colorless · 70 HP
  "sv8pt5-167", // Eevee ex · Colorless · 200 HP
  "me2-78", // Aipom · Colorless · 70 HP
  "sv2-169", // Squawkabilly ex · Colorless · 160 HP
  "sv10-204", // Kangaskhan · Colorless · 120 HP
  "sv3-207", // Pidgey · Colorless · 60 HP
  "sv9-168", // Furret · Colorless · 120 HP
  "xy12-68", // Farfetch'd · Colorless · 70 HP
  "sv1-144", // Chansey · Colorless · 110 HP
  "swsh12pt5gg-GG23", // Dunsparce · Colorless · 60 HP
  "sv3pt5-108", // Lickitung · Colorless · 100 HP
  "smp-SM07", // Pikipek · Colorless · 60 HP
  "sv3-208", // Pidgeotto · Colorless · 90 HP
  "col1-21", // Smeargle · Colorless · 70 HP
  "swsh10-126", // Miltank · Colorless · 110 HP
  "svp-138", // Porygon2 · Colorless · 90 HP
  "swsh9-121", // Bibarel · Colorless · 120 HP
  "ex10-18", // Ursaring · Colorless · 80 HP
  "sm4-89", // Type: Null · Colorless · 110 HP
  "ecard1-11", // Fearow · Colorless · 70 HP
  "hgss1-8", // Noctowl · Colorless · 90 HP
  "ex10-32", // Stantler · Colorless · 70 HP
  "sm9-162", // Pikachu & Zekrom-GX · Lightning · 240 HP
  "sv3pt5-202", // Zapdos ex · Lightning · 200 HP
  "cel25-8", // Surfing Pikachu V · Lightning · 200 HP
  "cel25-6", // Flying Pikachu V · Lightning · 190 HP
  "sv2-256", // Meowscarada ex · Grass · 310 HP
  "sv8pt5-145", // Teal Mask Ogerpon ex · Grass · 210 HP
  "ex10-106", // Meganium ex · Grass · 150 HP
  "swshp-SWSH191", // Leafeon · Grass · 110 HP
  "smp-SM79", // Shining Celebi · Grass · 70 HP
  "swsh45sv-SV003", // Decidueye · Grass · 140 HP
  "swsh7-10", // Lilligant · Grass · 100 HP
  "sv4pt5-24", // Exeggutor · Psychic · 130 HP
  "xy5-9", // Sceptile · Grass · 140 HP
  "dp3-17", // Roserade · Grass · 90 HP
  "me2pt5-11", // Wurmple · Grass · 60 HP
  "ecard2-H30", // Victreebel · Grass · 90 HP
  "sv3pt5-43", // Oddish · Grass · 60 HP
  "me2pt5-12", // Silcoon · Grass · 90 HP
  "sv3pt5-69", // Bellsprout · Grass · 60 HP
  "sv4-9", // Steenee · Grass · 90 HP
  "sv8pt5-147", // Ceruledge ex · Fire · 270 HP
  "sv5-204", // Gouging Fire ex · Fire · 230 HP
  "zsv10pt5-98", // Darmanitan · Fire · 140 HP
  "bw5-19", // Heatmor · Fire · 90 HP
  "me1-139", // Litleo · Fire · 70 HP
  "swsh45sv-SV017", // Cinderace · Fire · 170 HP
  "swsh8-48", // Centiskorch · Fire · 130 HP
  "bw3-98", // Victini · Fire · 60 HP
  "bw4-100", // Emboar · Fire · 150 HP
  "hgss2-25", // Torkoal · Fire · 80 HP
  "ex10-7", // Houndoom · Fire · 70 HP
  "svp-116", // Infernape · Fire · 140 HP
  "svp-11", // Arcanine · Fire · 130 HP
  "swsh3-24", // Blaziken · Fire · 170 HP
  "swsh12-22", // Rapidash · Fire · 100 HP
  "sm8-42", // Typhlosion · Fire · 160 HP
  "sm5-19", // Magmortar · Fire · 130 HP
  "sv8-31", // Skeledirge · Fire · 180 HP
  "bwp-BW66", // Ninetales · Fire · 90 HP
  "sv2-261", // Chien-Pao ex · Water · 220 HP
  "ex16-99", // Walrein ex · Water · 150 HP
  "swsh3-39", // Milotic · Water · 120 HP
  "sv10-57", // Buizel · Water · 70 HP
  "sv4pt5-225", // Palafin · Water · 150 HP
  "xy3-24", // Clawitzer · Water · 100 HP
  "sv3pt5-120", // Staryu · Water · 60 HP
  "swsh8-64", // Swampert · Water · 170 HP
  "bw7-35", // Golduck · Water · 90 HP
  "sv3pt5-72", // Tentacool · Water · 60 HP
  "swsh2-40", // Gyarados · Water · 180 HP
  "sv3pt5-90", // Shellder · Water · 70 HP
  "bw11-39", // Samurott · Water · 140 HP
  "swsh1-42", // Krabby · Water · 80 HP
  "pl3-87", // Wailmer · Water · 80 HP
  "ecard1-102", // Corsola · Water · 60 HP
  "me2-103", // Toxtricity · Darkness · 140 HP
  "rsv10pt5-117", // Galvantula · Lightning · 90 HP
  "swsh45sv-SV051", // Dedenne · Psychic · 70 HP
  "swsh2-66", // Vikavolt · Lightning · 150 HP
  "rsv10pt5-118", // Stunfisk · Lightning · 110 HP
  "sv10-197", // Rotom · Lightning · 60 HP
  "sm11-66", // Eelektross · Lightning · 150 HP
  "sv4pt5-132", // Raichu · Lightning · 120 HP
  "sv4-193", // Plusle · Lightning · 70 HP
  "sv4pt5-139", // Thundurus · Lightning · 110 HP
  "sv4-194", // Minun · Lightning · 70 HP
  "sv4pt5-144", // Pawmot · Lightning · 130 HP
  "sv1-208", // Pachirisu · Lightning · 70 HP
  "swsh45sv-SV040", // Boltund · Lightning · 130 HP
  "sv9-50", // Togedemaru · Lightning · 80 HP
  "svp-153", // Magneton · Lightning · 100 HP
  "swsh7-57", // Emolga · Lightning · 70 HP
  "swsh6-51", // Zebstrika · Lightning · 120 HP
  "sv1-245", // Gardevoir ex · Psychic · 310 HP
  "sv8pt5-157", // Iron Valiant ex · Psychic · 220 HP
  "sv4pt5-167", // Tinkaton · Psychic · 140 HP
  "bw10-104", // Dusknoir · Psychic · 130 HP
  "hgss1-12", // Slowking · Psychic · 80 HP
  "swsh10-62", // Gallade · Psychic · 160 HP
  "bw7-150", // Golurk · Psychic · 130 HP
  "ex16-4", // Banette · Psychic · 70 HP
  "swsh35-20", // Hatterene · Psychic · 150 HP
  "bw6-126", // Reuniclus · Psychic · 90 HP
  "sm12-97", // Mimikyu · Psychic · 70 HP
  "sm11-81", // Drifblim · Psychic · 100 HP
  "g1-36", // Jynx · Psychic · 70 HP
  "svp-10", // Espathra · Psychic · 110 HP
  "swsh1-85", // Gengar · Psychic · 110 HP
  "smp-SM222", // Mismagius · Psychic · 110 HP
  "sv5-207", // Iron Boulder ex · Fighting · 240 HP
  "sv4-202", // Garganacl · Fighting · 160 HP
  "ex1-98", // Hitmonchan ex · Fighting · 90 HP
  "sv3pt5-27", // Sandshrew · Fighting · 60 HP
  "sv1-246", // Great Tusk ex · Fighting · 250 HP
  "sv4pt5-171", // Annihilape · Fighting · 140 HP
  "sv9-166", // Lycanroc · Fighting · 120 HP
  "me2-49", // Gligar · Fighting · 70 HP
  "swsh6-92", // Grapploct · Fighting · 140 HP
  "sv4-200", // Mienshao · Fighting · 100 HP
  "swshp-SWSH067", // Donphan · Fighting · 150 HP
  "swsh10tg-TG07", // Falinks · Fighting · 110 HP
  "pl1-13", // Rampardos · Fighting · 130 HP
  "swsh4-89", // Regirock · Fighting · 130 HP
  "sm3-67", // Rhyperior · Fighting · 160 HP
  "swsh12tg-TG08", // Passimian · Fighting · 110 HP
  "sm2-76", // Mudsdale · Fighting · 140 HP
  "bw1-61", // Throh · Fighting · 100 HP
  "sv8pt5-163", // Pecharunt ex · Darkness · 190 HP
  "sv1-218", // Mabosstiff · Darkness · 130 HP
  "swsh11tg-TG09", // Spiritomb · Darkness · 60 HP
  "xyp-XY62", // Absol-EX · Darkness · 170 HP
  "swsh45sv-SV080", // Galarian Obstagoon · Darkness · 160 HP
  "swsh12pt5-83", // Hoopa · Darkness · 120 HP
  "ex14-10", // Sableye · Darkness · 60 HP
  "bw6-127", // Krookodile · Darkness · 150 HP
  "swsh10tg-TG09", // Mightyena · Darkness · 110 HP
  "ex8-6", // Crawdaunt · Darkness · 70 HP
  "swsh7-103", // Zoroark · Darkness · 120 HP
  "swshp-SWSH187", // Liepard · Darkness · 100 HP
  "pl2-13", // Shiftry · Darkness · 130 HP
  "swsh6-102", // Seviper · Darkness · 110 HP
  "bw2-69", // Mandibuzz · Darkness · 90 HP
  "sv2-245", // Copperajah ex · Metal · 300 HP
  "sv4pt5-66", // Iron Treads ex · Metal · 220 HP
  "svp-60", // Aegislash · Metal · 150 HP
  "zsv10pt5-140", // Klang · Metal · 90 HP
  "sma-SV30", // Beldum · Metal · 60 HP
  "sv7-162", // Orthworm ex · Metal · 220 HP
  "cel25-21", // Solgaleo · Metal · 170 HP
  "swsh2-205", // Galarian Perrserker · Metal · 120 HP
  "me5-63", // Bronzor · Metal · 80 HP
  "ex5-99", // Registeel ex · Metal · 90 HP
  "sm6-81", // Empoleon · Metal · 160 HP
  "sv9-107", // Magearna · Metal · 90 HP
  "xy11-73", // Klinklang · Metal · 140 HP
  "swsh3-25", // Heatran · Fire · 130 HP
  "swsh8-190", // Corviknight · Metal · 170 HP
  "xyp-XY119", // Genesect · Metal · 110 HP
  "sv6-200", // Dragapult ex · Dragon · 320 HP
  "sm11-156", // Haxorus · Dragon · 150 HP
  "swsh11-37", // Kingdra · Water · 150 HP
  "me2pt5-247", // Dreepy · Dragon · 70 HP
  "sv4pt5-220", // Noivern ex · Dragon · 260 HP
  "me55-111", // Hakamo-o · Dragon · 90 HP
  "sv4pt5-194", // Noibat · Dragon · 70 HP
  "sv9-113", // Shelgon · Dragon · 100 HP
  "swsh45sv-SV013", // Flapple · Grass · 80 HP
  "swsh7-114", // Zweilous · Dragon · 100 HP
  "sm12-160", // Jangmo-o · Dragon · 60 HP
  "me4-66", // Goomy · Dragon · 60 HP
  "me2pt5-150", // Dratini · Dragon · 80 HP
  "sv9-178", // Dudunsparce ex · Colorless · 270 HP
  "rsv10pt5-162", // Bouffalant ex · Colorless · 220 HP
  "sm12-248", // Stoutland · Colorless · 150 HP
  "zsv10pt5-153", // Cinccino · Colorless · 100 HP
  "ex6-16", // Tauros · Colorless · 70 HP
  "sv4pt5-221", // Pidgeot ex · Colorless · 280 HP
  "sv8pt5-82", // Lugia ex · Colorless · 220 HP
  "swsh6-118", // Porygon-Z · Colorless · 140 HP
  "bw2-88", // Braviary · Colorless · 100 HP
  "pl4-21", // Lopunny · Colorless · 80 HP
  "swshp-SWSH247", // Regigigas · Colorless · 150 HP
  "sv6pt5-78", // Persian · Colorless · 110 HP
  "bwp-BW65", // Jigglypuff · Colorless · 60 HP
  "sm7-115", // Slaking · Colorless · 160 HP
  "sv4pt5-206", // Greedent · Colorless · 120 HP
  "sv3pt5-84", // Doduo · Colorless · 70 HP
  "pl3-11", // Staraptor FB · Colorless · 80 HP
  "ex2-14", // Zangoose · Colorless · 70 HP
];
