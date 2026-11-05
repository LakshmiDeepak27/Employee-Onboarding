import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuthUser } from '@eo/contracts';
import { api, setAccessToken, ApiError, can } from './lib/api.js';

/**
 * Scaffold only. Trisha and Neelavathi own the real UI from here.
 *
 * What this proves, and why it is worth keeping:
 *   1. The Vite proxy reaches the API.
 *   2. Login works end to end: the access token is held in memory while the
 *      refresh token stays in an httpOnly cookie.
 *   3. Types come from @eo/contracts, so the UI cannot drift from the API.
 *   4. The scope rule is visible. Sign in as each of the three demo users
 *      and the employee list changes without any client-side filtering.
 */
export function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [email, setEmail] = useState('hr.admin@demo.io');
  const [password, setPassword] = useState('Onboard!ng2026');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.auth.login({ email, password });
      setAccessToken(res.accessToken);
      setUser(res.user);
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="wrap">
        <h1>Employee Onboarding Orchestrator</h1>
        <p className="sub">Sign in to continue</p>
        <form className="card" onSubmit={signIn}>
          {error ? <div className="err">{error}</div> : null}
          <label htmlFor="email">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
          <p className="note">
            Demo accounts, all with password <code>Onboard!ng2026</code>.
            <br />
            <code>hr.admin@demo.io</code> sees every employee.
            <br />
            <code>manager@demo.io</code> sees only their direct report.
            <br />
            <code>priya@demo.io</code> sees only herself.
          </p>
        </form>
      </div>
    );
  }

  return (
    <Dashboard
      user={user}
      onSignOut={() => {
        setAccessToken(null);
        setUser(null);
      }}
    />
  );
}

function Dashboard({ user, onSignOut }: { user: AuthUser; onSignOut: () => void }) {
  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.list({ pageSize: 50 }),
  });

  const abilities: [string, string][] = [
    ['Approve an onboarding plan', 'plan.approve'],
    ['Write payroll data', 'payroll.write'],
    ['Verify documents', 'document.verify'],
    ['Resolve escalations', 'escalation.resolve'],
  ];

  return (
    <div className="wrap">
      <h1>
        {user.firstName} {user.lastName}
      </h1>
      <p className="sub">
        {user.roles.map((r) => (
          <span className="pill" key={r}>
            {r}
          </span>
        ))}
        {user.permissions.length} permissions
      </p>

      <div className="card">
        <strong>Employees visible to you</strong>
        <p className="note">
          Filtered in SQL by the scope your role holds <code>employee.read</code> at. There
          is no client-side filtering here. Sign in as a different demo user and the list
          changes.
        </p>
        {employees.isLoading ? <p>Loading...</p> : null}
        {employees.error ? <div className="err">{String(employees.error)}</div> : null}
        {employees.data ? (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Jurisdiction</th>
                <th>Start date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {employees.data.items.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.firstName} {e.lastName}
                  </td>
                  <td>
                    <code>{e.jurisdictionCode}</code>
                  </td>
                  <td>{e.startDate}</td>
                  <td>{e.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="card">
        <strong>What your role can do</strong>
        <p className="note">
          Rendered from <code>can(user, key)</code>. This hides controls as a convenience
          only; the server re-checks every request and is the real authority.
        </p>
        <ul style={{ fontSize: 13, lineHeight: 1.9 }}>
          {abilities.map(([label, key]) => (
            <li key={key}>
              {label}: <strong>{can(user, key) ? 'yes' : 'no'}</strong>
            </li>
          ))}
        </ul>
      </div>

      <button onClick={onSignOut}>Sign out</button>
    </div>
  );
}
