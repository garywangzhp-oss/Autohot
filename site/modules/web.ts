// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import { emailSubscribe } from "../../modules/email-subscribe/web.tsx";

export const WEB_MODULES: readonly WebModule[] = [emailSubscribe];
