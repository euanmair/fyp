'use client';

import { useState } from 'react';
import { requestPasswordReset, resetPassword } from '../login/actions';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isRequesting, setIsRequesting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');

  async function onRequestReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    setDevCode('');
    setIsRequesting(true);

    try {
      const formData = new FormData();
      formData.append('email', email);

      const result = await requestPasswordReset(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(result.message || 'If the email exists, a reset code has been generated.');
        if (result.developmentCode) {
          setDevCode(result.developmentCode);
          setCode(result.developmentCode);
        }
      }
    } catch {
      setError('Unable to request password reset');
    } finally {
      setIsRequesting(false);
    }
  }

  async function onResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsResetting(true);

    try {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('code', code);
      formData.append('newPassword', newPassword);
      formData.append('confirmPassword', confirmPassword);

      const result = await resetPassword(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(result.message || 'Password reset successfully.');
      }
    } catch {
      setError('Unable to reset password');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-foreground/70 mt-1">
            Request a reset code, then set a new password.
          </p>
        </div>

        <form className="space-y-3" onSubmit={onRequestReset}>
          <label htmlFor="email" className="block text-sm font-medium">Email address</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
            placeholder="you@example.com"
          />
          <button
            type="submit"
            disabled={isRequesting}
            className="w-full py-2 px-4 rounded-md bg-foreground text-background font-medium disabled:opacity-50"
          >
            {isRequesting ? 'Generating code...' : 'Request reset code'}
          </button>
        </form>

        {devCode ? (
          <div className="p-3 rounded-md bg-yellow-50 text-yellow-900 text-sm border border-yellow-200">
            Development reset code: <strong>{devCode}</strong>
          </div>
        ) : null}

        <form className="space-y-3" onSubmit={onResetPassword}>
          <label htmlFor="code" className="block text-sm font-medium">Reset code</label>
          <input
            id="code"
            type="text"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
            placeholder="Enter your reset code"
          />

          <label htmlFor="newPassword" className="block text-sm font-medium">New password</label>
          <input
            id="newPassword"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
            placeholder="At least 8 characters"
          />

          <label htmlFor="confirmPassword" className="block text-sm font-medium">Confirm new password</label>
          <input
            id="confirmPassword"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 border border-foreground/20 rounded-md bg-background text-foreground"
            placeholder="Repeat new password"
          />

          <button
            type="submit"
            disabled={isResetting}
            className="w-full py-2 px-4 rounded-md border border-foreground/30 font-medium disabled:opacity-50"
          >
            {isResetting ? 'Resetting password...' : 'Set new password'}
          </button>
        </form>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <p className="text-sm text-foreground/70">
          Return to <a className="underline" href="/login">sign in</a>.
        </p>
      </div>
    </div>
  );
}
