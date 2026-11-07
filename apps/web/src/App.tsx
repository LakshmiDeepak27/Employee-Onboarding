import { lazy, Suspense, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  Link,
  useLocation,
} from "react-router-dom";
import { SessionProvider, useSession, homeFor } from "./workspace/session";
import { Shell } from "./workspace/Shell";
import { Landing, Login, Signup, ForgotPassword } from "./workspace/Public";
import { can } from "./lib/api";
import { navigation, type Workspace } from "./workspace/navigation";
const page = <K extends keyof typeof import("./workspace/Pages")>(name: K) =>
  lazy(() => import("./workspace/Pages").then((m) => ({ default: m[name] })));
const resource = <K extends keyof typeof import("./workspace/Resources")>(
  name: K,
) =>
  lazy(() =>
    import("./workspace/Resources").then((m) => ({ default: m[name] })),
  );
const Dashboard = page("Dashboard"),
  Employees = page("Employees"),
  CreateEmployee = page("CreateEmployee"),
  EmployeeDetails = page("EmployeeDetails"),
  Plans = page("Plans"),
  PlanDetails = page("PlanDetails"),
  Tasks = page("Tasks");
const ServicePage = resource("ServicePage"),
  Departments = resource("Departments"),
  Policies = resource("Policies"),
  Analytics = resource("Analytics"),
  Audit = resource("Audit"),
  Settings = resource("Settings"),
  Help = resource("Help"),
  Payroll = resource("Payroll");
function Protected({ workspace }: { workspace: Workspace }) {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading)
    return (
      <div className="loading full-height" role="status">
        <span className="spinner" aria-hidden="true" />
        Restoring your session…
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  const role = workspace === "hr" ? "hr_admin" : workspace;
  if (!user.roles.includes(role)) return <ErrorPage denied />;
  const nav = navigation[workspace].find(
    (n) => n.path === location.pathname.split("/")[2],
  );
  if (nav?.permission && !can(user, nav.permission))
    return <ErrorPage denied />;
  return <Outlet />;
}
function Permission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { user } = useSession();
  return can(user, permission) ? children : <ErrorPage denied />;
}
export function ErrorPage({ denied = false }: { denied?: boolean }) {
  const { user } = useSession();
  return (
    <div className="route-error">
      <span className="eyebrow">
        {denied ? "ACCESS RESTRICTED" : "404 · PAGE NOT FOUND"}
      </span>
      <h1>
        {denied
          ? "This space isn’t in your role."
          : "Let’s get you back on track."}
      </h1>
      <p>
        {denied
          ? "Your account does not have access to this workspace. Contact HR if your access needs to change."
          : "The address may have changed, or this page does not exist."}
      </p>
      <Link className="button primary" to={user ? homeFor(user) : "/"}>
        Back to {user ? "my workspace" : "home"}
      </Link>
    </div>
  );
}
function Start() {
  const { user, loading } = useSession();
  return loading ? (
    <div className="loading">Restoring session…</div>
  ) : user ? (
    <Navigate to={homeFor(user)} replace />
  ) : (
    <Navigate to="/login" replace />
  );
}
export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Suspense
          fallback={
            <div className="loading" role="status">
              Loading page…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/invite" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/workspace" element={<Start />} />
            <Route path="/access-denied" element={<ErrorPage denied />} />
            {(["hr", "it_admin", "employee", "manager"] as const).map((w) => (
              <Route key={w} element={<Protected workspace={w} />}>
                <Route path={`/${w}`} element={<Shell workspace={w} />}>
                  <Route
                    index
                    element={
                      <Navigate
                        to={w === "employee" ? "home" : "dashboard"}
                        replace
                      />
                    }
                  />
                  <Route
                    path={w === "employee" ? "home" : "dashboard"}
                    element={<Dashboard />}
                  />
                  {w !== "employee" && (
                    <>
                      <Route
                        path={w === "hr" || w === "it_admin" ? "employees" : "team"}
                        element={<Employees />}
                      />
                      <Route
                        path={`${w === "hr" || w === "it_admin" ? "employees" : "team"}/:employeeId`}
                        element={<EmployeeDetails />}
                      />
                    </>
                  )}
                  {w === "hr" && (
                    <>
                      <Route
                        path="employees/new"
                        element={
                          <Permission permission="employee.create">
                            <CreateEmployee />
                          </Permission>
                        }
                      />
                      <Route path="approvals" element={<Plans approvals />} />
                      <Route path="departments" element={<Departments />} />
                      <Route
                        path="equipment"
                        element={<ServicePage service="equipment" />}
                      />
                      <Route path="payroll" element={<Payroll />} />
                      <Route
                        path="training"
                        element={<ServicePage service="training" />}
                      />
                      <Route
                        path="benefits"
                        element={<ServicePage service="benefits" />}
                      />
                      <Route
                        path="manager-tasks"
                        element={<ServicePage service="manager" />}
                      />
                      <Route path="policies" element={<Policies />} />
                      <Route path="analytics" element={<Analytics />} />
                      <Route path="audit-logs" element={<Audit />} />
                    </>
                  )}
                  {w === "it_admin" && (
                    <Route
                      path="equipment"
                      element={<ServicePage service="equipment" />}
                    />
                  )}
                  <Route
                    path={w === "hr" ? "plans" : "onboarding"}
                    element={<Plans />}
                  />
                  <Route
                    path={`${w === "hr" ? "plans" : "onboarding"}/:planId`}
                    element={<PlanDetails />}
                  />
                  <Route
                    path="tasks"
                    element={
                      w === "manager" ? (
                        <ServicePage service="manager" />
                      ) : (
                        <Tasks />
                      )
                    }
                  />
                  {w !== "manager" && w !== "it_admin" && (
                    <Route
                      path="documents"
                      element={<ServicePage service="documents" />}
                    />
                  )}
                  {w === "employee" && (
                    <>
                      <Route
                        path="training"
                        element={<ServicePage service="training" />}
                      />
                      <Route
                        path="benefits"
                        element={<ServicePage service="benefits" />}
                      />
                      <Route
                        path="assistant"
                        element={<Policies assistant />}
                      />
                      <Route
                        path="profile"
                        element={<EmployeeDetails self />}
                      />
                    </>
                  )}
                  <Route path="settings" element={<Settings />} />
                  <Route path="help" element={<Help />} />
                  <Route path="*" element={<ErrorPage />} />
                </Route>
              </Route>
            ))}
            <Route path="*" element={<ErrorPage />} />
          </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  );
}
