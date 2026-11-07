import "dotenv/config";

type RealmUser = {
  id: string;
  username: string;
  email?: string;
  serviceAccountClientId?: string;
};

async function main() {
  const issuerValue = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
  if (!issuerValue || !clientId || !clientSecret) {
    throw new Error("Set OIDC_ISSUER_URL, KEYCLOAK_ADMIN_CLIENT_ID, and KEYCLOAK_ADMIN_CLIENT_SECRET in the API .env first.");
  }

  const issuer = new URL(issuerValue);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(issuer.hostname)) {
    throw new Error("This presentation cleanup only runs against a localhost Keycloak realm.");
  }
  const realmMatch = issuer.pathname.match(/\/realms\/([^/]+)\/?$/);
  if (!realmMatch) throw new Error("OIDC_ISSUER_URL must end with /realms/<realm>.");
  const realm = decodeURIComponent(realmMatch[1]!);
  const realmUrl = `${issuer.origin}/admin/realms/${encodeURIComponent(realm)}`;

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(`${issuer.origin}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`Cannot reach Keycloak at ${issuer.origin}. Start the local service with npm run auth:up, then retry.`);
  }
  if (!tokenResponse.ok) throw new Error("Keycloak rejected the service account. Confirm its view-users and manage-users realm-management roles.");
  const token = (await tokenResponse.json() as { access_token?: string }).access_token;
  if (!token) throw new Error("Keycloak returned no service-account token.");
  const headers = { authorization: `Bearer ${token}` };

  const users: RealmUser[] = [];
  for (let first = 0; ; first += 100) {
    let response: Response;
    try {
      response = await fetch(`${realmUrl}/users?first=${first}&max=100`, { headers, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new Error(`Keycloak at ${issuer.origin} stopped responding while listing realm users. Start it with npm run auth:up and retry.`);
    }
    if (!response.ok) throw new Error("Could not list Keycloak realm users; check the service-account view-users permission.");
    const page = await response.json() as RealmUser[];
    users.push(...page);
    if (page.length < 100) break;
  }

  // Prefer the exact identity email. If this older realm uses a different
  // contact email, fall back to the CLYORA username. Selecting one ID per role
  // avoids accidentally preserving duplicate aliases after cleanup.
  const hrUser = users.find((user) => user.email?.toLowerCase() === "asha.hr@clyora")
    ?? users.find((user) => ["asha.hr", "asha.hr@clyora"].includes(user.username.toLowerCase()));
  const managerUser = users.find((user) => user.email?.toLowerCase() === "david.manager@clyora")
    ?? users.find((user) => ["david.manager", "david.manager@clyora"].includes(user.username.toLowerCase()));
  if (!hrUser || !managerUser || hrUser.id === managerUser.id) {
    throw new Error("Both Asha Rao (asha.hr) and David Chen (david.manager) must exist in this realm before cleanup. No users were deleted.");
  }
  const keptIds = new Set([hrUser.id, managerUser.id]);

  // Keep machine identities needed for provisioning. The admin-console account
  // belongs to Keycloak's separate master realm and is never touched here.
  const removable = users.filter((user) =>
    !keptIds.has(user.id) &&
    !user.serviceAccountClientId &&
    !user.username.toLowerCase().startsWith("service-account-"),
  );
  console.log(`Realm: ${realm}`);
  console.log(`Keeping CLYORA identities: ${hrUser.username}, ${managerUser.username}`);
  console.log(`Preserving realm service accounts. Other human accounts eligible for removal: ${removable.length}`);

  if (!process.argv.includes("--apply")) {
    console.log("Dry run only. Re-run with --apply to remove the listed non-staff accounts.");
    for (const user of removable) console.log(`  would remove ${user.username}`);
    return;
  }

  for (const user of removable) {
    const response = await fetch(`${realmUrl}/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Could not remove Keycloak user ${user.username}; check manage-users permission.`);
    }
  }
  console.log(`Removed ${removable.length} non-staff Keycloak accounts. HR and manager are ready for the fresh employee invite.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
