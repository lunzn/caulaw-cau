const DEFAULT_SCHOOL_SERVER_URL = "http://127.0.0.1:3002";

export function schoolServerBaseUrl(): string {
  return (
    process.env.SCHOOL_SERVER_URL?.trim() || DEFAULT_SCHOOL_SERVER_URL
  ).replace(/\/$/, "");
}

