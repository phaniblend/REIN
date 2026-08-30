import { normalizePhone } from "@/lib/phone";

export type PickedContact = {
  name: string;
  phone: string;
};

type ContactInfo = {
  name?: string[];
  tel?: string[];
};

type ContactsManager = {
  getProperties: () => Promise<string[]>;
  select: (
    properties: string[],
    options?: { multiple?: boolean },
  ) => Promise<ContactInfo[]>;
};

function contactsApi(): ContactsManager | null {
  if (typeof navigator === "undefined") return null;
  const contacts = (
    navigator as Navigator & { contacts?: ContactsManager }
  ).contacts;
  if (!contacts?.select) return null;
  return contacts;
}

export function canPickContacts() {
  return Boolean(contactsApi()) && typeof window !== "undefined" && window.isSecureContext;
}

function pickBestPhone(tels: string[] | undefined): string | null {
  if (!tels?.length) return null;
  for (const tel of tels) {
    const normalized = normalizePhone(tel);
    if (normalized) return normalized;
  }
  // Keep raw digits if normalize fails — owner can edit.
  const raw = tels[0]?.trim();
  return raw || null;
}

/** Opens the device contact picker (Chrome Android). User must tap a button. */
export async function pickContactsFromDevice(opts?: {
  multiple?: boolean;
}): Promise<PickedContact[]> {
  const contacts = contactsApi();
  if (!contacts) {
    throw new Error(
      "Contact picker isn’t available in this browser. Type the number, or open Restman in Chrome on Android.",
    );
  }

  const available = await contacts.getProperties();
  const props = ["tel", "name"].filter((p) => available.includes(p));
  if (!props.includes("tel")) {
    throw new Error("This device won’t share phone numbers from contacts.");
  }

  const selected = await contacts.select(props, {
    multiple: opts?.multiple ?? true,
  });

  const out: PickedContact[] = [];
  for (const c of selected) {
    const phone = pickBestPhone(c.tel);
    if (!phone) continue;
    out.push({
      phone,
      name: c.name?.[0]?.trim() || "",
    });
  }
  return out;
}
