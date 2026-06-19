-- Add is_retroactive flag to match_predictions.
--
-- Retroactive predictions are generated after the match completed, using current
-- model weights rather than those that existed at kickoff. They are produced by
-- predict_all_retroactive() to fill display gaps (404 fix) but must not be
-- included in headline calibration metrics, which must be out-of-sample only.
--
-- DEFAULT FALSE so existing rows (genuine pre-match predictions) are unaffected.

ALTER TABLE match_predictions
    ADD COLUMN is_retroactive BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN match_predictions.is_retroactive IS
    'TRUE when the prediction was generated after the match result was known. '
    'Exclude these rows from calibration metrics; they are in-sample.';
