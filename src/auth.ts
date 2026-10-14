import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateDemo, demoEnabled } from "@/server/demo-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 },
  providers: [Credentials({
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    authorize(credentials) {
      return authenticateDemo(credentials);
    },
  })],
  callbacks: {
    redirect({ url, baseUrl }) {
      // The component branch owns /test; use it as the temporary landing page.
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/test`;
      if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/test`;
    },
    jwt({ token, user }) {
      if (!demoEnabled()) return null;
      if (user) token.sub = user.id;
      // Ignore client-supplied session updates; access is resolved on the server.
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
