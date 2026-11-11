INSERT INTO "permission" ("permission_id", "permission_name")
VALUES ('8fd27733-ef75-4580-bcb6-dae25c6f36d4', 'feedback.read')
ON CONFLICT ("permission_name") DO NOTHING;

INSERT INTO "role_permission" ("role_id", "permission_id")
SELECT r."role_id", p."permission_id"
FROM "role" r CROSS JOIN "permission" p
WHERE r."role_name" = 'AC' AND p."permission_name" = 'feedback.read'
ON CONFLICT DO NOTHING;
