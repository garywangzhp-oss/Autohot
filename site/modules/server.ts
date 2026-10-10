// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import { failover } from "../../modules/failover/server.ts";
import { dingtalk } from "../../modules/dingtalk/server.ts";
import { emailSubscribe } from "../../modules/email-subscribe/server.ts";
import { jevShadow } from "../../modules/jev-shadow/server.ts";

export const SERVER_MODULES: readonly ServerModule[] = [failover, dingtalk, emailSubscribe, jevShadow];
