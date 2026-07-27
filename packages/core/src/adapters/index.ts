// ─── Integration adapter interfaces ──────────────────────────
// Architecture is complete; implementations are stubs with typed TODOs.
// Wire live implementations drop-in via the external_id + integration_sync
// table pattern without changing callers.
//
// Assumptions to verify:
// - ShiftPlatform: whether a usable public API exists (likely blocker — contact vendor)
// - WhatsApp Business API: requires Meta approval + monthly fees (~€0.05/message)
// - Cal.com: open-source, self-hostable — free tier available
// - Google Workspace: requires OAuth2 consent screen per user

import type { Crew, Event, Assignment } from "../types/index.js";

// ─── Source interfaces ────────────────────────────────────────
export interface CrewRecord {
  external_id: string;
  crew_code?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  email?: string;
  home_city?: string;
}

export interface CrewSource {
  fetchCrewList(): Promise<CrewRecord[]>;
  fetchCrewById(externalId: string): Promise<CrewRecord | null>;
}

export interface AvailabilityRecord {
  external_crew_id: string;
  date: string;
  status: "available" | "maybe" | "unavailable";
}

export interface AvailabilitySource {
  fetchAvailability(
    from: string,
    to: string
  ): Promise<AvailabilityRecord[]>;
}

// ─── Sink interfaces ──────────────────────────────────────────
export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  attendees: string[];
  location?: string;
}

export interface CalendarSink {
  createEvent(event: CalendarEvent): Promise<{ external_id: string }>;
  updateEvent(externalId: string, event: Partial<CalendarEvent>): Promise<void>;
  deleteEvent(externalId: string): Promise<void>;
}

export interface Message {
  to: string; // phone or email
  body: string;
  template?: string;
  templateParams?: Record<string, string>;
}

export interface MessagingSink {
  sendMessage(message: Message): Promise<{ message_id: string }>;
  sendBulk(messages: Message[]): Promise<{ sent: number; failed: number }>;
}

// ─── ShiftPlatform adapter (stub) ─────────────────────────────────
// TODO: Verify ShiftPlatform API availability before implementing.
// Contact: support@example.com — likely requires enterprise plan.
export class ShiftPlatformAdapter implements CrewSource, AvailabilitySource {
  constructor(private readonly _apiKey: string, private readonly _baseUrl?: string) {}

  async fetchCrewList(): Promise<CrewRecord[]> {
    // TODO: GET /api/v1/freelancers — map to CrewRecord
    // Endpoint structure unverified — do not implement until API docs confirmed
    throw new Error(
      "ShiftPlatformAdapter: not implemented — verify API access first"
    );
  }

  async fetchCrewById(_externalId: string): Promise<CrewRecord | null> {
    // TODO: GET /api/v1/freelancers/:id
    throw new Error(
      "ShiftPlatformAdapter: not implemented — verify API access first"
    );
  }

  async fetchAvailability(
    _from: string,
    _to: string
  ): Promise<AvailabilityRecord[]> {
    // TODO: GET /api/v1/availability?from=&to=
    throw new Error(
      "ShiftPlatformAdapter: not implemented — verify API access first"
    );
  }
}

// ─── Cal.com adapter (stub) ───────────────────────────────────
// Cal.com is open-source (MIT) and self-hostable.
// API docs: https://cal.com/docs/api-reference
export class CalComAdapter implements CalendarSink {
  constructor(
    private readonly _apiKey: string,
    private readonly _baseUrl: string = "https://api.cal.com/v1"
  ) {}

  async createEvent(_event: CalendarEvent): Promise<{ external_id: string }> {
    // TODO: POST /bookings — map CalendarEvent to Cal.com booking payload
    throw new Error("CalComAdapter.createEvent: not implemented");
  }

  async updateEvent(
    _externalId: string,
    _event: Partial<CalendarEvent>
  ): Promise<void> {
    // TODO: PATCH /bookings/:id
    throw new Error("CalComAdapter.updateEvent: not implemented");
  }

  async deleteEvent(_externalId: string): Promise<void> {
    // TODO: DELETE /bookings/:id
    throw new Error("CalComAdapter.deleteEvent: not implemented");
  }
}

// ─── WhatsApp adapter (Meta Cloud API) ────────────────────────
// Cost: Meta WhatsApp Business API — ~€0.05–0.12 per conversation.
// Requires: Meta Business account + an approved phone number (1–2 weeks).
// Note: free-text ("type: text") only reaches a user inside the 24h customer-
// service window. For cold outbound (e.g. reminders) Meta requires an APPROVED
// TEMPLATE — pass message.template (+ templateParams) and this sends a template
// message instead of text. Nothing is sent unless this adapter is constructed
// with real credentials and invoked (the dispatch cron gates on both).
export class WhatsAppAdapter implements MessagingSink {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
    private readonly graphVersion: string = "v20.0"
  ) {}

  private get endpoint(): string {
    return `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`;
  }

  /** E.164 without the leading "+" — Meta expects digits only. */
  private normalizeTo(to: string): string {
    return to.replace(/[^\d]/g, "");
  }

  private buildPayload(message: Message): Record<string, unknown> {
    const to = this.normalizeTo(message.to);
    if (message.template) {
      const params = Object.values(message.templateParams ?? {});
      return {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: message.template,
          language: { code: "nl" },
          ...(params.length
            ? {
                components: [
                  {
                    type: "body",
                    parameters: params.map((text) => ({ type: "text", text })),
                  },
                ],
              }
            : {}),
        },
      };
    }
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: message.body },
    };
  }

  async sendMessage(message: Message): Promise<{ message_id: string }> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(this.buildPayload(message)),
    });
    const body = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? `WhatsApp send failed (HTTP ${res.status})`);
    }
    const id = body.messages?.[0]?.id;
    if (!id) throw new Error("WhatsApp send: geen message id in respons");
    return { message_id: id };
  }

  async sendBulk(messages: Message[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    // Sequential to stay well under Meta's rate limit and to keep error
    // isolation simple — one bad number doesn't sink the batch.
    for (const message of messages) {
      try {
        await this.sendMessage(message);
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}

// ─── Google Workspace adapter (stub) ─────────────────────────
// Requires: Google Cloud project, OAuth2 consent, service account per domain
export class GoogleWorkspaceAdapter implements CalendarSink, CrewSource {
  constructor(private readonly _credentials: Record<string, string>) {}

  async fetchCrewList(): Promise<CrewRecord[]> {
    // TODO: Google Sheets API — read roster tab from Callsheet
    // fileId: 13n8R2Wvl5jwYIQ-LTjzM4thjC9aOwlwaIpPlBILP3gQ
    throw new Error("GoogleWorkspaceAdapter.fetchCrewList: not implemented");
  }

  async fetchCrewById(_externalId: string): Promise<CrewRecord | null> {
    throw new Error("GoogleWorkspaceAdapter.fetchCrewById: not implemented");
  }

  async createEvent(_event: CalendarEvent): Promise<{ external_id: string }> {
    // TODO: Google Calendar API — POST /calendars/{calendarId}/events
    throw new Error("GoogleWorkspaceAdapter.createEvent: not implemented");
  }

  async updateEvent(
    _externalId: string,
    _event: Partial<CalendarEvent>
  ): Promise<void> {
    throw new Error("GoogleWorkspaceAdapter.updateEvent: not implemented");
  }

  async deleteEvent(_externalId: string): Promise<void> {
    throw new Error("GoogleWorkspaceAdapter.deleteEvent: not implemented");
  }
}
