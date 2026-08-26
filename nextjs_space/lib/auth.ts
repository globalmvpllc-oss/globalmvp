import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from '@/lib/session-config';

/**
 * Constant-time-ish decoy hash.
 *
 * When no user matches the submitted email we still run a bcrypt comparison
 * against this hash. Otherwise a missing user returns in ~1ms while an existing
 * user costs a full bcrypt round (~200ms at cost 12), and that gap is a reliable
 * oracle for enumerating registered email addresses.
 *
 * This is a hash of a random string that is not a usable password. It is not a
 * secret — its only job is to consume a comparable amount of CPU.
 */
const DECOY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.5vXtQmM6qXCHrfWvJXwPq0J7lQKgVvS';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Emails are stored normalised at signup; normalise on lookup too so
        // "Mehmet@X.com" and "mehmet@x.com" resolve to the same account.
        const email = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user?.hashedPassword) {
          // Burn equivalent CPU so response timing does not reveal existence.
          await bcrypt.compare(credentials.password, DECOY_HASH);
          return null;
        }

        const isValid = await bcrypt.compare(credentials.password, user.hashedPassword);
        if (!isValid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token?.id) {
        (session.user as { id: string }).id = token.id as string;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    // Durations live in lib/session-config so they carry no Prisma dependency
    // and can be asserted directly; the reasoning for each is documented there.
    maxAge: SESSION_MAX_AGE,
    updateAge: SESSION_UPDATE_AGE,
  },
  pages: {
    signIn: '/auth/login',
  },
};
