-- Step 5c: normalize existing users to one primary account role.
-- This matches the application rule that account access is a single-role hierarchy.
-- The highest role in the hierarchy is kept for each user.

START TRANSACTION;

DELETE ur
FROM user_roles ur
JOIN (
  SELECT
    ranked.user_id,
    ranked.role_id
  FROM (
    SELECT
      ur_inner.user_id,
      ur_inner.role_id,
      ROW_NUMBER() OVER (
        PARTITION BY ur_inner.user_id
        ORDER BY
          CASE r.code
            WHEN 'admin' THEN 10
            WHEN 'management' THEN 20
            WHEN 'tech_lead' THEN 30
            WHEN 'tech' THEN 40
            ELSE 999
          END,
          r.name,
          ur_inner.role_id
      ) AS role_rank
    FROM user_roles ur_inner
    JOIN roles r
      ON r.role_id = ur_inner.role_id
  ) ranked
  WHERE ranked.role_rank > 1
) roles_to_remove
  ON roles_to_remove.user_id = ur.user_id
  AND roles_to_remove.role_id = ur.role_id;

COMMIT;

SELECT
  u.user_id,
  u.email,
  GROUP_CONCAT(r.code ORDER BY
    CASE r.code
      WHEN 'admin' THEN 10
      WHEN 'management' THEN 20
      WHEN 'tech_lead' THEN 30
      WHEN 'tech' THEN 40
      ELSE 999
    END
    SEPARATOR ', '
  ) AS remaining_role_codes
FROM users u
LEFT JOIN user_roles ur
  ON ur.user_id = u.user_id
LEFT JOIN roles r
  ON r.role_id = ur.role_id
GROUP BY u.user_id, u.email
ORDER BY u.email;
