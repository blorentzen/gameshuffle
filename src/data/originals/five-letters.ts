/**
 * Five Letters (break mode): our own word lists, written by hand (no outside
 * dictionary). ANSWERS are the gaming words chat works out, each with the
 * category shown as a clue. GUESSES are the other words chat may play: common
 * starter words and everyday words, so a usual first guess counts. Every word
 * is exactly five letters, A to Z, and family friendly. Never reorder or
 * remove an answer: rounds remember answers by word for the 30-day no-repeat
 * list, so appending is safe and removing is not.
 */

export interface FiveLetterAnswer { word: string; category: string }

const C = "A character";
const R = "Racing";
const F = "Fighting";
const P = "Party games";
const G = "A gaming word";
const I = "An item";

export const FIVE_LETTER_ANSWERS: FiveLetterAnswer[] = [
  { word: "MARIO", category: C }, { word: "LUIGI", category: C }, { word: "PEACH", category: C }, { word: "DAISY", category: C },
  { word: "WARIO", category: C }, { word: "YOSHI", category: C }, { word: "KIRBY", category: C }, { word: "BIRDO", category: C },
  { word: "KOOPA", category: C }, { word: "KAMEK", category: C }, { word: "SAMUS", category: C }, { word: "ZELDA", category: C },
  { word: "SONIC", category: C }, { word: "JOKER", category: C }, { word: "SHULK", category: C }, { word: "MARTH", category: C },
  { word: "CHROM", category: C }, { word: "PICHU", category: C }, { word: "LUCAS", category: C }, { word: "ROBIN", category: C },
  { word: "MERCY", category: C }, { word: "GENJI", category: C }, { word: "HANZO", category: C }, { word: "SIGMA", category: C },
  { word: "MOIRA", category: C }, { word: "STORM", category: C }, { word: "GROOT", category: C }, { word: "MAGIK", category: C },
  { word: "BLADE", category: C }, { word: "NAMOR", category: C }, { word: "VENOM", category: C },
  { word: "SHELL", category: I }, { word: "COINS", category: I }, { word: "BOMBS", category: I }, { word: "STARS", category: I },
  { word: "HEART", category: I }, { word: "SWORD", category: I }, { word: "ARROW", category: I }, { word: "CHEST", category: I },
  { word: "CROWN", category: I }, { word: "TOKEN", category: I }, { word: "MEDAL", category: I }, { word: "PRIZE", category: I },
  { word: "BOOST", category: R }, { word: "DRIFT", category: R }, { word: "GLIDE", category: R }, { word: "KARTS", category: R },
  { word: "BIKES", category: R }, { word: "WHEEL", category: R }, { word: "TRACK", category: R }, { word: "RALLY", category: R },
  { word: "TURBO", category: R }, { word: "NITRO", category: R }, { word: "SPEED", category: R }, { word: "ROUTE", category: R },
  { word: "SMASH", category: F }, { word: "COMBO", category: F }, { word: "GUARD", category: F }, { word: "DODGE", category: F },
  { word: "SPIKE", category: F }, { word: "PARRY", category: F }, { word: "TAUNT", category: F }, { word: "LEDGE", category: F },
  { word: "STAGE", category: F }, { word: "BRAWL", category: F }, { word: "PUNCH", category: F }, { word: "THROW", category: F },
  { word: "BOARD", category: P }, { word: "CARDS", category: P }, { word: "PARTY", category: P }, { word: "TEAMS", category: P },
  { word: "STEAL", category: P }, { word: "BONUS", category: P }, { word: "TURNS", category: P }, { word: "SPACE", category: P },
  { word: "PIXEL", category: G }, { word: "LEVEL", category: G }, { word: "SCORE", category: G }, { word: "QUEST", category: G },
  { word: "LOBBY", category: G }, { word: "SPAWN", category: G }, { word: "ARENA", category: G }, { word: "RIVAL", category: G },
  { word: "GAMER", category: G }, { word: "CHAMP", category: G }, { word: "EMOTE", category: G }, { word: "SKINS", category: G },
  { word: "TIMER", category: G }, { word: "POWER", category: G }, { word: "MAGIC", category: G }, { word: "SPELL", category: G },
  { word: "ARMOR", category: G }, { word: "TOWER", category: G }, { word: "SQUAD", category: G }, { word: "SPLAT", category: G },
  { word: "PAINT", category: G }, { word: "GHOST", category: G }, { word: "CHAOS", category: G }, { word: "TITLE", category: G },
];

