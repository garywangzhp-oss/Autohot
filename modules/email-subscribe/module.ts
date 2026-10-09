import { defineModule } from "@aihot/contracts/modules";

/** The public subscription endpoint is the module's only address. */
export const emailSubscribe = defineModule({
  name: "email-subscribe",
  apiPaths: [/^\/api\/site\/subscribe$/],
});
