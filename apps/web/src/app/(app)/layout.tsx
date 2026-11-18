import { Nav } from "@/components/Nav";
import { logoutAction } from "@/lib/actions";
import { t } from "@/lib/i18n";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, workspace, ctx } = await requireSession();
  const [pending, active] = await Promise.all([
    ctx.db.task.count({ where: { workspaceId: workspace.id, status: "awaiting_approval" } }),
    workspace.activeAccountId ? ctx.db.instagramAccount.findUnique({ where: { id: workspace.activeAccountId } }) : null,
  ]);
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">
          Jarvis<span>gram</span>
        </div>
        <Nav pending={pending} />
        <div className="foot">
          {active && <span className="badge accent">@{active.username}</span>}
          <span className="muted">{user.email}</span>
          <form action={logoutAction}>
            <button className="btn ghost sm">{t.nav.logout}</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
