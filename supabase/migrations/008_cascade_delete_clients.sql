-- =============================================================================
-- 008_cascade_delete_clients.sql
--
-- Change client_id FK on onboarding_tokens and onboarding_submissions from
-- ON DELETE RESTRICT to ON DELETE CASCADE so that deleting a client
-- automatically removes their tokens and submissions.
-- =============================================================================

ALTER TABLE onboarding_tokens
  DROP CONSTRAINT onboarding_tokens_client_id_fkey,
  ADD  CONSTRAINT onboarding_tokens_client_id_fkey
       FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE onboarding_submissions
  DROP CONSTRAINT onboarding_submissions_client_id_fkey,
  ADD  CONSTRAINT onboarding_submissions_client_id_fkey
       FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
