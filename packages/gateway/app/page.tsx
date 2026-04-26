import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginView } from "./login-view";

export default async function Home() {
  const s = await auth.api.getSession({ headers: await headers() });
  if (s?.user) redirect("/dashboard");

  return <LoginView />;
}
