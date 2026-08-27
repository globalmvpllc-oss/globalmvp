import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { SESSION_MAX_AGE, SESSION_UPDATE_AGE } from '@/lib/session-config';
import { isGoogleConfigured, isSignInAllowed } from '@/lib/auth/oauth';

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

/**
 * Providers.
 *
 * Credentials is always present. Google is added only when both its id and
 * secret are configured, so an unconfigured deployment exposes no Google
 * provider at all (and the UI, which reads the provider list, shows no button)
 * — the app behaves exactly as it did before.
 */
const providers: NextAuthOptions['providers'] = [
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

      // A deactivated account is refused sign-in. Checked after the password
      // so it adds no new timing signal for enumerating accounts.
      if (!user.isActive) return null;

      return { id: user.id, name: user.name, email: user.email };
    },
  }),
];

if (isGoogleConfigured()) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // Links a Google sign-in to an existing password account with the same
      // email, so someone who registered with a password can sign in with
      // Google without a second account being created.
      //
      // This flag is SAFE ONLY because of the `signIn` callback below, which
      // refuses any Google sign-in whose email Google has not verified. Do NOT
      // remove that guard while keeping this flag: linking on an unverified
      // address is the account takeover this flag is named for.
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      // Only Google is gated, and only to require Google's own email
      // verification — see lib/auth/oauth.ts and the GoogleProvider comment
      // above. Credentials sign-ins are unaffected.
      return isSignInAllowed({
        account,
        profile: profile as { email_verified?: unknown } | null,
      });
    },
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
  events: {
    // A Google-authenticated address is verified by definition — the signIn
    // guard above already required Google's own email_verified — so mark it
    // verified when the account is created and when Google is linked to an
    // existing account. This keeps a Google user out of the email-verification
    // flow entirely. Adapter-created/linked accounts here are OAuth; credentials
    // signup writes its user through /api/signup and fires neither event.
    async createUser({ user }) {
      if (user?.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
          .catch(() => {});
      }
    },
    async linkAccount({ user }) {
      if (user?.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { emailVerified: new Date() } })
          .catch(() => {});
      }
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
