"use client";

import { useMemo, useState } from "react";

type LambdaAction = "generateSchedule" | "getConfig" | "upsertConfig" | "patchConfig";

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomName?: string;
  staffName?: string;
};

const DEFAULT_CONFIG = {
  rooms: [
    { roomID: "babies", roomName: "Babies", capacity: 12, ageGroup: "0-24", schedule: [], isOffice: false },
    { roomID: "toddlers", roomName: "Toddlers", capacity: 16, ageGroup: "24-36", schedule: [], isOffice: false },
    { roomID: "office", roomName: "Office", capacity: 2, ageGroup: "36+", schedule: [], isOffice: true }
  ],
  staff: [
    { staffID: "p1", staffName: "Alice", trainingLevel: 3, holiday: [], preferredShifts: ["Monday early"], isOffice: false, hourlyRate: 15 },
    { staffID: "p2", staffName: "Ben", trainingLevel: 3, holiday: [], preferredShifts: [], isOffice: false, hourlyRate: 14 },
    { staffID: "o1", staffName: "Claire", trainingLevel: 4, holiday: [], preferredShifts: [], isOffice: true, hourlyRate: 18 }
  ],
  settings: {
    planningWeeks: 1,
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    dayStart: "06:00",
    dayEnd: "18:00",
    budget: 12000,
    maxShiftHours: 8,
    assignmentStrategy: "optimised",
    persistResult: false
  },
  childrenCount: { "0-24": 9, "24-36": 14 }
};

const DEFAULT_PATCH = {
  setSetting: { budget: 12500 },
  setChildrenCount: { "24-36": 16 }
};

