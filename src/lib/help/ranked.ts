/**
 * GS Ranked's help section (name, web and docs pick 9A): pages for players, lounge staff and a reference, plus the
 * player pages in Japanese (the 200cc Lounge welcomes Japanese players). Bodies live in src/data/ranked-help.tsx and
 * src/data/ranked-help-ja.tsx.
 *
 * GS Ranked isn't announced yet (lounge system pick 14A), so until RANKED_HELP_PUBLIC is true the section stays out
 * of the help center's index, search and sitemap, and its pages are noindex. They open by link for review, from the
 * /ranked page and the staff page.
 */

import type { HelpArticleMeta, HelpCategory } from "./manifest";

export const RANKED_HELP_PUBLIC = false;

export const RANKED_CATEGORY: HelpCategory = {
  id: "ranked",
  label: "GS Ranked",
  blurb: "Lounges on GameShuffle: playing in one, running one, and the rules.",
};

export type RankedGroup = "players" | "staff" | "reference";
export interface RankedHelpMeta extends HelpArticleMeta { slug: string; group: RankedGroup }

export const RANKED_GROUPS: { id: RankedGroup; label: string; ja: string }[] = [
  { id: "players", label: "For players", ja: "プレイヤー向け" },
  { id: "staff", label: "For lounge staff", ja: "ラウンジスタッフ向け" },
  { id: "reference", label: "Reference", ja: "リファレンス" },
];

const page = (slug: string, group: RankedGroup, title: string, description: string, keywords: string[]): RankedHelpMeta => ({
  id: `ranked-${slug}`, slug, group, title, description, href: `/help/ranked/${slug}`, category: "ranked", keywords: ["GS Ranked", "lounge", ...keywords],
});

export const RANKED_HELP: RankedHelpMeta[] = [
  page("joining", "players", "Joining a lounge", "Tie your Discord to your name on a lounge, or ask to join as a new player.", ["join", "verify", "name", "Discord"]),
  page("placement", "players", "How placement works", "Where a new player starts, and how the first tables settle it.", ["placement", "new player", "start"]),
  page("mmr", "players", "MMR and divisions", "How every table moves your MMR, and what the divisions mean.", ["MMR", "division", "rank", "standings"]),
  page("queue", "players", "The queue and rooms", "Joining a queue, the format vote, teams, hosts, room codes and subs.", ["queue", "room", "host", "sub", "rush hour", "vote"]),
  page("penalties", "players", "Penalties and appeals", "What penalties and strikes do, and how to appeal one.", ["penalty", "strike", "break", "appeal", "reduced loss"]),
  page("from-mkcentral", "players", "Coming from MKCentral", "Starting from your MKCentral lounge record, with nothing to type.", ["MKCentral", "transfer", "start", "match"]),
  page("mmr-card", "players", "Your MMR card on stream", "Show your lounge MMR on stream with the MMR card.", ["MMR card", "OBS", "stream", "overlay"]),

  page("moving", "staff", "Moving your lounge to GameShuffle", "What GS Ranked gives a lounge, and the steps to move one over.", ["move", "migrate", "lounge bot"]),
  page("setup", "staff", "Setting up: roles and channels", "/ranked setup, who counts as staff, the results channel, queues and division roles.", ["setup", "roles", "channels", "permissions"]),
  page("verifying", "staff", "Verifying tables, and what checks itself", "How tables come in, the checks, the review, and clean tables that verify themselves.", ["verify", "table", "screenshot", "auto verify"]),
  page("discipline", "staff", "Penalties, strikes and breaks", "Giving and taking back penalties, strikes, breaks, reports and appeals.", ["penalty", "strike", "break", "appeal", "report"]),
  page("seasons", "staff", "Seasons and resets", "Ending a season with a soft or full reset.", ["season", "reset", "soft reset"]),
  page("history", "staff", "Bringing in your history", "Importing your lounge's earlier seasons from its old bot.", ["import", "history", "seasons", "export"]),
  page("discord-or-web", "staff", "Discord or the web: working either way", "The staff page, where waiting tables show, and what checks itself.", ["staff page", "web", "Discord", "settings"]),

  page("commands", "reference", "Every command and its web page", "Each /ranked command and button, and where it is on the web.", ["commands", "slash commands", "buttons"]),
  page("mmr-rules", "reference", "MMR rules explained", "The two rule sets a lounge can run: MKCentral's model and the 200 Lounge's rules.", ["MMR formula", "rules", "200 Lounge", "MKCentral model"]),
  page("glossary", "reference", "Glossary", "The words GS Ranked uses, in one place.", ["glossary", "terms"]),
  page("questions", "reference", "Questions", "Short answers to what players and staff ask most.", ["FAQ", "questions"]),
  page("support", "reference", "Get help from us", "How lounge staff reach GameShuffle, and what to send.", ["support", "contact", "help"]),
];

/** The player pages in Japanese. */
export const RANKED_HELP_JA: RankedHelpMeta[] = [
  { ...RANKED_HELP[0], id: "ranked-ja-joining", href: "/help/ranked/ja/joining", title: "ラウンジに参加する", description: "ラウンジ上の名前にDiscordを結びつける方法と、新しいプレイヤーとして参加を申し込む方法。" },
  { ...RANKED_HELP[1], id: "ranked-ja-placement", href: "/help/ranked/ja/placement", title: "プレースメントのしくみ", description: "新しいプレイヤーがどこから始まり、最初のテーブルでどう落ち着くか。" },
  { ...RANKED_HELP[2], id: "ranked-ja-mmr", href: "/help/ranked/ja/mmr", title: "MMRとディビジョン", description: "テーブルごとにMMRがどう動くか、ディビジョンの意味。" },
  { ...RANKED_HELP[3], id: "ranked-ja-queue", href: "/help/ranked/ja/queue", title: "キューとルーム", description: "キューへの参加、形式の投票、チーム、ホスト、ルームコード、サブ。" },
  { ...RANKED_HELP[4], id: "ranked-ja-penalties", href: "/help/ranked/ja/penalties", title: "ペナルティと異議申し立て", description: "ペナルティとストライクの影響、そして異議申し立ての方法。" },
  { ...RANKED_HELP[5], id: "ranked-ja-from-mkcentral", href: "/help/ranked/ja/from-mkcentral", title: "MKCentralから来た方へ", description: "入力なしで、MKCentralのラウンジ記録から始められます。" },
  { ...RANKED_HELP[6], id: "ranked-ja-mmr-card", href: "/help/ranked/ja/mmr-card", title: "配信でMMRカードを表示する", description: "MMRカードでラウンジのMMRを配信に表示します。" },
];

export const rankedPage = (slug: string) => RANKED_HELP.find((p) => p.slug === slug);
export const rankedPageJa = (slug: string) => RANKED_HELP_JA.find((p) => p.slug === slug);
