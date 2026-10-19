import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/permissions";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  return <LoginForm />;
}
