import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userSchoolBindings } from "@cau-claw/db";

export const SCHOOL_IDENTITY_ROLES = ["student", "teacher"] as const;

export type SchoolIdentityRole = (typeof SCHOOL_IDENTITY_ROLES)[number];

export type UserSchoolIdentity = {
  role: SchoolIdentityRole;
  schoolId: string;
};

export function isSchoolIdentityRole(value: string): value is SchoolIdentityRole {
  return (SCHOOL_IDENTITY_ROLES as readonly string[]).includes(value);
}

export async function getUserSchoolIdentity(
  userId: string,
): Promise<UserSchoolIdentity | null> {
  const rows = await db
    .select({
      role: userSchoolBindings.role,
      schoolId: userSchoolBindings.schoolId,
    })
    .from(userSchoolBindings)
    .where(eq(userSchoolBindings.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row || !isSchoolIdentityRole(row.role)) {
    return null;
  }
  return { role: row.role, schoolId: row.schoolId };
}

export async function bindUserSchoolIdentity(input: {
  userId: string;
  role: SchoolIdentityRole;
  schoolId: string;
}): Promise<UserSchoolIdentity> {
  await db
    .insert(userSchoolBindings)
    .values({
      userId: input.userId,
      role: input.role,
      schoolId: input.schoolId,
    })
    .onConflictDoUpdate({
      target: userSchoolBindings.userId,
      set: {
        role: input.role,
        schoolId: input.schoolId,
        updatedAt: new Date(),
      },
    });

  return { role: input.role, schoolId: input.schoolId };
}

export async function unbindUserSchoolIdentity(userId: string): Promise<void> {
  await db.delete(userSchoolBindings).where(eq(userSchoolBindings.userId, userId));
}