export default function DashboardPage() {
  const [configID, setConfigID] = useState("default");
  const [configJson, setConfigJson] = useState(JSON.stringify(DEFAULT_CONFIG, null, 2));
  const [patchJson, setPatchJson] = useState(JSON.stringify(DEFAULT_PATCH, null, 2));
  const [generateOverridesJson, setGenerateOverridesJson] = useState("{}");

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [error, setError] = useState<string>("");
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [lastSchedule, setLastSchedule] = useState<{ assignments?: Assignment[]; staffHours?: Record<string, number> } | null>(null);

  const assignmentRows = useMemo(() => {
    const assignments = lastSchedule?.assignments || [];
    return [...assignments].sort((a, b) => {
      const weekDiff = (a.week || 0) - (b.week || 0);
      if (weekDiff !== 0) return weekDiff;
      const day = String(a.day || "").localeCompare(String(b.day || ""));
      if (day !== 0) return day;
      return String(a.start || "").localeCompare(String(b.start || ""));
    });
  }, [lastSchedule]);

  const staffHoursRows = useMemo(() => {
    const hours = lastSchedule?.staffHours || {};
    return Object.entries(hours).sort((a, b) => b[1] - a[1]);
  }, [lastSchedule]);

  async function callLambda(action: LambdaAction, payload: unknown) {
    const response = await fetch("/api/lambda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });

    const data = await response.json();
    if (!response.ok) {
      const message = data?.payload?.error || data?.payload?.message || data?.message || "Request failed";
      throw new Error(message);
    }
    return data;
  }

  async function handleGetConfig() {
    await withAction("Loading stored config...", async () => {
      const data = await callLambda("getConfig", { configID });
      const payload = data?.payload;
      setLastPayload(payload);
      if (payload?.config) {
        setConfigJson(JSON.stringify(payload.config, null, 2));
      }
      setStatusMessage(payload?.message || "Stored config loaded.");
    });
  }

  async function handleUpsertConfig() {
    await withAction("Saving full config...", async () => {
      const parsed = JSON.parse(configJson);
      const data = await callLambda("upsertConfig", { configID, ...parsed });
      const payload = data?.payload;
      setLastPayload(payload);
      if (payload?.config) {
        setConfigJson(JSON.stringify(payload.config, null, 2));
      }
      setStatusMessage(payload?.message || "Config saved.");
    });
  }

  async function handlePatchConfig() {
    await withAction("Applying config patch...", async () => {
      const parsedPatch = JSON.parse(patchJson);
      const data = await callLambda("patchConfig", { configID, ...parsedPatch });
      const payload = data?.payload;
      setLastPayload(payload);
      if (payload?.config) {
        setConfigJson(JSON.stringify(payload.config, null, 2));
      }
      setStatusMessage(payload?.message || "Config patched.");
    });
  }

  async function handleGenerateSchedule() {
    await withAction("Generating schedule...", async () => {
      const overrides = JSON.parse(generateOverridesJson || "{}");
      const data = await callLambda("generateSchedule", { configID, ...overrides });
      const payload = data?.payload;
      setLastPayload(payload);
      setLastSchedule(payload?.result || null);
      setStatusMessage(payload?.message || "Schedule generated.");
    });
  }

  async function withAction(loadingText: string, fn: () => Promise<void>) {
    setError("");
    setIsLoading(true);
    setStatusMessage(loadingText);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <section className="rounded-xl border border-foreground/15 bg-background p-6">
        <h1 className="text-3xl font-bold">Nursery Scheduler Dashboard</h1>
        <p className="mt-2 text-foreground/70">
          Use AWS Lambda over SDK via your EC2-hosted Next.js backend to manage config and generate rotas.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[220px_1fr] items-center">
          <label htmlFor="configID" className="font-medium">Config ID</label>
          <input
            id="configID"
            value={configID}
            onChange={(e) => setConfigID(e.target.value)}
            className="rounded-md border border-foreground/20 bg-background px-3 py-2"
            placeholder="default"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handleGetConfig} disabled={isLoading} className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50">Load Config</button>
          <button onClick={handleUpsertConfig} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Save Full Config</button>
          <button onClick={handlePatchConfig} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Patch Config</button>
          <button onClick={handleGenerateSchedule} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Generate Schedule</button>
        </div>
        <p className="mt-3 text-sm text-foreground/70">{statusMessage}</p>
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-foreground/15 p-4">
          <h2 className="text-xl font-semibold">Full Config JSON</h2>
          <p className="mt-1 text-sm text-foreground/65">Used for create/replace configuration.</p>
          <textarea
            className="mt-3 h-96 w-full rounded-md border border-foreground/20 bg-background p-3 font-mono text-sm"
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
          />
        </article>

        <article className="rounded-xl border border-foreground/15 p-4 space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Patch JSON</h2>
            <p className="mt-1 text-sm text-foreground/65">Used for targeted updates like room/staff/settings changes.</p>
            <textarea
              className="mt-3 h-40 w-full rounded-md border border-foreground/20 bg-background p-3 font-mono text-sm"
              value={patchJson}
              onChange={(e) => setPatchJson(e.target.value)}
            />
          </div>

          <div>
            <h2 className="text-xl font-semibold">Generate Overrides JSON</h2>
            <p className="mt-1 text-sm text-foreground/65">Optional one-off overrides for generation call only.</p>
            <textarea
              className="mt-3 h-40 w-full rounded-md border border-foreground/20 bg-background p-3 font-mono text-sm"
              value={generateOverridesJson}
              onChange={(e) => setGenerateOverridesJson(e.target.value)}
            />
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-foreground/15 p-4">
        <h2 className="text-xl font-semibold">Generated Schedule</h2>
        <p className="mt-1 text-sm text-foreground/65">Human-readable rota grouped as assignment rows.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/20">
                <th className="px-2 py-2 text-left">Week</th>
                <th className="px-2 py-2 text-left">Day</th>
                <th className="px-2 py-2 text-left">Time</th>
                <th className="px-2 py-2 text-left">Room</th>
                <th className="px-2 py-2 text-left">Staff</th>
              </tr>
            </thead>
            <tbody>
              {assignmentRows.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-foreground/60" colSpan={5}>No schedule generated yet.</td>
                </tr>
              ) : (
                assignmentRows.map((row, index) => (
                  <tr key={`${row.week}-${row.day}-${row.start}-${row.roomName}-${row.staffName}-${index}`} className="border-b border-foreground/10">
                    <td className="px-2 py-2">{row.week ?? "-"}</td>
                    <td className="px-2 py-2">{row.day ?? "-"}</td>
                    <td className="px-2 py-2">{row.start ?? "--:--"} - {row.end ?? "--:--"}</td>
                    <td className="px-2 py-2">{row.roomName ?? "-"}</td>
                    <td className="px-2 py-2">{row.staffName ?? "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-xl border border-foreground/15 p-4">
          <h2 className="text-xl font-semibold">Staff Hours</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/20">
                  <th className="px-2 py-2 text-left">Staff ID</th>
                  <th className="px-2 py-2 text-left">Hours</th>
                </tr>
              </thead>
              <tbody>
                {staffHoursRows.length === 0 ? (
                  <tr><td className="px-2 py-2 text-foreground/60" colSpan={2}>No data</td></tr>
                ) : (
                  staffHoursRows.map(([staffID, hours]) => (
                    <tr key={staffID} className="border-b border-foreground/10">
                      <td className="px-2 py-2">{staffID}</td>
                      <td className="px-2 py-2">{hours}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-foreground/15 p-4">
          <h2 className="text-xl font-semibold">Last Lambda Response</h2>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-foreground/20 bg-background p-3 text-xs">
            {JSON.stringify(lastPayload, null, 2)}
          </pre>
        </article>
      </section>
    </main>
  );
}
