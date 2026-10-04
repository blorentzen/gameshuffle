/**
 * Chat Brain audiences (client-safe). Optional, coarse facts people can share so
 * a board can be recounted for one audience ("We asked 214 people aged 18-24").
 * Schema and the privacy reasoning: supabase/chat-brain-audience-m1.sql.
 *
 *   age band   13-17 | 18-24 | 25-34 | 35-44 | 45-54 | 55+   (no under-13 option)
 *   gender     woman | man | nonbinary                       (null = prefer not to say)
 *   country    ISO 3166-1 alpha-2 (suggested from the connection, changeable)
 *
 * An audience board only exists once AUDIENCE_MIN people in that audience have
 * answered, for privacy and so the board means something.
 */

export const AGE_BANDS = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const GENDERS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Non-binary" },
] as const;
export type Gender = (typeof GENDERS)[number]["value"];

export interface Audience { ageBand: AgeBand | null; gender: Gender | null; country: string | null }
export const EMPTY_AUDIENCE: Audience = { ageBand: null, gender: null, country: null };

/** People an audience needs before it gets its own board. */
export const AUDIENCE_MIN = 30;

// ISO 3166-1 alpha-2 codes for countries and territories people pick from.
const CODES = "AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR IO VG BN BG BF BI KH CM CA CV KY CF TD CL CN CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU KP MK MP NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA KR SS ES LK BL SH KN LC MF PM VC SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TC TV UG UA AE GB US UY VI UZ VU VA VE VN WF EH YE ZM ZW";
export const COUNTRY_CODES: string[] = CODES.split(" ");
const CODE_SET = new Set(COUNTRY_CODES);

export function isCountry(code: unknown): code is string {
  return typeof code === "string" && CODE_SET.has(code.toUpperCase());
}

/** The country's name in the viewer's language (falls back to the code). */
export function countryName(code: string, locale = "en"): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Accept only known values; anything else becomes "not shared". */
export function cleanAudience(x: unknown): Audience {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const ageBand = AGE_BANDS.includes(o.ageBand as AgeBand) ? (o.ageBand as AgeBand) : null;
  const gender = GENDERS.some((g) => g.value === o.gender) ? (o.gender as Gender) : null;
  const country = isCountry(o.country) ? (o.country as string).toUpperCase() : null;
  return { ageBand, gender, country };
}

/** The audience segments an answer belongs to (besides "all"). */
export function segmentsFor(a: Audience): string[] {
  return [a.ageBand ? `age:${a.ageBand}` : null, a.gender ? `gender:${a.gender}` : null, a.country ? `country:${a.country}` : null].filter((s): s is string => !!s);
}

/** "people aged 18 to 24", "women", "people in Canada": for "We asked 214 ___". */
export function segmentLabel(segment: string): string {
  if (segment === "all") return "people";
  const [kind, value] = segment.split(":");
  if (kind === "age") return value === "55+" ? "people aged 55 and up" : `people aged ${value.replace("-", " to ")}`;
  if (kind === "gender") return value === "woman" ? "women" : value === "man" ? "men" : "non-binary people";
  if (kind === "country") return `people in ${countryName(value)}`;
  return "people";
}
