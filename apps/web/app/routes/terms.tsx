import { POLICY, SITE, SITE_EN } from "@aihot/site";
import type { Route } from "./+types/terms";
import copy from "@aihot/site/pages/terms.md?raw";
import copyEn from "@aihot/site/pages/terms.en.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import type { Screen } from "../components/shell/screens";
import { webModules } from "../site-modules";
import { useSiteLanguage } from "../features/i18n/SiteLanguage";

export const handle: Screen = { tab: "me" };

const TERMS = prepareCopy(copy);
const TERMS_EN = prepareCopy(copyEn);

export function headers() {
  return edgeTtl(300);
}

export function meta({ location }: Route.MetaArgs) {
  const en = new URLSearchParams(location.search).get("lang") === "en";
  return pageMeta({ title: en ? "Terms of use · AutoHot" : POLICY.terms.name, rawTitle: en, description: en ? POLICY.terms.descriptionEn : POLICY.terms.description, path: en ? "/terms?lang=en" : "/terms", image: "/og/pages/terms.png" });
}

export default function TermsPage() {
  const lang = useSiteLanguage();
  const copyDoc = lang === "en" ? TERMS_EN : TERMS;
  return (
    <CopyPage
      doc={copyDoc.doc}
      rendered={copyDoc.rendered}
      eyebrow={lang === "en" ? SITE_EN.name : SITE.name}
      footer={
        <LegalFooterLinks
          links={[
            { to: "/privacy", label: lang === "en" ? "Privacy" : "隐私说明" },
            ...webModules().flatMap((m) => m.termsLinks ?? []),
          ]}
          note={lang === "en" ? `${POLICY.terms.nameEn} ${copyDoc.doc.meta["Version"] ?? ""} · ${copyDoc.doc.meta["Effective date"] ?? ""}` : `${POLICY.terms.name} ${copyDoc.doc.meta["版本"] ?? ""} · ${copyDoc.doc.meta["生效日期"] ?? ""}`}
        />
      }
    />
  );
}