/** Other words chat may guess (not answers). */
const GUESS_WORDS = `
ADIEU AUDIO RAISE ARISE STARE CRANE SLATE TRACE CRATE LEAST TEARS NOTES ALIEN ALONE ROAST STONE SHINE TRAIN
ABOUT ABOVE ACTOR ACUTE ADMIT ADOPT ADULT AFTER AGAIN AGENT AGREE AHEAD ALARM ALBUM ALERT ALIKE ALIVE ALLOW
ALONG ALTER AMBER AMONG ANGLE ANKLE APART APPLE APPLY APRON ASIDE AVOID AWAKE AWARD AWARE BACON BADGE BAKER
BASIC BEACH BEANS BEARS BEGIN BEING BELOW BENCH BERRY BIRTH BLACK BLANK BLAZE BLEND BLINK BLOCK BLOOM BLUES
BLUSH BOATS BONES BOOKS BOOTS BRAIN BRAKE BRAND BRAVE BREAD BREAK BRICK BRIDE BRIEF BRING BROAD BROOK BROOM
BROWN BUILD BUNCH BUNNY BURST CABIN CABLE CAMEL CANDY CANOE CARRY CATCH CAUSE CHAIN CHAIR CHALK CHARM CHART
CHASE CHEAP CHECK CHEEK CHEER CHESS CHICK CHIEF CHILD CHILL CHIPS CHORD CIDER CLAIM CLASS CLEAN CLEAR CLERK
CLICK CLIFF CLIMB CLOCK CLOSE CLOTH CLOUD CLOWN CLUBS COACH COAST COCOA CORAL COUCH COUNT COURT COVER CRAFT
CRASH CREAM CRISP CROSS CROWD CRUMB CURVE CYCLE DAILY DANCE DATES DEALT DELAY DEPTH DIARY DINER DIRTY DOORS
DOUBT DOUGH DOZEN DRAFT DRAIN DRAMA DRAWN DREAM DRESS DRINK DRIVE DUCKS EAGER EAGLE EARLY EARTH EASEL EIGHT
ELBOW EMPTY ENJOY ENTER EQUAL ERROR EVENT EVERY EXACT EXTRA FAIRY FAITH FALSE FANCY FEAST FENCE FERRY FIELD
FIFTY FIGHT FINAL FIRST FLAGS FLAME FLASH FLOAT FLOOR FLOUR FLUTE FOCUS FORCE FORTH FORTY FOUND FRAME FRESH
FRONT FROST FRUIT FUNNY GIANT GIVEN GLASS GLOBE GLOVE GOING GRACE GRADE GRAIN GRAND GRANT GRAPE GRAPH GRASS
GREAT GREEN GREET GRILL GROUP GROWN GUESS GUEST GUIDE HAPPY HATCH HEAVY HEDGE HELLO HONEY HORSE HOTEL HOURS
HOUSE HUMAN HUMOR IDEAL IMAGE INDEX INNER INPUT ISSUE IVORY JEANS JELLY JEWEL JOINT JUDGE JUICE JUMPS KAYAK
KNIFE KNOCK KNOWN LABEL LARGE LASER LATER LAUGH LAYER LEARN LEMON LIGHT LIMIT LINKS LIONS LOCAL LOGIC LOOSE
LOVED LOWER LUCKY LUNCH MANGO MAPLE MARCH MATCH MAYBE MEANT MELON METAL MIGHT MINOR MINUS MIXED MODEL MONEY
MONTH MOTOR MOUNT MOUSE MOUTH MOVED MOVIE MUSIC NERVE NEVER NIGHT NINJA NOBLE NOISE NORTH NOVEL NURSE OCEAN
OFFER OFTEN OLIVE ONION OPERA ORBIT ORDER OTHER OTTER OUTER OWNER PANDA PANEL PAPER PASTA PATCH PAUSE PEARL
PEDAL PENNY PHASE PHONE PHOTO PIANO PIECE PILOT PITCH PIZZA PLACE PLAIN PLANE PLANT PLATE PLAYS PLAZA POINT
POLAR PORCH POUND PRESS PRICE PRIDE PRINT PROOF PROUD PUPPY QUEEN QUICK QUIET QUILT QUITE RADIO RAINY RANCH
RANGE RAPID RATIO REACH READY RELAX REPLY RHYME RIDER RIDGE RIGHT RIVER ROBOT ROCKS ROCKY ROUND ROYAL RULER
SALAD SAUCE SCALE SCARF SCENE SCOOP SCOUT SEVEN SHADE SHAPE SHARE SHARK SHARP SHEEP SHEET SHELF SHIFT SHIRT
SHOES SHORT SHOUT SIGHT SILLY SKATE SKILL SLEEP SLICE SLIDE SMALL SMART SMILE SNACK SNAIL SNEAK SNOWY SOLAR
SOLID SOLVE SOUND SOUTH SPARE SPARK SPEAK SPEND SPICE SPOON SPORT SQUID STACK STAIR STAMP STAND START STEAM
STEEL STEEP STICK STILL STOOL STORE STORY STOVE STRAW STRIP STUCK STUDY STYLE SUGAR SUNNY SUPER SWEET SWIFT
SWING TABLE TASTE TEACH TEETH THANK THEME THICK THING THINK THIRD THREE TIGER TIRED TOAST TODAY TOOTH TOPIC
TORCH TOTAL TOUCH TOUGH TOWEL TOWNS TRADE TRAIL TREAT TREND TRIAL TRICK TRUCK TRULY TRUST TRUTH TULIP TWIST
UNCLE UNDER UNITY UNTIL UPPER UPSET URBAN USUAL VALUE VIDEO VISIT VITAL VIVID VOICE WAGON WATCH WATER WAVES
WHALE WHEAT WHITE WHOLE WINDY WOMAN WORDS WORLD WORRY WORTH WRIST WRITE YACHT YEARS YOUNG YOUTH ZEBRA
`;

export const FIVE_LETTER_GUESSES: ReadonlySet<string> = new Set([
  ...FIVE_LETTER_ANSWERS.map((a) => a.word),
  ...GUESS_WORDS.split(/\s+/).filter(Boolean),
]);
