// Dashboard page - protected route accessible only after authentication
// Uses default layout colors and structure via CSS variables

export default function DashboardPage() {
  return (
    <div className="w-full">
      {/* Main content container using default styling */}
      <main className="max-w-4xl mx-auto">
        {/* Header section */}
        <div className="py-8">
          <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
          <p className="text-foreground/60 mt-2">
            Welcome to your nursery rota management dashboard
          </p>
        </div>

        {/* Content area */}
        <div className="border border-foreground/20 rounded-lg p-8 bg-background">
          <h2 className="text-2xl font-semibold text-foreground mb-4">Rota Management</h2>
          <p className="text-foreground/70 text-lg">
            Dashboard content goes here. This is your protected area after authentication.
          </p>
          
          {/* Quick links */}
          <div className="mt-8 pt-8 border-t border-foreground/10 space-y-2">
            <p className="text-foreground font-medium">Quick Actions:</p>
            <ul className="list-disc list-inside text-foreground/60 space-y-1">
              <li>Create new rota</li>
              <li>View existing rotas</li>
              <li>Edit schedule</li>
              <li>Export data</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
