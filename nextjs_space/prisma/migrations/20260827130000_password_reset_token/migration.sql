-- PasswordResetToken table.
--
-- Purely additive: no existing table, column or row is created, altered,
-- dropped or rewritten, so this cannot lose or change data. Rolling back is
-- dropping the table.
--
-- Backs the password-reset flow: a hashed, single-use, expiring token per
-- request. Only the SHA-256 hash of the emailed token is stored, never the
-- token itself.

CREATE TABLE "PasswordResetToken" (
    "id"        TEXT         NOT NULL,
    "tokenHash" TEXT         NOT NULL,
    "userId"    TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    -- Null until the token is spent; a second attempt finds it non-null.
    "usedAt"    TIMESTAMP(3),

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- Exact lookup by the emailed token's hash. Unique so a token can be spent once.
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- "every reset token for this user", for invalidating outstanding ones.
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- Supports expiry sweeps of stale tokens.
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- Deleting a user removes their outstanding reset tokens.
ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
