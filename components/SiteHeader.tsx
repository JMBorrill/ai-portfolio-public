import Link from "next/link";
import { contactChannels } from "@/lib/contact";

// Get in touch opens an email when one is published (content/contact.json); otherwise it goes to the contact area.
const contactHref = contactChannels.find((c) => c.href.startsWith("mailto:"))?.href ?? "#contact";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="wordmark" href="/">
          Joshua Borrill
        </Link>
        <nav aria-label="Main">
          <ul className="site-nav">
            <li>
              <Link href="/#projects">Work</Link>
            </li>
            <li>
              <a className="site-nav__contact" href={contactHref}>
                Get in touch
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
