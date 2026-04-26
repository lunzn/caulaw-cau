import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { wechatKnownContacts } from "@cau-claw/db";

export async function recordContact(botUserId: string, contactUserId: string): Promise<void> {
  try {
    await db
      .insert(wechatKnownContacts)
      .values({ botUserId, contactUserId, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: [wechatKnownContacts.botUserId, wechatKnownContacts.contactUserId],
        set: { lastSeenAt: new Date() },
      });
  } catch {
    /* ignore */
  }
}

export async function listContacts(botUserId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ contactUserId: wechatKnownContacts.contactUserId })
      .from(wechatKnownContacts)
      .where(eq(wechatKnownContacts.botUserId, botUserId));
    return rows.map((r) => r.contactUserId);
  } catch {
    return [];
  }
}
