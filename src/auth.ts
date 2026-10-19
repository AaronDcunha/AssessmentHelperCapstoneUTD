import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateDemo, demoEnabled } from "@/server/demo-auth";
import { authenticateDatabase, resolveDatabaseUser } from "@/server/database-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" },
    },
    authorize(credentials) {
      // Reserved fixtures remain available only with explicit development opt-in.
      const demo = authenticateDemo(credentials);
      if (demo) return demo;
      return authenticateDatabase(credentials);
    },
  })],
  callbacks: {
    redirect({ url, baseUrl }) {
      // The faculty dashboard is the default landing page for authenticated users.
      if (url === baseUrl || url === `${baseUrl}/`) return `${baseUrl}/dashboard`;
      if (url.startsWith("/") && !url.startsWith("//")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return `${baseUrl}/dashboard`;
    },
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      if (!token.sub) return null;
      if (token.sub.startsWith("demo:")) {
        if (!demoEnabled()) return null;
      } else if (!await resolveDatabaseUser(token.sub)) return null;
      // Ignore client-supplied session updates; access is resolved on the server.
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
