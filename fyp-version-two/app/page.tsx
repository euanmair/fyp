import { getSessionClaimsFromCookies } from "@/lib/auth";

export default async function Home() {
  const session = await getSessionClaimsFromCookies();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-16">
      <section className="rounded-2xl border border-foreground/15 bg-gradient-to-br from-slate-100 via-white to-amber-100 p-8 shadow-sm sm:p-12">
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground/60">Early Years Scheduler</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
              Early-years rota planning for real nursery teams
            </h1>
            <p className="mt-4 max-w-xl text-base text-foreground/75 sm:text-lg">
              Generate and manage compliant rotas per organisation, keep managers in control, and help staff see their shifts clearly.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {session ? (
                <a href="/dashboard" className="rounded-md bg-foreground px-5 py-2.5 font-medium text-background">Go to Dashboard</a>
              ) : (
                <>
                  <a href="/login" className="rounded-md bg-foreground px-5 py-2.5 font-medium text-background">Login</a>
                  <a href="/login" className="rounded-md border border-foreground/25 px-5 py-2.5 font-medium">Register now</a>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-foreground/15 bg-background/80 p-5 backdrop-blur">
            <h2 className="text-lg font-semibold">About us</h2>
            <p className="mt-2 text-sm leading-6 text-foreground/75">
              This platform was built to reduce manual rota effort in early-years settings. It supports organisation-level data boundaries,
              manager-led planning, and role-based access for staff, managers and admins.
            </p>

            <ul className="mt-4 grid gap-2 text-sm text-foreground/75">
              <li>Organisation groups with isolated rota history</li>
              <li>Optimised shift generation with editable outcomes</li>
              <li>Secure server-side Lambda and DynamoDB integration</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
