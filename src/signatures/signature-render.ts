export interface SignatureSnapshot {
  name: string;
  jobTitle?: string;
  department?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  socialLinks?: Record<string, string | undefined>;
  profileImageUrl?: string;
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Produces a clean, email-safe HTML snippet (no <html>/<body>, inline styles
// only) stored on the EmailSignatureVersion and passed as `signatureHtml`
// into renderEmail() by the campaigns/templates flows.
export function renderSignatureHtml(snapshot: SignatureSnapshot): string {
  const lines: string[] = [];

  lines.push(`<strong>${escape(snapshot.name)}</strong>`);

  const titleLine = [snapshot.jobTitle, snapshot.department].filter(Boolean).join(", ");
  if (titleLine) lines.push(escape(titleLine));

  const contactParts: string[] = [];
  if (snapshot.phone) contactParts.push(escape(snapshot.phone));
  if (snapshot.email) {
    contactParts.push(`<a href="mailto:${escape(snapshot.email)}" style="color:#4F46E5;">${escape(snapshot.email)}</a>`);
  }
  if (snapshot.website) {
    contactParts.push(`<a href="${escape(snapshot.website)}" style="color:#4F46E5;">${escape(snapshot.website)}</a>`);
  }
  if (contactParts.length) lines.push(contactParts.join(" | "));

  if (snapshot.address) lines.push(escape(snapshot.address));

  const socialLinks = snapshot.socialLinks
    ? Object.entries(snapshot.socialLinks).filter((entry): entry is [string, string] => !!entry[1])
    : [];
  if (socialLinks.length) {
    lines.push(
      socialLinks
        .map(([platform, url]) => `<a href="${escape(url)}" style="color:#4F46E5;">${escape(platform)}</a>`)
        .join(" | "),
    );
  }

  const imageHtml = snapshot.profileImageUrl
    ? `<img src="${escape(snapshot.profileImageUrl)}" alt="${escape(snapshot.name)}" width="72" style="border-radius:6px;display:block;margin-bottom:8px;" />`
    : "";

  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#374151;">${imageHtml}${lines
    .map((l) => `<div>${l}</div>`)
    .join("")}</div>`;
}

export function renderSignatureText(snapshot: SignatureSnapshot): string {
  const lines: string[] = [snapshot.name];
  const titleLine = [snapshot.jobTitle, snapshot.department].filter(Boolean).join(", ");
  if (titleLine) lines.push(titleLine);
  const contactParts = [snapshot.phone, snapshot.email, snapshot.website].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(" | "));
  if (snapshot.address) lines.push(snapshot.address);
  return lines.join("\n");
}
