'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ScheduleSummary = {
  scheduleID: string;
  createdAt: string;
  weekStartDate: string;
  resultSummary?: {
    assignmentCount?: number;
  };
};

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomID?: string;
  roomName?: string;
  staffID?: string;
  staffName?: string;
  isOffice?: boolean;
  unfilled?: boolean;
};

function swap<T>(items: T[], a: number, b: number) {
  const clone = [...items];
  const temp = clone[a];
  clone[a] = clone[b];
  clone[b] = temp;
  return clone;
}

function shiftWeek(dateStr: string, days: number) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPTY_ASSIGNMENT: Assignment = {
  week: 1, day: 'Monday', start: '08:00', end: '14:00',
  roomID: '', roomName: '', staffID: '', staffName: '',
  isOffice: false, unfilled: false,
};

export default function ScheduleHistoryPage() {
  const [weekStartDate, setWeekStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [browseAll, setBrowseAll] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleSummary[]>([]);
  const [selectedScheduleID, setSelectedScheduleID] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState<string>('[]');
  const [status, setStatus] = useState('Loading schedule history...');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const undoStack = useRef<Assignment[][]>([]);

  const isDirty = JSON.stringify(assignments) !== savedSnapshot;

  function pushUndo() {
    undoStack.current = [...undoStack.current.slice(-19), [...assignments]];
  }

  function popUndo() {
    const prev = undoStack.current.pop();
    if (prev) setAssignments(prev);
  }

  const selectSchedule = useCallback(async (scheduleID: string) => {
    if (!scheduleID) {
      setSelectedScheduleID('');
      setAssignments([]);
      setSavedSnapshot('[]');
      return;
    }

    setSelectedScheduleID(scheduleID);
    setIsBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(scheduleID)}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load selected schedule.');
      }

      const next = Array.isArray(data?.schedule?.assignments) ? data.schedule.assignments : [];
      setAssignments(next);
      setSavedSnapshot(JSON.stringify(next));
      undoStack.current = [];
      setStatus(`Loaded schedule ${scheduleID}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected schedule load error.');
    } finally {
      setIsBusy(false);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    setIsBusy(true);
    setError('');
    setStatus('Loading schedule history...');

    try {
      const params = new URLSearchParams({ limit: '50' });
      if (!browseAll && weekStartDate) {
        params.set('weekStartDate', weekStartDate);
      }
      const response = await fetch(`/api/schedules?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to load schedule history.');
      }

      const next = data.schedules || [];
      setSchedules(next);
      setStatus(next.length > 0 ? `${next.length} schedule(s) loaded.` : 'No schedules found.');

      if (next.length > 0) {
        await selectSchedule(next[0].scheduleID);
      } else {
        setSelectedScheduleID('');
        setAssignments([]);
        setSavedSnapshot('[]');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected schedule history error.');
      setStatus('Unable to load schedule history.');
    } finally {
      setIsBusy(false);
    }
  }, [selectSchedule, weekStartDate, browseAll]);

  async function saveAssignments() {
    if (!selectedScheduleID) {
      setError('Select a schedule first.');
      return;
    }

    setIsBusy(true);
    setError('');

    try {
      const response = await fetch(`/api/schedules/${encodeURIComponent(selectedScheduleID)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || 'Unable to save edited shifts.');
      }

      setSavedSnapshot(JSON.stringify(assignments));
      undoStack.current = [];
      setStatus('Shift edits saved successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected save error.');
    } finally {
      setIsBusy(false);
    }
  }

  function addRow() {
    pushUndo();
    setAssignments((prev) => [...prev, { ...EMPTY_ASSIGNMENT }]);
  }

  function deleteRow(index: number) {
    pushUndo();
    setAssignments((prev) => prev.filter((_, i) => i !== index));
  }

  useEffect(() => {
    // Initial history load on first render.
    loadSchedules();
  }, [loadSchedules]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <section className="rounded-xl border border-foreground/15 bg-background p-6">
        <h1 className="text-3xl font-bold">Schedule History and Shift Editor</h1>
        <p className="mt-2 text-foreground/70">Browse past and future schedules by week, edit shift objects interactively, and save changes.</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Week start date
            <input
              type="date"
              value={weekStartDate}
              disabled={browseAll}
              onChange={(e) => setWeekStartDate(e.target.value)}
              className="ml-2 rounded-md border border-foreground/20 px-2 py-1 disabled:opacity-40"
            />
          </label>
          <button onClick={() => setWeekStartDate(shiftWeek(weekStartDate, -7))} disabled={isBusy || browseAll} className="rounded-md border border-foreground/30 px-3 py-2 text-sm disabled:opacity-50">&larr; Prev week</button>
          <button onClick={() => setWeekStartDate(shiftWeek(weekStartDate, 7))} disabled={isBusy || browseAll} className="rounded-md border border-foreground/30 px-3 py-2 text-sm disabled:opacity-50">Next week &rarr;</button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={browseAll} onChange={(e) => setBrowseAll(e.target.checked)} />
            All weeks
          </label>
          <button onClick={loadSchedules} disabled={isBusy} className="rounded-md border border-foreground/30 px-4 py-2 text-sm disabled:opacity-50">Load</button>
          <button onClick={saveAssignments} disabled={isBusy || !selectedScheduleID || !isDirty} className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">Save shift edits{isDirty ? ' *' : ''}</button>
          <button onClick={popUndo} disabled={undoStack.current.length === 0} className="rounded-md border border-foreground/30 px-3 py-2 text-sm disabled:opacity-50">Undo</button>
        </div>

        <p className="mt-3 text-sm text-foreground/70">{status}{isDirty ? ' (unsaved changes)' : ''}</p>
        {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <article className="rounded-xl border border-foreground/15 bg-background p-4">
          <h2 className="text-lg font-semibold">Generated schedules</h2>
          <div className="mt-3 max-h-[32rem] overflow-auto rounded-md border border-foreground/15">
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
                    onClick={() => selectSchedule(schedule.scheduleID)}
                  >
                    <td className="px-2 py-2">
                      <div className="text-xs font-mono">{schedule.weekStartDate || 'n/a'}</div>
                      <div className="text-[11px] text-foreground/60">{schedule.scheduleID.slice(0, 8)}</div>
                      <div className="text-[10px] text-foreground/40">{schedule.createdAt ? new Date(schedule.createdAt).toLocaleString() : ''}</div>
                    </td>
                    <td className="px-2 py-2">{Number(schedule.resultSummary?.assignmentCount || 0)}</td>
                  </tr>
                ))}
                {schedules.length === 0 ? (
                  <tr><td className="px-2 py-3 text-foreground/60" colSpan={2}>No schedules found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-foreground/15 bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Interactive shift table</h2>
              <p className="mt-1 text-sm text-foreground/70">Drag rows to reorder. Edit any cell inline. Add or remove rows as needed.</p>
            </div>
            <button onClick={addRow} disabled={!selectedScheduleID} className="rounded-md border border-foreground/30 px-3 py-1. text-sm disabled:opacity-50">+ Add row</button>
          </div>

          <div className="mt-3 max-h-[36rem] overflow-auto rounded-md border border-foreground/15">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/15 bg-foreground/5">
                  <th className="px-2 py-2 text-left">Week</th>
                  <th className="px-2 py-2 text-left">Day</th>
                  <th className="px-2 py-2 text-left">Start</th>
                  <th className="px-2 py-2 text-left">End</th>
                  <th className="px-2 py-2 text-left">Staff ID</th>
                  <th className="px-2 py-2 text-left">Staff name</th>
                  <th className="px-2 py-2 text-left">Room</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((shift, index) => (
                  <tr
                    key={`${shift.staffID || 'x'}-${index}`}
                    draggable
                    onDragStart={() => { pushUndo(); setDragIndex(index); }}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDragLeave={() => setDragOverIndex(null)}
                    onDrop={() => {
                      if (dragIndex === null || dragIndex === index) { setDragOverIndex(null); return; }
                      setAssignments((prev) => swap(prev, dragIndex, index));
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`border-b border-foreground/10 align-top transition-colors ${dragOverIndex === index ? 'bg-blue-100' : ''} ${shift.unfilled ? 'bg-amber-50' : ''}`}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min={1}
                        value={shift.week || 1}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, week: Number(e.target.value || 1) } : item)); }}
                        className="w-16 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={shift.day || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, day: e.target.value } : item)); }}
                        className="w-28 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="time"
                        value={shift.start || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, start: e.target.value } : item)); }}
                        className="w-24 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="time"
                        value={shift.end || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, end: e.target.value } : item)); }}
                        className="w-24 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={shift.staffID || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, staffID: e.target.value } : item)); }}
                        className="w-28 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={shift.staffName || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, staffName: e.target.value } : item)); }}
                        className="w-36 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={shift.roomName || ''}
                        onChange={(e) => { pushUndo(); setAssignments((prev) => prev.map((item, i) => i === index ? { ...item, roomName: e.target.value } : item)); }}
                        className="w-36 rounded border border-foreground/20 px-2 py-1"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <button onClick={() => deleteRow(index)} title="Delete row" className="rounded border border-red-400/50 px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50">&#x2715;</button>
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 ? (
                  <tr><td className="px-2 py-3 text-foreground/60" colSpan={8}>No assignments to edit.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </main>
  );
}
