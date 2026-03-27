import { verifyDiscordSignature } from "@/lib/discord/verify";
import { handleInteraction } from "@/lib/discord/handler";

export const runtime = "edge";

export async function POST(request: Request) {
  // Read body as text for signature verification
  const body = await request.text();
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  // Verify signature
  const isValid = await verifyDiscordSignature(body, signature, timestamp);
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 });
  }

  const interaction = JSON.parse(body);

  // Handle PING (Discord health check when setting up the endpoint)
  if (interaction.type === 1) {
    return Response.json({ type: 1 });
  }

  // Route to command/component handler
  return handleInteraction(interaction);
}
