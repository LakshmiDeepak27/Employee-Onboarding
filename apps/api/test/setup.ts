process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/employee_onboarding_test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-change-me-32-characters";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-change-me-32-characters";
