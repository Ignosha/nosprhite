/*
 * Who the village may write to: only institutions in NOSHASHI's own outreach
 * list (outreach/contacts.csv) whose address the institution published itself
 * and someone has checked (status "verified"). The model only ever names an
 * institution; the address is looked up here, so it can never invent one,
 * and anyone already contacted, declined or unsubscribed is never offered.
 */

export type Contact = {
  institution: string;
  vertical: string;
  segment: string;
  country: string;
  priority: string;
  email: string;
  note: string;
  fit: string;
  status: string;
};

/** RFC 4180-style CSV: quoted fields may hold commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

export function parseContacts(text: string): Contact[] {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const at = (name: string) => head.indexOf(name);
  return rest.map((r) => ({
    institution: r[at("institution")] ?? "",
    vertical: r[at("vertical")] ?? "",
    segment: r[at("segment")] ?? "",
    country: r[at("country")] ?? "",
    priority: r[at("priority")] ?? "",
    email: (r[at("email")] ?? "").trim(),
    note: r[at("note")] ?? "",
    fit: r[at("fit")] ?? "",
    status: (r[at("status")] ?? "").trim(),
  }));
}

const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Verified, never contacted, priority 1, and not already drafted in the village. */
export function eligible(contacts: Contact[], alreadyDrafted: Set<string>): Contact[] {
  return contacts.filter(
    (c) => c.status === "verified" && c.priority === "1" && EMAIL.test(c.email) && !alreadyDrafted.has(c.institution.toLowerCase()),
  );
}

/** The address for the institution the model named, or null if it is not on the eligible list. */
export function addressFor(name: string | null, list: Contact[]): Contact | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  return list.find((c) => c.institution.toLowerCase() === n) ?? null;
}

/** A mailto: link that opens the draft in your own mail app, ready for you to send. */
export function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
