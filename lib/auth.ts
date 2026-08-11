import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [Credentials({ credentials: { email: {}, password: {} }, authorize: async (credentials) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(8) }).safeParse(credentials);
    if (!parsed.success || !process.env.ADMIN_EMAIL || parsed.data.email !== process.env.ADMIN_EMAIL || parsed.data.password !== process.env.ADMIN_PASSWORD) return null;
    return { id: parsed.data.email, email: parsed.data.email, role: "owner" };
  } })],
  callbacks: { jwt({ token, user }) { if (user) token.role = user.role; return token; }, session({ session, token }) { if (session.user) session.user.role = token.role as string; return session; } },
});
