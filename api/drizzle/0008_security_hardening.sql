-- Security hardening migration
-- Adds: Ed25519 signing key to user_keys, proof-of-possession challenge table,
--       per-device HMAC key storage in device_attestations.
-- Licensed under GPL v3 — Copyright (c) 2026 Rajzyngier Research

-- Ed25519 signing key for prekey signature verification
ALTER TABLE user_keys ADD COLUMN IF NOT EXISTS identity_signing_key text;

-- Challenge table for proof-of-possession during key registration.
-- Each challenge is 32 random bytes, expires in 5 minutes, consumed exactly once.
CREATE TABLE IF NOT EXISTS key_challenges (
  id          serial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id),
  challenge   text NOT NULL,
  expires_at  timestamp NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  created_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS key_challenges_user_expires_idx
  ON key_challenges(user_id, expires_at);

-- Device attestation table (created here if it didn't already exist)
CREATE TABLE IF NOT EXISTS device_attestations (
  id          serial PRIMARY KEY,
  key_id      text NOT NULL UNIQUE,
  attestation text NOT NULL,
  challenge   text,
  user_id     integer REFERENCES users(id),
  created_at  timestamp NOT NULL DEFAULT now()
);

-- Per-device HMAC signing key registered during App Attest.
-- Server uses this key to validate X-Fraise-Sig on all subsequent requests.
ALTER TABLE device_attestations ADD COLUMN IF NOT EXISTS hmac_key text;
