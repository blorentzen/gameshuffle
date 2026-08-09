/**
 * The classic 20 Magic 8-Ball answers (10 affirmative, 5 non-committal, 5
 * negative). Client-safe so the Stream Tools editor can list them for
 * per-answer enable/disable; the server oracle resolver reads the same source.
 */

export type EightBallTone = "yes" | "no" | "maybe" | "neutral";

export interface EightBallAnswer {
  text: string;
  tone: EightBallTone;
}

export const EIGHT_BALL_ANSWERS: EightBallAnswer[] = [
  { text: "It is certain.", tone: "yes" },
  { text: "Without a doubt.", tone: "yes" },
  { text: "Yes — definitely.", tone: "yes" },
  { text: "You may rely on it.", tone: "yes" },
  { text: "As I see it, yes.", tone: "yes" },
  { text: "Most likely.", tone: "yes" },
  { text: "Outlook good.", tone: "yes" },
  { text: "Yes.", tone: "yes" },
  { text: "Signs point to yes.", tone: "yes" },
  { text: "It is decidedly so.", tone: "yes" },
  { text: "Reply hazy, try again.", tone: "maybe" },
  { text: "Ask again later.", tone: "maybe" },
  { text: "Better not tell you now.", tone: "maybe" },
  { text: "Cannot predict now.", tone: "maybe" },
  { text: "Concentrate and ask again.", tone: "maybe" },
  { text: "Don't count on it.", tone: "no" },
  { text: "My reply is no.", tone: "no" },
  { text: "My sources say no.", tone: "no" },
  { text: "Outlook not so good.", tone: "no" },
  { text: "Very doubtful.", tone: "no" },
];
