import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@cau-claw/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    username({
      minUsernameLength: 2,
      maxUsernameLength: 32,
    }),
    nextCookies(),
  ],
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});
