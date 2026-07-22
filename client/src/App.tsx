import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { GuestRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AuditLogsPage } from "./pages/AuditLogsPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { LoginPage } from "./pages/LoginPage";
import { OrganizationPage } from "./pages/OrganizationPage";
import { PeoplePage } from "./pages/PeoplePage";
import { ProjectFoldersPage } from "./pages/ProjectFoldersPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SearchPage } from "./pages/SearchPage";
import { SignupPage } from "./pages/SignupPage";

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<ProjectsPage />} />
              <Route path="projects/:projectId" element={<ProjectFoldersPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="organization" element={<OrganizationPage />} />
              <Route
                path="people"
                element={
                  <AdminOnly>
                    <PeoplePage />
                  </AdminOnly>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <AdminOnly>
                    <AuditLogsPage />
                  </AdminOnly>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
