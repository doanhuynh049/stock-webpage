import { ShellContent } from "@/components/layout/shell-content";

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: { name?: string | null; email?: string | null } | null;
}) {
  return <ShellContent user={user}>{children}</ShellContent>;
}
