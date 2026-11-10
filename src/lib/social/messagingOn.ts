/**
 * Messaging (direct messages, crew chats, the docked Messenger, the Comms Center's Messages tab) is shelved
 * (Britton, 2026-11-09: "I don't think anyone is gonna use it"). Off hides every way in and the routes answer
 * "messaging_off"; conversations and messages stay in the database, so turning this back to true brings it all back.
 * Client-safe.
 */
export const MESSAGING_ON = false;
