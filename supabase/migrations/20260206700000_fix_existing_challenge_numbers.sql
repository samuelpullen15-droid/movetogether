-- ============================================================================
-- Fix Existing Challenge Numbers with Commas
-- ============================================================================
-- Updates existing challenge titles to have formatted numbers with commas

-- Update existing challenges: replace raw target_value with formatted version
UPDATE weekly_challenges
SET title = REPLACE(title, target_value::text, to_char(target_value, 'FM999,999,999'))
WHERE target_value >= 1000
  AND title LIKE '%' || target_value::text || '%';
