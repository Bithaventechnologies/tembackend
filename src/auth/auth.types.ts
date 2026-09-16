export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  sessionId: string;
}
