/**
 * World records per track and speed class, with mushrooms, from mkwrs.com (checked 2026-10-29).
 * Written by scripts/pull-tt-records.ts; the monthly check (/api/cron/tt-records) emails when a
 * record gets faster. Used as the floor: no time faster than a track's record can be saved (8A).
 * Keys: "<game>:<track id>:<cc>", values in ms.
 */

export const TT_RECORDS_CHECKED = "2026-10-29";

export const TT_RECORDS: Record<string, number> = {
  "mk8dx:acorn-daisy-circuit:150": 106941, // 1:46.941 Wii Daisy Circuit
  "mk8dx:acorn-daisy-circuit:200": 75692, // 1:15.692 Wii Daisy Circuit
  "mk8dx:acorn-dk-mountain:150": 127895, // 2:07.895 GCN DK Mountain
  "mk8dx:acorn-dk-mountain:200": 103257, // 1:43.257 GCN DK Mountain
  "mk8dx:acorn-piranha-plant-cove:150": 116637, // 1:56.637 Tour Piranha Plant Cove
  "mk8dx:acorn-piranha-plant-cove:200": 83616, // 1:23.616 Tour Piranha Plant Cove
  "mk8dx:acorn-rome-avanti:150": 102823, // 1:42.823 Tour Rome Avanti
  "mk8dx:acorn-rome-avanti:200": 73407, // 1:13.407 Tour Rome Avanti
  "mk8dx:banana-dk-jungle:150": 119819, // 1:59.819 3DS DK Jungle
  "mk8dx:banana-dk-jungle:200": 86667, // 1:26.667 3DS DK Jungle
  "mk8dx:banana-donut-plains-3:150": 72203, // 1:12.203 SNES Donut Plains 3
  "mk8dx:banana-donut-plains-3:200": 55241, // 0:55.241 SNES Donut Plains 3
  "mk8dx:banana-dry-dry-desert:150": 111955, // 1:51.955 GCN Dry Dry Desert
  "mk8dx:banana-dry-dry-desert:200": 76702, // 1:16.702 GCN Dry Dry Desert
  "mk8dx:banana-royal-raceway:150": 114148, // 1:54.148 N64 Royal Raceway
  "mk8dx:banana-royal-raceway:200": 83127, // 1:23.127 N64 Royal Raceway
  "mk8dx:bell-big-blue:150": 82659, // 1:22.659 Big Blue
  "mk8dx:bell-big-blue:200": 60001, // 1:00.001 Big Blue
  "mk8dx:bell-neo-bowser-city:150": 101960, // 1:41.960 3DS Neo Bowser City
  "mk8dx:bell-neo-bowser-city:200": 78562, // 1:18.562 3DS Neo Bowser City
  "mk8dx:bell-ribbon-road:150": 103096, // 1:43.096 GBA Ribbon Road
  "mk8dx:bell-ribbon-road:200": 76566, // 1:16.566 GBA Ribbon Road
  "mk8dx:bell-super-bell-subway:150": 98894, // 1:38.894 Super Bell Subway
  "mk8dx:bell-super-bell-subway:200": 72275, // 1:12.275 Super Bell Subway
  "mk8dx:boomerang-bangkok-rush:150": 101391, // 1:41.391 Tour Bangkok Rush
  "mk8dx:boomerang-bangkok-rush:200": 72383, // 1:12.383 Tour Bangkok Rush
  "mk8dx:boomerang-mario-circuit:150": 95939, // 1:35.939 DS Mario Circuit
  "mk8dx:boomerang-mario-circuit:200": 70439, // 1:10.439 DS Mario Circuit
  "mk8dx:boomerang-singapore-speedway:150": 114733, // 1:54.733 Tour Singapore Speedway
  "mk8dx:boomerang-singapore-speedway:200": 79857, // 1:19.857 Tour Singapore Speedway
  "mk8dx:boomerang-waluigi-stadium:150": 112482, // 1:52.482 GCN Waluigi Stadium
  "mk8dx:boomerang-waluigi-stadium:200": 84598, // 1:24.598 GCN Waluigi Stadium
  "mk8dx:cherry-koopa-cape:150": 115541, // 1:55.541 Wii Koopa Cape
  "mk8dx:cherry-koopa-cape:200": 83976, // 1:23.976 Wii Koopa Cape
  "mk8dx:cherry-los-angeles-laps:150": 104773, // 1:44.773 Tour Los Angeles Laps
  "mk8dx:cherry-los-angeles-laps:200": 73567, // 1:13.567 Tour Los Angeles Laps
  "mk8dx:cherry-sunset-wilds:150": 91500, // 1:31.500 GBA Sunset Wilds
  "mk8dx:cherry-sunset-wilds:200": 66678, // 1:06.678 GBA Sunset Wilds
  "mk8dx:cherry-vancouver-velocity:150": 117897, // 1:57.897 Tour Vancouver Velocity
  "mk8dx:cherry-vancouver-velocity:200": 83202, // 1:23.202 Tour Vancouver Velocity
  "mk8dx:crossing-animal-crossing:150": 95213, // 1:35.213 Animal Crossing
  "mk8dx:crossing-animal-crossing:200": 69903, // 1:09.903 Animal Crossing
  "mk8dx:crossing-baby-park:150": 61511, // 1:01.511 GCN Baby Park
  "mk8dx:crossing-baby-park:200": 44650, // 0:44.650 GCN Baby Park
  "mk8dx:crossing-cheese-land:150": 101359, // 1:41.359 GBA Cheese Land
  "mk8dx:crossing-cheese-land:200": 74367, // 1:14.367 GBA Cheese Land
  "mk8dx:crossing-wild-woods:150": 104652, // 1:44.652 Wild Woods
  "mk8dx:crossing-wild-woods:200": 75911, // 1:15.911 Wild Woods
  "mk8dx:egg-dragon-driftway:150": 99220, // 1:39.220 Dragon Driftway
  "mk8dx:egg-dragon-driftway:200": 75769, // 1:15.769 Dragon Driftway
  "mk8dx:egg-excitebike-arena:150": 97738, // 1:37.738 Excitebike Arena
  "mk8dx:egg-excitebike-arena:200": 73754, // 1:13.754 Excitebike Arena
  "mk8dx:egg-mute-city:150": 110260, // 1:50.260 Mute City
  "mk8dx:egg-mute-city:200": 80246, // 1:20.246 Mute City
  "mk8dx:egg-yoshi-circuit:150": 100349, // 1:40.349 GCN Yoshi Circuit
  "mk8dx:egg-yoshi-circuit:200": 72745, // 1:12.745 GCN Yoshi Circuit
  "mk8dx:feather-athens-dash:150": 96036, // 1:36.036 Tour Athens Dash
  "mk8dx:feather-athens-dash:200": 70086, // 1:10.086 Tour Athens Dash
  "mk8dx:feather-daisy-cruiser:150": 93211, // 1:33.211 GCN Daisy Cruiser
  "mk8dx:feather-daisy-cruiser:200": 68148, // 1:08.148 GCN Daisy Cruiser
  "mk8dx:feather-moonview-highway:150": 101367, // 1:41.367 Wii Moonview Highway
  "mk8dx:feather-moonview-highway:200": 71266, // 1:11.266 Wii Moonview Highway
  "mk8dx:feather-squeaky-clean-sprint:150": 118956, // 1:58.956 Squeaky Clean Sprint
  "mk8dx:feather-squeaky-clean-sprint:200": 84745, // 1:24.745 Squeaky Clean Sprint
  "mk8dx:flower-mario-circuit:150": 103130, // 1:43.130 Mario Circuit
  "mk8dx:flower-mario-circuit:200": 72380, // 1:12.380 Mario Circuit
  "mk8dx:flower-shy-guy-falls:150": 114700, // 1:54.700 Shy Guy Falls
  "mk8dx:flower-shy-guy-falls:200": 85282, // 1:25.282 Shy Guy Falls
  "mk8dx:flower-toad-harbor:150": 121429, // 2:01.429 Toad Harbor
  "mk8dx:flower-toad-harbor:200": 85625, // 1:25.625 Toad Harbor
  "mk8dx:flower-twisted-mansion:150": 112735, // 1:52.735 Twisted Mansion
  "mk8dx:flower-twisted-mansion:200": 81707, // 1:21.707 Twisted Mansion
  "mk8dx:fruit-amsterdam-drift:150": 94102, // 1:34.102 Tour Amsterdam Drift
  "mk8dx:fruit-amsterdam-drift:200": 66308, // 1:06.308 Tour Amsterdam Drift
  "mk8dx:fruit-dk-summit:150": 113444, // 1:53.444 Wii DK Summit
  "mk8dx:fruit-dk-summit:200": 90649, // 1:30.649 Wii DK Summit
  "mk8dx:fruit-riverside-park:150": 84500, // 1:24.500 GBA Riverside Park
  "mk8dx:fruit-riverside-park:200": 61706, // 1:01.706 GBA Riverside Park
  "mk8dx:fruit-yoshis-island:150": 116009, // 1:56.009 Yoshi's Island
  "mk8dx:fruit-yoshis-island:200": 85188, // 1:25.188 Yoshi's Island
  "mk8dx:golden-dash-choco-mountain:150": 110054, // 1:50.054 N64 Choco Mountain
  "mk8dx:golden-dash-choco-mountain:200": 79071, // 1:19.071 N64 Choco Mountain
  "mk8dx:golden-dash-coconut-mall:150": 99961, // 1:39.961 Wii Coconut Mall
  "mk8dx:golden-dash-coconut-mall:200": 73172, // 1:13.172 Wii Coconut Mall
  "mk8dx:golden-dash-paris-promenade:150": 108571, // 1:48.571 Tour Paris Promenade
  "mk8dx:golden-dash-paris-promenade:200": 75978, // 1:15.978 Tour Paris Promenade
  "mk8dx:golden-dash-toad-circuit:150": 79639, // 1:19.639 3DS Toad Circuit
  "mk8dx:golden-dash-toad-circuit:200": 55763, // 0:55.763 3DS Toad Circuit
  "mk8dx:leaf-music-park:150": 108961, // 1:48.961 3DS Music Park
  "mk8dx:leaf-music-park:200": 82773, // 1:22.773 3DS Music Park
  "mk8dx:leaf-sherbet-land:150": 106182, // 1:46.182 GCN Sherbet Land
  "mk8dx:leaf-sherbet-land:200": 75872, // 1:15.872 GCN Sherbet Land
  "mk8dx:leaf-wario-stadium:150": 108984, // 1:48.984 DS Wario Stadium
  "mk8dx:leaf-wario-stadium:200": 80769, // 1:20.769 DS Wario Stadium
  "mk8dx:leaf-yoshi-valley:150": 116872, // 1:56.872 N64 Yoshi Valley
  "mk8dx:leaf-yoshi-valley:200": 83511, // 1:23.511 N64 Yoshi Valley
  "mk8dx:lightning-grumble-volcano:150": 111167, // 1:51.167 Wii Grumble Volcano
  "mk8dx:lightning-grumble-volcano:200": 80529, // 1:20.529 Wii Grumble Volcano
  "mk8dx:lightning-piranha-plant-slide:150": 117161, // 1:57.161 3DS Piranha Plant Slide
  "mk8dx:lightning-piranha-plant-slide:200": 85622, // 1:25.622 3DS Piranha Plant Slide
  "mk8dx:lightning-rainbow-road:150": 78920, // 1:18.920 N64 Rainbow Road
  "mk8dx:lightning-rainbow-road:200": 56143, // 0:56.143 N64 Rainbow Road
  "mk8dx:lightning-tick-tock-clock:150": 100997, // 1:40.997 DS Tick-Tock Clock
  "mk8dx:lightning-tick-tock-clock:200": 72328, // 1:12.328 DS Tick-Tock Clock
  "mk8dx:lucky-cat-ninja-hideaway:150": 110967, // 1:50.967 Tour Ninja Hideaway
  "mk8dx:lucky-cat-ninja-hideaway:200": 83958, // 1:23.958 Tour Ninja Hideaway
  "mk8dx:lucky-cat-shroom-ridge:150": 103416, // 1:43.416 DS Shroom Ridge
  "mk8dx:lucky-cat-shroom-ridge:200": 74686, // 1:14.686 DS Shroom Ridge
  "mk8dx:lucky-cat-sky-garden:150": 85045, // 1:25.045 GBA Sky Garden
  "mk8dx:lucky-cat-sky-garden:200": 61226, // 1:01.226 GBA Sky Garden
  "mk8dx:lucky-cat-tokyo-blur:150": 84378, // 1:24.378 Tour Tokyo Blur
  "mk8dx:lucky-cat-tokyo-blur:200": 58541, // 0:58.541 Tour Tokyo Blur
  "mk8dx:moon-berlin-byways:150": 114616, // 1:54.616 Tour Berlin Byways
  "mk8dx:moon-berlin-byways:200": 81261, // 1:21.261 Tour Berlin Byways
  "mk8dx:moon-merry-mountain:150": 108621, // 1:48.621 Tour Merry Mountain
  "mk8dx:moon-merry-mountain:200": 77794, // 1:17.794 Tour Merry Mountain
  "mk8dx:moon-peach-gardens:150": 121307, // 2:01.307 DS Peach Gardens
  "mk8dx:moon-peach-gardens:200": 85407, // 1:25.407 DS Peach Gardens
  "mk8dx:moon-rainbow-road:150": 96064, // 1:36.064 3DS Rainbow Road
  "mk8dx:moon-rainbow-road:200": 68972, // 1:08.972 3DS Rainbow Road
  "mk8dx:mushroom-mario-kart-stadium:150": 93628, // 1:33.628 Mario Kart Stadium
  "mk8dx:mushroom-mario-kart-stadium:200": 65415, // 1:05.415 Mario Kart Stadium
  "mk8dx:mushroom-sweet-sweet-canyon:150": 107708, // 1:47.708 Sweet Sweet Canyon
  "mk8dx:mushroom-sweet-sweet-canyon:200": 80406, // 1:20.406 Sweet Sweet Canyon
  "mk8dx:mushroom-thwomp-ruins:150": 106750, // 1:46.750 Thwomp Ruins
  "mk8dx:mushroom-thwomp-ruins:200": 75420, // 1:15.420 Thwomp Ruins
  "mk8dx:mushroom-water-park:150": 98132, // 1:38.132 Water Park
  "mk8dx:mushroom-water-park:200": 70317, // 1:10.317 Water Park
  "mk8dx:propeller-mushroom-gorge:150": 86529, // 1:26.529 Wii Mushroom Gorge
  "mk8dx:propeller-mushroom-gorge:200": 60995, // 1:00.995 Wii Mushroom Gorge
  "mk8dx:propeller-sky-high-sundae:150": 112429, // 1:52.429 Sky-High Sundae
  "mk8dx:propeller-sky-high-sundae:200": 78975, // 1:18.975 Sky-High Sundae
  "mk8dx:propeller-snow-land:150": 85344, // 1:25.344 GBA Snow Land
  "mk8dx:propeller-snow-land:200": 63729, // 1:03.729 GBA Snow Land
  "mk8dx:propeller-sydney-sprint:150": 118476, // 1:58.476 Tour Sydney Sprint
  "mk8dx:propeller-sydney-sprint:200": 83735, // 1:23.735 Tour Sydney Sprint
  "mk8dx:rock-boo-lake:150": 79536, // 1:19.536 GBA Boo Lake
  "mk8dx:rock-boo-lake:200": 58741, // 0:58.741 GBA Boo Lake
  "mk8dx:rock-london-loop:150": 125617, // 2:05.617 Tour London Loop
  "mk8dx:rock-london-loop:200": 87817, // 1:27.817 Tour London Loop
  "mk8dx:rock-maple-treeway:150": 141609, // 2:21.609 Wii Maple Treeway
  "mk8dx:rock-maple-treeway:200": 108107, // 1:48.107 Wii Maple Treeway
  "mk8dx:rock-rock-rock-mountain:150": 126672, // 2:06.672 3DS Rock Rock Mountain
  "mk8dx:rock-rock-rock-mountain:200": 86866, // 1:26.866 3DS Rock Rock Mountain
  "mk8dx:shell-cheep-cheep-beach:150": 105397, // 1:45.397 DS Cheep Cheep Beach
  "mk8dx:shell-cheep-cheep-beach:200": 75077, // 1:15.077 DS Cheep Cheep Beach
  "mk8dx:shell-mario-circuit:150": 82505, // 1:22.505 GBA Mario Circuit
  "mk8dx:shell-mario-circuit:200": 59767, // 0:59.767 GBA Mario Circuit
  "mk8dx:shell-moo-moo-meadows:150": 82898, // 1:22.898 Wii Moo Moo Meadows
  "mk8dx:shell-moo-moo-meadows:200": 58222, // 0:58.222 Wii Moo Moo Meadows
  "mk8dx:shell-toads-turnpike:150": 104457, // 1:44.457 N64 Toad's Turnpike
  "mk8dx:shell-toads-turnpike:200": 71652, // 1:11.652 N64 Toad's Turnpike
  "mk8dx:special-bone-dry-dunes:150": 105631, // 1:45.631 Bone-Dry Dunes
  "mk8dx:special-bone-dry-dunes:200": 78913, // 1:18.913 Bone-Dry Dunes
  "mk8dx:special-bowsers-castle:150": 117108, // 1:57.108 Bowser's Castle
  "mk8dx:special-bowsers-castle:200": 85213, // 1:25.213 Bowser's Castle
  "mk8dx:special-cloudtop-cruise:150": 118645, // 1:58.645 Cloudtop Cruise
  "mk8dx:special-cloudtop-cruise:200": 88393, // 1:28.393 Cloudtop Cruise
  "mk8dx:special-rainbow-road:150": 117892, // 1:57.892 Rainbow Road
  "mk8dx:special-rainbow-road:200": 91103, // 1:31.103 Rainbow Road
  "mk8dx:spiny-bowser-castle-3:150": 99368, // 1:39.368 SNES Bowser Castle 3
  "mk8dx:spiny-bowser-castle-3:200": 72784, // 1:12.784 SNES Bowser Castle 3
  "mk8dx:spiny-madrid-drive:150": 115675, // 1:55.675 Tour Madrid Drive
  "mk8dx:spiny-madrid-drive:200": 81704, // 1:21.704 Tour Madrid Drive
  "mk8dx:spiny-rainbow-road:150": 150421, // 2:30.421 Wii Rainbow Road
  "mk8dx:spiny-rainbow-road:200": 110225, // 1:50.225 Wii Rainbow Road
  "mk8dx:spiny-rosalinas-ice-world:150": 115531, // 1:55.531 3DS Rosalina's Ice World
  "mk8dx:spiny-rosalinas-ice-world:200": 84898, // 1:24.898 3DS Rosalina's Ice World
  "mk8dx:star-dolphin-shoals:150": 111727, // 1:51.727 Dolphin Shoals
  "mk8dx:star-dolphin-shoals:200": 81322, // 1:21.322 Dolphin Shoals
  "mk8dx:star-electrodome:150": 114380, // 1:54.380 Electrodrome
  "mk8dx:star-electrodome:200": 81371, // 1:21.371 Electrodrome
  "mk8dx:star-mount-wario:150": 99841, // 1:39.841 Mount Wario
  "mk8dx:star-mount-wario:200": 74577, // 1:14.577 Mount Wario
  "mk8dx:star-sunshine-airport:150": 116321, // 1:56.321 Sunshine Airport
  "mk8dx:star-sunshine-airport:200": 87458, // 1:27.458 Sunshine Airport
  "mk8dx:triforce-hyrule-circuit:150": 106198, // 1:46.198 Hyrule Circuit
  "mk8dx:triforce-hyrule-circuit:200": 79454, // 1:19.454 Hyrule Circuit
  "mk8dx:triforce-ice-ice-outpost:150": 103711, // 1:43.711 Ice Ice Outpost
  "mk8dx:triforce-ice-ice-outpost:200": 76384, // 1:16.384 Ice Ice Outpost
  "mk8dx:triforce-rainbow-road:150": 85117, // 1:25.117 SNES Rainbow Road
  "mk8dx:triforce-rainbow-road:200": 61494, // 1:01.494 SNES Rainbow Road
  "mk8dx:triforce-warios-gold-mine:150": 120636, // 2:00.636 Wii Wario's Gold Mine
  "mk8dx:triforce-warios-gold-mine:200": 84430, // 1:24.430 Wii Wario's Gold Mine
  "mk8dx:turnip-kalimari-desert:150": 86953, // 1:26.953 N64 Kalimari Desert
  "mk8dx:turnip-kalimari-desert:200": 60690, // 1:00.690 N64 Kalimari Desert
  "mk8dx:turnip-mario-circuit-3:150": 89791, // 1:29.791 SNES Mario Circuit 3
  "mk8dx:turnip-mario-circuit-3:200": 63789, // 1:03.789 SNES Mario Circuit 3
  "mk8dx:turnip-new-york-minute:150": 81472, // 1:21.472 Tour New York Minute
  "mk8dx:turnip-new-york-minute:200": 57827, // 0:57.827 Tour New York Minute
  "mk8dx:turnip-waluigi-pinball:150": 137727, // 2:17.727 DS Waluigi Pinball
  "mk8dx:turnip-waluigi-pinball:200": 104856, // 1:44.856 DS Waluigi Pinball
  "mkworld:banana-acorn-heights:150": 116888, // 1:56.888 Acorn Heights
  "mkworld:banana-desert-hills:150": 90636, // 1:30.636 Desert Hills
  "mkworld:banana-dino-dino-jungle:150": 104105, // 1:44.105 Dino Dino Jungle
  "mkworld:banana-peach-beach:150": 99804, // 1:39.804 Peach Beach
  "mkworld:flower-crown-city:150": 123354, // 2:03.354 Crown City
  "mkworld:flower-dk-spaceport:150": 88227, // 1:28.227 DK Spaceport
  "mkworld:flower-mario-circuit:150": 62770, // 1:02.770 Mario Circuit
  "mkworld:flower-toads-factory:150": 111172, // 1:51.172 Toad's Factory
  "mkworld:leaf-boo-cinema:150": 123713, // 2:03.713 Boo Cinema
  "mkworld:leaf-dk-pass:150": 117793, // 1:57.793 DK Pass
  "mkworld:leaf-dry-bones-burnout:150": 125288, // 2:05.288 Dry Bones Burnout
  "mkworld:leaf-wario-shipyard:150": 135904, // 2:15.904 Wario Shipyard
  "mkworld:lightning-bowsers-castle:150": 128499, // 2:08.499 Bowser's Castle
  "mkworld:lightning-starview-peak:150": 129187, // 2:09.187 Starview Peak
  "mkworld:lightning-wario-stadium:150": 119598, // 1:59.598 Wario Stadium
  "mkworld:lightning-whistlestop-summit:150": 103723, // 1:43.723 Whistlestop Summit
  "mkworld:mushroom-cheep-cheep-falls:150": 113881, // 1:53.881 Cheep Cheep Falls
  "mkworld:mushroom-moo-moo-meadows:150": 113159, // 1:53.159 Moo Moo Meadows
  "mkworld:mushroom-peach-stadium:150": 133613, // 2:13.613 Peach Stadium
  "mkworld:mushroom-shy-guy-bazaar:150": 110238, // 1:50.238 Shy Guy Bazaar
  "mkworld:shell-dandelion-depths:150": 136997, // 2:16.997 Dandelion Depths
  "mkworld:shell-koopa-troopa-beach:150": 86309, // 1:26.309 Koopa Troopa Beach
  "mkworld:shell-mario-bros-circuit:150": 107342, // 1:47.342 Mario Bros. Circuit
  "mkworld:shell-salty-salty-speedway:150": 114345, // 1:54.345 Salty Salty Speedway
  "mkworld:snes-choco-island-1:150": 89238, // 1:29.238 SNES Choco Island 1
  "mkworld:snes-choco-island-2:150": 122657, // 2:02.657 SNES Choco Island 2
  "mkworld:snes-ghost-valley-1:150": 99238, // 1:39.238 SNES Ghost Valley 1
  "mkworld:snes-ghost-valley-2:150": 95357, // 1:35.357 SNES Ghost Valley 2
  "mkworld:snes-ghost-valley-3:150": 133877, // 2:13.877 SNES Ghost Valley 3
  "mkworld:snes-koopa-beach-1:150": 73951, // 1:13.951 SNES Koopa Beach 1
  "mkworld:snes-mario-circuit-1:150": 75289, // 1:15.289 SNES Mario Circuit 1
  "mkworld:snes-mario-circuit-2:150": 100226, // 1:40.226 SNES Mario Circuit 2
  "mkworld:snes-mario-circuit-3:150": 110687, // 1:50.687 SNES Mario Circuit 3
  "mkworld:snes-vanilla-lake-1:150": 81828, // 1:21.828 SNES Vanilla Lake 1
  "mkworld:special-great-block-ruins:150": 121590, // 2:01.590 Great ? Block Ruins
  "mkworld:special-rainbow-road:150": 232710, // 3:52.710 Rainbow Road
  "mkworld:star-airship-fortress:150": 113991, // 1:53.991 Airship Fortress
  "mkworld:star-choco-mountain:150": 120680, // 2:00.680 Choco Mountain
  "mkworld:star-faraway-oasis:150": 114682, // 1:54.682 Faraway Oasis
  "mkworld:star-sky-high-sundae:150": 112572, // 1:52.572 Sky-High Sundae
};
