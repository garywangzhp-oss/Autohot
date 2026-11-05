import { POLICY, SITE } from "@aihot/site";
import type { Route } from "./+types/privacy";
import copy from "@aihot/site/pages/privacy.md?raw";
import copyEn from "@aihot/site/pages/privacy.en.md?raw";
import { edgeTtl } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { prepareCopy } from "../lib/site-copy";
import { CopyPage, LegalFooterLinks } from "../features/copy/CopyPage";
import { PrivacySettingsButton } from "../features/analytics/PrivacyConsent";
import { useSiteLanguage } from "../features/i18n/SiteLanguage";
import type { Screen } from "../components/shell/screens";

export const handle: Screen = { tab: "me" };

const PRIVACY = prepareCopy(copy);
const PRIVACY_EN = prepareCopy(copyEn);

export function headers() {
  return edgeTtl(300);
}

export function meta({ location }: Route.MetaArgs) {
  const en = new URLSearchParams(location.search).get("lang") === "en";
  return pageMeta({ title: en ? "Privacy · AutoHot" : "隐私说明", rawTitle: en, description: en ? POLICY.privacy.descriptionEn : POLICY.privacy.description, path: en ? "/privacy?lang=en" : "/privacy", image: "/og/pages/privacy.png" });
}

export default function PrivacyPage() {
  const lang = useSiteLanguage();
  const copyDoc = lang === "en" ? PRIVACY_EN : PRIVACY;
  return (
    <CopyPage
      doc={copyDoc.doc}
      rendered={copyDoc.rendered}
      eyebrow={SITE.name}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LegalFooterLinks links={[{ to: "/terms", label: lang === "en" ? POLICY.terms.nameEn : POLICY.terms.name }, { to: "/feedback", label: lang === "en" ? "Feedback" : "反馈页" }]} note={lang === "en" ? `Privacy ${copyDoc.doc.meta["Version"] ?? ""} · ${copyDoc.doc.meta["Effective date"] ?? ""}` : `隐私说明 ${copyDoc.doc.meta["版本"] ?? ""} · ${copyDoc.doc.meta["生效日期"] ?? ""}`} />
          <PrivacySettingsButton className="text-accent hover:underline">{lang === "en" ? "Cookie settings" : "Cookie 设置"}</PrivacySettingsButton>
        </div>
      }
    />
  );
}
