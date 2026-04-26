import type { UserSchoolIdentity } from "@/lib/user-identity";


export function workerAuthHeaders(): Record<string, string> {
  const t = process.env.WORKER_INTERNAL_TOKEN?.trim();
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

export function workerUserHeaders(
  userId: string,
  identity?: UserSchoolIdentity | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...workerAuthHeaders(),
    "X-User-Id": userId,
  };

  if (identity) {
    headers["X-School-Role"] = identity.role;
    headers["X-School-Id"] = identity.schoolId;
  }

  return headers;
}
