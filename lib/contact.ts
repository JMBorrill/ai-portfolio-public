import data from "@/content/contact.json";

// Contact channels from content/contact.json. Absent channels render nothing.
export type ContactChannel = { label: string; href: string };

const { email, linkedin, cv } = data as Record<string, string | null>;

export const contactChannels: ContactChannel[] = [
  email && { label: "Email me", href: `mailto:${email}` },
  linkedin && { label: "LinkedIn", href: linkedin },
  cv && { label: "CV (PDF)", href: cv },
].filter((c): c is ContactChannel => Boolean(c));
