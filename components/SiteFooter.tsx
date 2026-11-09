import { contactChannels } from "@/lib/contact";

// Every page ends here: one line, and how to reach me (content/contact.json).
export function SiteFooter() {
  const [first, ...rest] = contactChannels;
  return (
    <footer id="contact" className="site-footer" aria-labelledby="contact-title">
      <div className="container site-footer__inner">
        <div className="site-footer__copy">
          <h2 id="contact-title">Get in touch</h2>
          <p>I build software independently and for clients. To talk about a role or a project, email me.</p>
        </div>
        {first && (
          <ul className="contact" aria-label="Contact">
            <li>
              <a className="button" href={first.href}>
                {first.label}
                <span className="arrow" aria-hidden="true">
                  →
                </span>
              </a>
            </li>
            {rest.map((c) => (
              <li key={c.label}>
                <a className="text-link" href={c.href}>
                  {c.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
