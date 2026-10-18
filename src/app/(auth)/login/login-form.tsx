"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

export default function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        redirectTo: "/test",
      });

      if (!result || result.error) {
        setError("Invalid username or password");
        return;
      }

      router.push(result.url ?? "/test");
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-canvas p-ah-24">
      <div className="w-full max-w-[360px]">
        <Section eyebrow="Assessment Helper" title="Login" headingLevel={1}>

        <form className="space-y-ah-24" onSubmit={handleSubmit}>
          <Input
            label="Username"
            name="username"
            placeholder="Enter username"
            autoComplete="username"
            required
            disabled={loading}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <Input
            label="Password"
            name="password"
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            required
            disabled={loading}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && (
            <p
              role="alert"
              className="rounded-ah-8 bg-danger-bg px-ah-12 py-ah-8 text-caption text-danger"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
        </Section>
      </div>
    </main>
  );
}
