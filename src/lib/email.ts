export type EmailResult = {
  ok: boolean;
  provider: "resend" | "console";
  error?: string;
};

/** Sends mail through Resend when RESEND_API_KEY and EMAIL_FROM are set. */
export async function sendEmail(to: string, subject: string, text: string): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.info(`[email:console] → ${to}: ${subject}\n${text}`);
    return { ok: true, provider: "console" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, provider: "resend", error };
  }
  return { ok: true, provider: "resend" };
}
