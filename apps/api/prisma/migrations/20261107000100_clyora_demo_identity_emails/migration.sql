-- Align only the three seeded login identities with the internal CLYORA
-- address convention. Their user-role rows and OIDC subjects remain intact.
UPDATE "users" SET "email" = 'asha.hr@clyora' WHERE "email" = 'hr.admin@demo.io';
UPDATE "users" SET "email" = 'david.manager@clyora' WHERE "email" = 'manager@demo.io';
UPDATE "users" SET "email" = 'priya@clyora' WHERE "email" = 'priya@demo.io';
