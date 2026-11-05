import { defineModule } from "@aihot/contracts/modules";

/** Public opt-in routes plus the links carried by confirmation and weekly emails. */
export const emailSubscribe = defineModule({
  name: "email-subscribe",
  apiPaths: [
    /^\/api\/site\/subscribe$/,
    /^\/api\/site\/subscribe\/confirm$/,
    /^\/api\/site\/newsletter\/unsubscribe$/,
    /^\/api\/site\/newsletter\/language$/,
  ],
});
