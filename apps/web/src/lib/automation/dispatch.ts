import { WhatsAppAdapter, type Message } from "@crewops/core";

// Outbox dispatcher. Turns a queued notification into an actual send via the
// configured provider. Deliberately fail-closed: returns { ok:false } (so the
// cron skips, sending NOTHING) unless BOTH the notifications flag is on AND
// provider credentials are present. This is the single guard that keeps external
// messaging off until the operator explicitly configures it.

export type DispatchResult =
  | { ok: true; message_id: string }
  | { ok: false; error: string };

export type DispatcherProbe =
  | { ok: true; provider: string; send: (channel: string, to: string, body: string) => Promise<DispatchResult> }
  | { ok: false; reason: string };

export function getDispatcher(): DispatcherProbe {
  if (process.env.NEXT_PUBLIC_NOTIFICATIONS_ENABLED !== "true") {
    return { ok: false, reason: "Verzending staat uit (NEXT_PUBLIC_NOTIFICATIONS_ENABLED=false)." };
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    return {
      ok: false,
      reason: "WhatsApp-credentials ontbreken (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID).",
    };
  }

  const wa = new WhatsAppAdapter(token, phoneId, process.env.WHATSAPP_GRAPH_VERSION || undefined);
  // Optional approved template for cold outbound (outside the 24h window). When
  // set, the message body is passed as the single template body parameter.
  const template = process.env.WHATSAPP_TEMPLATE_NAME || undefined;

  return {
    ok: true,
    provider: "whatsapp",
    async send(channel, to, body): Promise<DispatchResult> {
      if (channel !== "whatsapp") {
        // Email/other channels have no provider wired yet — report, don't crash.
        return { ok: false, error: `Kanaal "${channel}" wordt nog niet verstuurd.` };
      }
      const message: Message = template
        ? { to, body, template, templateParams: { "1": body } }
        : { to, body };
      try {
        const { message_id } = await wa.sendMessage(message);
        return { ok: true, message_id };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Onbekende verzendfout" };
      }
    },
  };
}
