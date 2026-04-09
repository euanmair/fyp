'use client';

import { useCallback, useEffect, useState } from 'react';

type ScheduleSummary = {
  scheduleID: string;
  weekStartDate: string;
  createdAt: string;
  resultSummary?: {
    assignmentCount?: number;
  };
};

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomName?: string;
  staffID?: string;
  staffName?: string;
};

export default function StaffRotaPage() {
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedScheduleID, setSelectedScheduleID] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [status, setStatus] = useState('Loading your rota...');
  const [error, setError] = useState('');

  const loadSchedule = useCallback(async (scheduleID: string) => {
    setSelectedScheduleID(scheduleID);
    setError('');

    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(scheduleID)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load selected schedule.');
      }

      const nextAssignments = Array.isArray(data?.schedule?.assignments) ? data.schedule.assignments : [];
      setAssignments(nextAssignments);
      setStatus(nextAssignments.length > 0 ? 'Your rota is up to date.' : 'No shifts assigned in this schedule.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected schedule detail error.');
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    setError('');
    setStatus('Loading your rota...');

    try {
      const response = await fetch('/api/schedules?limit=30');
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load rota history.');
      }

      const nextSchedules: ScheduleSummary[] = data.schedules || [];
      setSchedules(nextSchedules);
      if (nextSchedules.length > 0) {
        await loadSchedule(nextSchedules[0].scheduleID);
      } else {
        setSelectedScheduleID('');
        setAssignments([]);
        setStatus('No rota has been generated for your organisation yet.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected rota load error.');
      setStatus('Unable to load your rota.');
    }
  }, [loadSchedule]);

  useEffect(() => {
    // Initial rota load on first render.
    loadSchedules();
  }, [loadSchedules]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-foreground/15 bg-background p-6">
        <h1 className="text-3xl font-bold">My Rota</h1>
        <p className="mt-2 text-foreground/70">View your assigned shifts across generated organisation schedules.</p>
        <p className="mt-3 text-sm text-foreground/70">{status}</p>
        {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <article className="rounded-xl border border-foreground/15 bg-background p-4">
          <h2 className="text-lg font-semibold">Schedules</h2>
          <div className="mt-3 max-h-[24rem] overflow-auto rounded-md border border-foreground/15">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/15 bg-foreground/5">
                  <th className="px-2 py-2 text-left">Week</th>
                  <th className="px-2 py-2 text-left">Shifts</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((schedule) => (
                  <tr
                    key={schedule.scheduleID}
                    className={`cursor-pointer border-b border-foreground/10 ${selectedScheduleID === schedule.scheduleID ? 'bg-foreground/10' : ''}`}
                    onClick={() => loadSchedule(schedule.scheduleID)}
                  >
                    <td className="px-2 py-2">
                      <div className="text-xs font-mono">{schedule.weekStartDate || 'n/a'}</div>
                      <div className="text-[11px] text-foreground/60">{schedule.scheduleID.slice(0, 8)}</div>
                    </td>
                    <td className="px-2 py-2">{Number(schedule.resultSummary?.assignmentCount || 0)}</td>
                  </tr>
                ))}
                {schedules.length === 0 ? (
                  <tr><td className="px-2 py-3 text-foreground/60" colSpan={2}>No schedules available.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-foreground/15 bg-background p-4">
          <h2 className="text-lg font-semibold">Assigned shifts</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/15 bg-foreground/5">
                  <th className="px-2 py-2 text-left">Week</th>
                  <th className="px-2 py-2 text-left">Day</th>
                  <th className="px-2 py-2 text-left">Start</th>
                  <th className="px-2 py-2 text-left">End</th>
                  <th className="px-2 py-2 text-left">Room</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((shift, index) => (
                  <tr key={`${shift.day || 'd'}-${index}`} className="border-b border-foreground/10">
                    <td className="px-2 py-2">{shift.week || 1}</td>
                    <td className="px-2 py-2">{shift.day || '-'}</td>
                    <td className="px-2 py-2">{shift.start || '-'}</td>
                    <td className="px-2 py-2">{shift.end || '-'}</td>
                    <td className="px-2 py-2">{shift.roomName || '-'}</td>
                  </tr>
                ))}
                {assignments.length === 0 ? (
                  <tr><td className="px-2 py-3 text-foreground/60" colSpan={5}>No assigned shifts in this schedule.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
