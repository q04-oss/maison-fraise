-- fraise-chat E2E encryption migration
-- Adds Signal Protocol key storage and encrypted message fields
-- Licensed under GPL v3 — Copyright (c) 2026 Rajzyngier Research

-- Add encryption fields to messages table
ALTER TABLE messages
  ADD COLUMN encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN ephemeral_key text,
  ADD COLUMN sender_identity_key text,
  ADD COLUMN one_time_pre_key_id integer;

-- User identity + signed pre-key store (one row per user)
CREATE TABLE user_keys (
  id serial PRIMARY KEY,
  user_id integer NOT NULL UNIQUE REFERENCES users(id),
  identity_key text NOT NULL,
  signed_pre_key text NOT NULL,
  signed_pre_key_sig text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- One-time pre-key pool (consumed one per new session)
CREATE TABLE one_time_pre_keys (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  key_id integer NOT NULL,
  public_key text NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX otpk_user_key_idx ON one_time_pre_keys(user_id, key_id);
