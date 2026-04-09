'use client';

import { useState } from 'react';
import { joinOrganisation } from '../(auth)/login/actions';

export default function JoinOrganisationPage() {
  const [organisationID, setOrganisationID] = useState('');
  const [staffID, setStaffID] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('organisationID', organisationID);
      formData.append('staffID', staffID);

      const result = await joinOrganisation(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setMessage(result.message || 'Organisation details saved.');
      }
    } catch {
      setError('Unable to update organisation details.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <section className="rounded-xl border border-foreground/15 bg-background p-6">
        <h1 className="text-2xl font-bold">Join an organisation</h1>
        <p className="mt-2 text-sm text-foreground/70">
          If your account was created without an organisation, add one here to unlock organisation rota access.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="organisationID" className="text-sm font-medium">Organisation ID</label>
            <input
              id="organisationID"
              required
              value={organisationID}
              onChange={(e) => setOrganisationID(e.target.value)}
              className="w-full rounded-md border border-foreground/20 px-3 py-2"
              placeholder="little-stars-nursery"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="staffID" className="text-sm font-medium">Staff ID (optional)</label>
            <input
              id="staffID"
              value={staffID}
              onChange={(e) => setStaffID(e.target.value)}
              className="w-full rounded-md border border-foreground/20 px-3 py-2"
              placeholder="ST-102"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save organisation'}
          </button>
        </form>

        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-green-700">{message}</p> : null}
      </section>
    </main>
  );
}
