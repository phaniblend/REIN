/**
 * SMS sender — Twilio when configured, otherwise console (dev / missing keys).
 *
 * Railway vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  (E.164, e.g. +15551234567)
 *   SMS_PROVIDER=twilio|console  (optional; auto-detects Twilio if keys present)
 */

export type SmsResult = {
  ok: boolean;
  provider: "twilio" | "console";
  error?: string;
};

function provider(): "twilio" | "console" {
  const forced = process.env.SMS_PROVIDER?.toLowerCase();
  if (forced === "console") return "console";
  if (forced === "twilio") return "twilio";
  if (
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ) {
    return "twilio";
  }
  return "console";
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const mode = provider();

  if (mode === "console") {
    console.info(`[sms:console] → ${to}: ${body}`);
    return { ok: true, provider: "console" };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("[sms:twilio]", res.status, text);
    return {
      ok: false,
      provider: "twilio",
      error: "Failed to send verification text",
    };
  }

  return { ok: true, provider: "twilio" };
}

export function smsProviderName() {
  return provider();
}
