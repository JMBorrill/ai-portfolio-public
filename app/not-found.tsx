import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container not-found">
      <h1>Page not found</h1>
      <p>
        This page does not exist. <Link href="/">Return to the homepage</Link>.
      </p>
    </section>
  );
}
