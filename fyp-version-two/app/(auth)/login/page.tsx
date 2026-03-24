'use client'; // This directive tells Next.js this is a client component, allowing use of React hooks and browser APIs

import { useState, FormEvent } from 'react'; // React hook for managing component state
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
  return (
    // Main container with full height, centered content, and responsive padding
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Form container with max width and vertical spacing */}
      <div className="max-w-md w-full space-y-8">
        {/* Header section with title */}
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>

        {/* Login form with submit handler */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {/* Input fields container with rounded corners and shadow */}
          <div className="rounded-md shadow-sm -space-y-px">
            {/* Email input field */}
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email" // Links label to input for accessibility
                name="email" // Form field name
                type="email" // Input type for validation and mobile keyboard
                autoComplete="email" // Browser autocomplete hint
                required // HTML5 validation - field must be filled
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address" // Placeholder text
                value={email} // Controlled input value
                onChange={(e) => setEmail(e.target.value)} // Update state on change
              />
            </div>

            {/* Password input field */}
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password" // Links label to input for accessibility
                name="password" // Form field name
                type="password" // Input type hides password characters
                autoComplete="current-password" // Browser autocomplete hint
                required // HTML5 validation - field must be filled
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password" // Placeholder text
                value={password} // Controlled input value
                onChange={(e) => setPassword(e.target.value)} // Update state on change
              />
            </div>
          </div>

          {/* Error message display - only shows when error exists */}
          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          {/* Submit button */}
          <div>
            <button
              type="submit" // Button type for form submission
              disabled={isLoading} // Disable when loading to prevent double submission
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {/* Dynamic button text based on loading state */}
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>

          {/* Forgot password link */}
          <div className="text-center">
            <a
              href="/forgot-password" // Link to password reset page
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              Forgot your password?
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
