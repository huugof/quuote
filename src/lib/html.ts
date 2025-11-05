export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type NavSection = "home" | "feed" | "about" | "rss" | "github";

const NAV_LINKS: Array<{ href: string; label: string; key: NavSection }> = [
  { href: "/", label: "Home", key: "home" },
  { href: "/feed", label: "Feed", key: "feed" },
  { href: "https://github.com/huugof/quuote", label: "GitHub", key: "github" },
  { href: "/about", label: "About", key: "about" },
  { href: "/rss/quote.xml", label: "RSS", key: "rss" },
];

export function renderNav(active?: NavSection): string {
  const links = NAV_LINKS.map((link) => {
    const classes = [link.href.startsWith("http") ? "external" : ""];
    if (active && link.key === active) {
      classes.push("active-link");
    }
    const classAttr = classes.filter(Boolean).join(" ");
    const classHtml = classAttr ? ` class="${classAttr}"` : "";
    const rel = link.href.startsWith("http")
      ? ' rel="noreferrer" target="_blank"'
      : "";
    return `<a href="${link.href}"${classHtml}${rel}>${link.label}</a>`;
  }).join("\n  ");

  return `<nav class="site-links">
  ${links}
</nav>`;
}
