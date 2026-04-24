'use client'; // This directive tells Next.js this is a client component, allowing use of React hooks and browser APIs

import { useState } from 'react'; // React hook for managing component state
import { loginUser, registerUser } from './actions'; // Import server actions for handling auth logic

// Main component for the login page - exported as default for Next.js routing
export default function LoginPage() {
  // State variables to manage form data and UI state
  const [email, setEmail] = useState(''); // Stores the user's email input
  const [password, setPassword] = useState(''); // Stores the user's password input
  const [confirmPassword, setConfirmPassword] = useState(''); // Stores confirm-password input for registration
  const [role, setRole] = useState<'staff' | 'manager' | 'admin'>('staff');
  const [organisationID, setOrganisationID] = useState('');
  const [staffID, setStaffID] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState(''); // Stores any error messages to display
  const [info, setInfo] = useState(''); // Stores non-error messages
  const [isLoading, setIsLoading] = useState(false); // Tracks if login request is in progress
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Form submission handler - called when user submits the login form
  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission behavior (page reload)
    setError(''); // Clear any previous error messages
    setInfo('');
    setIsLoading(true); // Set loading state to show spinner/button disabled

    try {
      // Create FormData object to send form data to server action
      const formData = new FormData();
      formData.append('email', email); // Add email to form data
      formData.append('password', password); // Add password to form data
      formData.append('confirmPassword', confirmPassword);
      formData.append('role', role);
      formData.append('organisationID', organisationID);
      formData.append('staffID', staffID);
      formData.append('inviteCode', inviteCode);

      // Call the relevant server action with form data
      const result = mode === 'register' ? await registerUser(formData) : await loginUser(formData);

      // Check if server returned an error
      if (result.error) {
        setError(result.error); // Display error message to user
      } else {
        if (mode === 'register') {
          setInfo('Registration successful. Redirecting to dashboard...');
        }
        // Authentication successful - redirect to dashboard
        // Note: In production, consider using Next.js router for client-side navigation
        window.location.href = '/dashboard';
      }
    } catch {
      // Handle unexpected errors (network issues, etc.)
      setError('An unexpected error occurred');
    } finally {
      // Always reset loading state when request completes
      setIsLoading(false);
    }
  };

  // JSX return - defines the UI structure of the login page
  // Uses the default layout colors: background/foreground CSS variables
  return (
    // Main container using the default layout styling (min-h-screen handled by body)
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Form container with default layout colors */}
      <div className="w-full max-w-sm space-y-6">
        {/* Title section */}
        <div>
          <h1 className="text-2xl font-bold">{mode === 'login' ? 'Sign in to your account' : 'Create your account'}</h1>
          <p className="text-sm text-foreground/60 mt-1">
            {mode === 'login' ? 'Use your existing credentials to continue.' : 'Register a new account with role and optional organisation membership.'}
          </p>
        </div>

        <div className="flex rounded-md border border-foreground/20 p-1">
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 text-sm ${mode === 'login' ? 'bg-foreground text-background' : 'text-foreground/80'}`}
            onClick={() => {
              setMode('login');
              setError('');
              setInfo('');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`flex-1 rounded px-3 py-2 text-sm ${mode === 'register' ? 'bg-foreground text-background' : 'text-foreground/80'}`}
            onClick={() => {
              setMode('register');
              setError('');
              setInfo('');
            }}
          >
            Register
          </button>
        </div>

        {/* Login form with submit handler */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Email input field */}
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium">
              Email address
            </label>
            <input
              id="email" // Links label to input for accessibility
              name="email" // Form field name
              type="email" // Input type for validation and mobile keyboard
              autoComplete="email" // Browser autocomplete hint
              required // HTML5 validation - field must be filled
              className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/30"
              placeholder="Enter your email" // Placeholder text
              value={email} // Controlled input value
              onChange={(e) => setEmail(e.target.value)} // Update state on change
            />
          </div>

          {/* Password input field */}
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <input
              id="password" // Links label to input for accessibility
              name="password" // Form field name
              type="password" // Input type hides password characters
              autoComplete="current-password" // Browser autocomplete hint
              required // HTML5 validation - field must be filled
              className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/30"
              placeholder="Enter your password" // Placeholder text
              value={password} // Controlled input value
              onChange={(e) => setPassword(e.target.value)} // Update state on change
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium">
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-foreground/30"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="role" className="block text-sm font-medium">
                  Account role
                </label>
                <select
                  id="role"
                  name="role"
                  value={role}
                  onChange={(e) => setRole((e.target.value as 'staff' | 'manager' | 'admin') || 'staff')}
                  className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>

              <div className="space-y-2">
                <label htmlFor="organisationID" className="block text-sm font-medium">
                  Organisation ID (optional)
                </label>
                <input
                  id="organisationID"
                  name="organisationID"
                  className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
                  placeholder="e.g. little-stars-nursery"
                  value={organisationID}
                  onChange={(e) => setOrganisationID(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="staffID" className="block text-sm font-medium">
                  Staff ID (optional)
                </label>
                <input
                  id="staffID"
                  name="staffID"
                  className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
                  placeholder="e.g. ST-102"
                  value={staffID}
                  onChange={(e) => setStaffID(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Error message display - only shows when error exists */}
          {error && (
            <div className="flex items-start gap-2 p-4 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm font-medium">
              <span className="shrink-0 mt-0.5">&#9888;</span>
              <span>{error}</span>
            </div>
          )}

          {info && (
            <div className="flex items-start gap-2 p-4 rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm font-medium">
              <span className="shrink-0 mt-0.5">&#10003;</span>
              <span>{info}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit" // Button type for form submission
            disabled={isLoading} // Disable when loading to prevent double submission
            className="w-full py-2 px-4 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {/* Dynamic button text based on loading state */}
            {isLoading ? (mode === 'login' ? 'Signing in...' : 'Registering...') : (mode === 'login' ? 'Sign in' : 'Register')}
          </button>
        </form>
      </div>
    </div>
  );
}
