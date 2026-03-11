"use client";

import { FormEvent, useState } from "react";

type ScheduleInput = {
  rooms: number;
  childrenPerRoom: number;
  holidayDates: string[];
  staffRatio: number;
  accountingDaysPerWeek: number;
};

type ScheduleOutput = {
  totalChildren: number;
  neededStaff: number;
  perRoom: Array<{ room: number; children: number; staff: number }>;
  holidays: string[];
  warnings: string[];
};

export default function Home() {
  const [input, setInput] = useState<ScheduleInput>({
    rooms: 3,
    childrenPerRoom: 12,
    holidayDates: ["2026-04-10", "2026-05-01"],
    staffRatio: 1 / 4,
    accountingDaysPerWeek: 5,
  });
  const [out, setOut] = useState<ScheduleOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendSchedule = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setOut(null);

    try {
      const body = {
        rooms: Number(input.rooms),
        childrenPerRoom: Number(input.childrenPerRoom),
        holidayDates: input.holidayDates.filter((d) => d.trim() !== ""),
        staffRatio: Number(input.staffRatio),
        accountingDaysPerWeek: Number(input.accountingDaysPerWeek),
      };

      const response = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`API failed: ${response.statusText}`);
      }

      const data: ScheduleOutput = await response.json();
      setOut(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-2xl font-bold">Early-Years Staff Scheduler</h1>
        <p className="mt-2 text-sm text-slate-600">Serverless CloudFlaIR + AWS Lambda + S3 + Terraform</p>

        <form onSubmit={sendSchedule} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            Rooms
            <input className="input" type="number" min={1} value={input.rooms} onChange={(e) => setInput((s) => ({ ...s, rooms: Number(e.target.value) }))} />
          </label>
          <label className="flex flex-col gap-1">
            Children per room
            <input className="input" type="number" min={1} value={input.childrenPerRoom} onChange={(e) => setInput((s) => ({ ...s, childrenPerRoom: Number(e.target.value) }))} />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            Holiday dates (comma-separated YYYY-MM-DD)
            <input
              className="input"
              value={input.holidayDates.join(",")}
              onChange={(e) => setInput((s) => ({ ...s, holidayDates: e.target.value.split(",").map((d) => d.trim()) }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            Staff ratio (1 staff per n children)
            <input className="input" type="number" min={1} value={1 / input.staffRatio} onChange={(e) => setInput((s) => ({ ...s, staffRatio: 1 / Number(e.target.value) }))} />
          </label>
          <label className="flex flex-col gap-1">
            Account days per week
            <input className="input" type="number" min={1} max={7} value={input.accountingDaysPerWeek} onChange={(e) => setInput((s) => ({ ...s, accountingDaysPerWeek: Number(e.target.value) }))} />
          </label>

          <button className="btn sm:col-span-2" type="submit" disabled={loading}>
            {loading ? "Calculating..." : "Generate Schedule"}
          </button>
        </form>

        {error && <p className="mt-4 rounded border border-red-300 bg-red-100 px-3 py-2 text-red-700">{error}</p>}

        {out && (
          <section className="mt-6 space-y-4">
            <div className="round">
              <h2 className="font-semibold">Summary</h2>
              <p>Total children: {out.totalChildren}</p>
              <p>Required staff: {out.neededStaff}</p>
              <p>Holiday days: {out.holidays.length}</p>
            </div>

            <div className="round">
              <h2 className="font-semibold">Rooms</h2>
              <ul>
                {out.perRoom.map((r) => (
                  <li key={r.room}>
                    Room {r.room}: {r.children} children - {r.staff} staff
                  </li>
                ))}
              </ul>
            </div>

            {out.warnings.length > 0 && (
              <div className="round border-yellow-200 bg-yellow-50 p-4">
                <h3 className="font-medium">Warnings</h3>
                <ul>
                  {out.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>

      <style jsx>{`
        .input {
          border-radius: 0.5rem;
          border: 1px solid #cbd5e1;
          padding: 0.6rem;
        }
        .btn {
          background: #2563eb;
          color: white;
          border-radius: 0.5rem;
          border: none;
          padding: 0.8rem 1rem;
          cursor: pointer;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .round {
          border: 1px solid #e2e8f0;
          border-radius: 0.75rem;
          padding: 1rem;
          background: #f8fafc;
        }
      `}</style>
    </div>
  );
}
