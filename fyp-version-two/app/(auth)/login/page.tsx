'use client'; // This directive tells Next.js this is a client component, allowing use of React hooks and browser APIs

import { useState } from 'react'; // React hook for managing component state
import { loginUser } from './actions'; // Import the server action for handling login logic

// Main component for the login page - exported as default for Next.js routing
export default function LoginPage() {
  // State variables to manage form data and UI state
  const [email, setEmail] = useState(''); // Stores the user's email input
  const [password, setPassword] = useState(''); // Stores the user's password input
  const [error, setError] = useState(''); // Stores any error messages to display
  const [isLoading, setIsLoading] = useState(false); // Tracks if login request is in progress

  // Form submission handler - called when user submits the login form
  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission behavior (page reload)
    setError(''); // Clear any previous error messages
    setIsLoading(true); // Set loading state to show spinner/button disabled

    try {
      // Create FormData object to send form data to server action
      const formData = new FormData();
      formData.append('email', email); // Add email to form data
      formData.append('password', password); // Add password to form data

      // Call the server action with form data
      const result = await loginUser(formData);

      // Check if server returned an error
      if (result.error) {
        setError(result.error); // Display error message to user
      } else {
        // Login successful - redirect to dashboard
        // Note: In production, consider using Next.js router for client-side navigation
        window.location.href = '/dashboard';
      }
    } catch (err) {
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
          <h1 className="text-2xl font-bold">Sign in to your account</h1>
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

          {/* Error message display - only shows when error exists */}
          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit" // Button type for form submission
            disabled={isLoading} // Disable when loading to prevent double submission
            className="w-full py-2 px-4 rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 focus:outline-none focus:ring-2 focus:ring-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {/* Dynamic button text based on loading state */}
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>

          {/* Forgot password link */}
          <div className="text-center">
            <a
              href="/forgot-password" // Link to password reset page
              className="text-sm text-foreground/60 hover:text-foreground"
            >
              Forgot your password?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
