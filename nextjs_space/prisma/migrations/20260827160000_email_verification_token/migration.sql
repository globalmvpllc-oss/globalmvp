-- EmailVerificationToken table.
--
-- Purely additive: a new table, no existing table or column is touched. Mirrors
-- PasswordResetToken — only the SHA-256 hash of the emailed token is stored,
-- usedAt makes it single-use, expiresAt bounds it. Deleting a user removes their
-- pending verification tokens.

CREATE TABLE "EmailVerificationToken" (
    "id"        TEXT         NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- Exact lookup by the emailed token's hash; single-use is enforced by usedAt.
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- "every verification token for this user", for invalidating outstanding ones.
CREATE INDEX "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");

-- Supports expiry sweeps of stale tokens.
CREATE INDEX "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken"("expiresAt");

-- Deleting a user removes their outstanding verification tokens.
ALTER TABLE "EmailVerificationToken"
    ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
