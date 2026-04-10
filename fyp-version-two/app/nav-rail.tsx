import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionClaimsFromCookies, canManageSchedules, isAdmin } from "@/lib/auth";

type Session = {
  email: string;
  role: "staff" | "manager" | "admin";
  organisationID: string | null;
} | null;

async function getSession(): Promise<Session> {
  const claims = await getSessionClaimsFromCookies();
  if (!claims) {
    return null;
  }

  return {
    email: claims.email,
    role: claims.role,
    organisationID: claims.organisationID,
  };
}

export default async function NavRail() {
  async function logout() {
    "use server";

    // Remove the auth cookie and return the user to the sign-in page.
    const cookieStore = await cookies();
    cookieStore.delete("auth-token");
    redirect("/login");
  }

  const session = await getSession();

  return (
    <>
      <details className="fixed left-2 right-2 top-2 z-50 rounded-xl border border-foreground/20 bg-background/95 shadow-lg backdrop-blur md:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
          <span>☰ Menu</span>
          <span className="text-xs text-foreground/60">Tap to open</span>
        </summary>
        <div className="border-t border-foreground/15 px-3 py-3">
          <p className="text-xs uppercase tracking-wide text-foreground/60">Navigation</p>
          <nav className="mt-3 flex flex-col gap-2">
            <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/">Home</Link>
            {session && canManageSchedules(session.role) ? (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/dashboard">Schedule Generator</Link>
            ) : null}
            {session && canManageSchedules(session.role) ? (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/dashboard/history">Schedule History</Link>
            ) : null}
            {session ? (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/staff">My Rota</Link>
            ) : null}
            {session ? (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/join-organisation">Join Organisation</Link>
            ) : null}
            {session && isAdmin(session.role) ? (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/admin">Admin</Link>
            ) : null}
            {session ? (
              <form action={logout}>
                <button
                  type="submit"
                  className="w-full rounded-md border border-red-700/40 px-3 py-2 text-left text-sm text-red-700"
                >
                  Logout
                </button>
              </form>
            ) : (
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm" href="/login">Login</Link>
            )}
          </nav>
          <p className="mt-3 text-xs text-foreground/60">
            {session?.email ? `Signed in as ${session.email} (${session.role}${session.organisationID ? `, ${session.organisationID}` : ""})` : "Not signed in"}
          </p>
        </div>
      </details>

      <aside className="group/nav fixed left-0 top-1/2 z-50 hidden -translate-y-1/2 md:block">
        <div className="flex items-center">
          <div
            className="flex h-14 w-8 items-center justify-center rounded-r-md border border-foreground/20 bg-background/95 text-sm font-semibold shadow-sm"
            aria-hidden="true"
          >
            &gt;
          </div>
          <div className="-ml-1 w-64 -translate-x-[calc(100%-2rem)] rounded-r-xl border border-foreground/20 bg-background/95 p-4 shadow-lg backdrop-blur transition-transform duration-300 group-hover/nav:translate-x-0 group-focus-within/nav:translate-x-0">
            <p className="text-xs uppercase tracking-wide text-foreground/60">Navigation</p>
            <nav className="mt-3 flex flex-col gap-2">
              <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/">Home</Link>
              {session && canManageSchedules(session.role) ? (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/dashboard">Schedule Generator</Link>
              ) : null}
              {session && canManageSchedules(session.role) ? (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/dashboard/history">Schedule History</Link>
              ) : null}
              {session ? (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/staff">My Rota</Link>
              ) : null}
              {session ? (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/join-organisation">Join Organisation</Link>
              ) : null}
              {session && isAdmin(session.role) ? (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/admin">Admin</Link>
              ) : null}
              {session ? (
                <form action={logout}>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-red-700/40 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-700 hover:text-white"
                  >
                    Logout
                  </button>
                </form>
              ) : (
                <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/login">Login</Link>
              )}
            </nav>
            <p className="mt-3 text-xs text-foreground/60">
              {session?.email ? `Signed in as ${session.email} (${session.role}${session.organisationID ? `, ${session.organisationID}` : ""})` : "Not signed in"}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
