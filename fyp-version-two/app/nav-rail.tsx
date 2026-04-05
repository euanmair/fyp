import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

type Session = {
  email: string;
} | null;

async function getSession(): Promise<Session> {
  // Validate the auth cookie server-side so navigation behaviour reflects sign-in state.
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) {
    return null;
  }

  try {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return {
      email: String(payload?.email || ""),
    };
  } catch {
    return null;
  }
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
    <aside className="group/nav fixed left-0 top-1/2 z-50 -translate-y-1/2">
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
            <Link className="rounded-md border border-foreground/20 px-3 py-2 text-sm hover:bg-foreground hover:text-background" href="/dashboard">Dashboard</Link>
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
            {session?.email ? `Signed in as ${session.email}` : "Not signed in"}
          </p>
        </div>
      </div>
    </aside>
  );
}
