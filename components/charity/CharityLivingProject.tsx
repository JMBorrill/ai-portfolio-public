"use client";

import { media } from "@/content/media";
import { AppFrame } from "@/components/living/AppFrame";
import { LivingProject } from "@/components/living/LivingProject";

const MODE = "Anonymised demonstration build: a fictional charity with sample content. Staff dashboard, live chat and forms are off; donations take no money.";
// Read here, by name, so the build can inline it.
const SITE_URL = process.env.NEXT_PUBLIC_CHARITY_SITE_URL ?? "";

function Workspace({ resets }: { resets: number }) {
  return <AppFrame url={SITE_URL} name="the charity website" source="aim-site" resets={resets} />;
}

const preview = (
  <div className="living-preview">
    <div className="living-preview__shot">
      <img
        src={media.charityHome.src}
        srcSet={media.charityHome.srcSet}
        sizes="(min-width: 920px) 880px, 100vw"
        width={media.charityHome.width}
        height={media.charityHome.height}
        alt={media.charityHome.alt}
      />
    </div>
    <div className="living-preview__body">
      <p className="living-preview__lede">
        The workspace is the website itself, running from the project’s pinned commit in its demonstration mode, with
        the charity’s name, people and places replaced by fictional ones.
      </p>
      <ul className="living-preview__features">
        <li>
          <strong>Two services, one site.</strong> Domestic abuse support and a school-uniform project each have their
          own section, colours and navigation, with the charity-wide pages shared.
        </li>
        <li>
          <strong>Safety first.</strong> Every page carries 999 guidance and a <em>Leave this site</em> link for anyone
          who needs to leave in a hurry.
        </li>
        <li>
          <strong>Behind it.</strong> The project also has a staff dashboard with two-factor sign-in, live chat and online
          forms; those stay switched off here. Donations go through their whole journey without taking any money.
        </li>
      </ul>
      <p>
        <strong>Sample content.</strong> Demonstration mode fills content still awaiting the charity with sample text,
        and says so on every page.
      </p>
      <p className="living-preview__caption">{media.charityHome.caption}</p>
    </div>
  </div>
);

export function CharityLivingProject() {
  return <LivingProject slug="charity-website" title="Charity Digital Transformation" modeLabel={MODE} preview={preview} Workspace={Workspace} />;
}
