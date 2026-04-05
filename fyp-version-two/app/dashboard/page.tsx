"use client";

import { useMemo, useState } from "react";

type LambdaAction = "generateSchedule" | "getConfig" | "upsertConfig" | "patchConfig";

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomID?: string;
  roomName?: string;
  staffID?: string;
  staffName?: string;
};

type StaffMember = {
  staffID: string;
  staffName: string;
  trainingLevel: number;
  holiday: string[];
  preferredShifts: string[];
  isOffice: boolean;
  hourlyRate: number;
};

type Room = {
  roomID: string;
  roomName: string;
  capacity: number;
  ageGroup: string;
  schedule: unknown[];
  isOffice: boolean;
};

type Settings = {
  planningWeeks: number;
  workDays: string[];
  dayStart: string;
  dayEnd: string;
  budget: number;
  maxShiftHours: number;
  assignmentStrategy: "optimised" | "greedy";
  persistResult: boolean;
};

type NurseryConfig = {
  rooms: Room[];
  staff: StaffMember[];
  settings: Settings;
  childrenCount: Record<string, number>;
};

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STAFF_PAGE_SIZE = 8;

const DEFAULT_CONFIG: NurseryConfig = {
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
    dayStart: "08:00",
    dayEnd: "14:00",
    budget: 12000,
    maxShiftHours: 8,
    assignmentStrategy: "optimised",
    persistResult: false
  },
  childrenCount: { "0-24": 3, "24-36": 4 }
};

export default function DashboardPage() {
  const [configID, setConfigID] = useState("default");
  const [config, setConfig] = useState<NurseryConfig>(DEFAULT_CONFIG);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [error, setError] = useState<string>("");
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [lastSchedule, setLastSchedule] = useState<{ assignments?: Assignment[]; staffHours?: Record<string, number> } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [staffSearch, setStaffSearch] = useState("");
  const [visibleStaffRows, setVisibleStaffRows] = useState(STAFF_PAGE_SIZE);

  const weekOptions = useMemo(() => {
    const values = new Set<number>();
    for (const item of lastSchedule?.assignments || []) {
      values.add(item.week || 1);
    }
    return [...values].sort((a, b) => a - b);
  }, [lastSchedule]);

  const assignmentIndex = useMemo(() => {
    // Group schedule entries by staff and day so the grid can render quickly.
    const map = new Map<string, Map<string, Assignment[]>>();
    for (const item of lastSchedule?.assignments || []) {
      if ((item.week || 1) !== selectedWeek) {
        continue;
      }
      const staffID = item.staffID || item.staffName || "unknown";
      const day = item.day || "Unknown";
      if (!map.has(staffID)) {
        map.set(staffID, new Map());
      }
      const dayMap = map.get(staffID)!;
      if (!dayMap.has(day)) {
        dayMap.set(day, []);
      }
      dayMap.get(day)!.push(item);
    }

    for (const dayMap of map.values()) {
      for (const assignments of dayMap.values()) {
        assignments.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")));
      }
    }

    return map;
  }, [lastSchedule, selectedWeek]);

  const activeDays = useMemo(() => {
    const chosen = config.settings.workDays || [];
    return [...chosen].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  }, [config.settings.workDays]);

  const filteredStaff = useMemo(() => {
    const term = staffSearch.trim().toLowerCase();
    const rows = config.staff || [];
    if (!term) {
      return rows;
    }
    return rows.filter((member) => member.staffName.toLowerCase().includes(term));
  }, [config.staff, staffSearch]);

  const visibleStaff = useMemo(() => filteredStaff.slice(0, visibleStaffRows), [filteredStaff, visibleStaffRows]);

  const staffHoursRows = useMemo(() => {
    const hours = lastSchedule?.staffHours || {};
    return Object.entries(hours).sort((a, b) => b[1] - a[1]);
  }, [lastSchedule]);

  function normaliseConfig(raw: unknown): NurseryConfig {
    const candidate = (raw || {}) as Partial<NurseryConfig>;
    return {
      rooms: Array.isArray(candidate.rooms) ? candidate.rooms as Room[] : DEFAULT_CONFIG.rooms,
      staff: Array.isArray(candidate.staff) ? candidate.staff as StaffMember[] : DEFAULT_CONFIG.staff,
      settings: {
        planningWeeks: Number(candidate.settings?.planningWeeks ?? DEFAULT_CONFIG.settings.planningWeeks),
        workDays: Array.isArray(candidate.settings?.workDays) ? candidate.settings!.workDays as string[] : DEFAULT_CONFIG.settings.workDays,
        dayStart: String(candidate.settings?.dayStart ?? DEFAULT_CONFIG.settings.dayStart),
        dayEnd: String(candidate.settings?.dayEnd ?? DEFAULT_CONFIG.settings.dayEnd),
        budget: Number(candidate.settings?.budget ?? DEFAULT_CONFIG.settings.budget),
        maxShiftHours: Number(candidate.settings?.maxShiftHours ?? DEFAULT_CONFIG.settings.maxShiftHours),
        assignmentStrategy: candidate.settings?.assignmentStrategy === "greedy" ? "greedy" : "optimised",
        persistResult: Boolean(candidate.settings?.persistResult ?? DEFAULT_CONFIG.settings.persistResult),
      },
      childrenCount: typeof candidate.childrenCount === "object" && candidate.childrenCount !== null
        ? Object.fromEntries(Object.entries(candidate.childrenCount).map(([k, v]) => [k, Number(v)]))
        : DEFAULT_CONFIG.childrenCount,
    };
  }

  function parseCsvList(value: string) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function isStaffOnLeave(member: StaffMember, day: string) {
    // Treat plain day names in holiday lists as leave markers for the rota grid.
    const target = day.toLowerCase();
    return (member.holiday || []).some((entry) => entry.trim().toLowerCase() === target);
  }

  function updateSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
    setConfig((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        [key]: value,
      },
    }));
  }

  function toggleWorkDay(day: string) {
    setConfig((prev) => {
      const hasDay = prev.settings.workDays.includes(day);
      const nextDays = hasDay
        ? prev.settings.workDays.filter((item) => item !== day)
        : [...prev.settings.workDays, day];
      return {
        ...prev,
        settings: {
          ...prev.settings,
          workDays: nextDays,
        },
      };
    });
  }

  function updateChildrenBucket(bucket: string, value: number) {
    setConfig((prev) => ({
      ...prev,
      childrenCount: {
        ...prev.childrenCount,
        [bucket]: Math.max(0, value),
      },
    }));
  }

  function updateStaff(index: number, patch: Partial<StaffMember>) {
    setConfig((prev) => {
      const staff = [...prev.staff];
      staff[index] = { ...staff[index], ...patch };
      return { ...prev, staff };
    });
  }

  function addStaffMember() {
    setConfig((prev) => ({
      ...prev,
      staff: [
        ...prev.staff,
        {
          staffID: `p${prev.staff.length + 1}`,
          staffName: "New staff",
          trainingLevel: 3,
          holiday: [],
          preferredShifts: [],
          isOffice: false,
          hourlyRate: 15,
        },
      ],
    }));
  }

  function removeStaffMember(index: number) {
    setConfig((prev) => ({
      ...prev,
      staff: prev.staff.filter((_, i) => i !== index),
    }));
  }

  function shiftCellContent(member: StaffMember, day: string) {
    const staffID = member.staffID;
    const byDay = assignmentIndex.get(staffID);
    const assignments = byDay?.get(day) || [];
    if (assignments.length > 0) {
      return assignments.map((item) => `${item.start || "--:--"}-${item.end || "--:--"} ${item.roomName || "Room"}`);
    }

    if (isStaffOnLeave(member, day)) {
      return ["On leave"];
    }

    return ["Off"];
  }

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
        setConfig(normaliseConfig(payload.config));
        setVisibleStaffRows(STAFF_PAGE_SIZE);
      }
      setStatusMessage(payload?.message || "Stored config loaded.");
    });
  }

  async function handleUpsertConfig() {
    await withAction("Saving full config...", async () => {
      const data = await callLambda("upsertConfig", { configID, ...config });
      const payload = data?.payload;
      setLastPayload(payload);
      if (payload?.config) {
        setConfig(normaliseConfig(payload.config));
      }
      setStatusMessage(payload?.message || "Config saved.");
    });
  }

  async function handleGenerateSchedule() {
    await withAction("Generating schedule...", async () => {
      const data = await callLambda("generateSchedule", { configID, ...config });
      const payload = data?.payload;
      setLastPayload(payload);
      setLastSchedule(payload?.result || null);
      const weeks = new Set<number>();
      for (const item of payload?.result?.assignments || []) {
        weeks.add(item.week || 1);
      }
      setSelectedWeek(weeks.size > 0 ? Math.min(...weeks) : 1);
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
          Update your nursery configuration with interactive controls, then generate a rota.
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
          <button onClick={handleGenerateSchedule} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Generate Schedule</button>
        </div>
        <p className="mt-3 text-sm text-foreground/70">{statusMessage}</p>
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-xl border border-foreground/15 p-4">
          <h2 className="text-xl font-semibold">Settings</h2>
          <p className="mt-1 text-sm text-foreground/65">Control working hours, strategy and planning behaviour.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Planning weeks
              <input type="number" min={1} className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.planningWeeks} onChange={(e) => updateSettings("planningWeeks", Math.max(1, Number(e.target.value || 1)))} />
            </label>
            <label className="text-sm">
              Budget
              <input type="number" min={0} className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.budget} onChange={(e) => updateSettings("budget", Math.max(0, Number(e.target.value || 0)))} />
            </label>
            <label className="text-sm">
              Day start
              <input type="time" className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.dayStart} onChange={(e) => updateSettings("dayStart", e.target.value)} />
            </label>
            <label className="text-sm">
              Day end
              <input type="time" className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.dayEnd} onChange={(e) => updateSettings("dayEnd", e.target.value)} />
            </label>
            <label className="text-sm">
              Max shift hours
              <input type="number" min={1} className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.maxShiftHours} onChange={(e) => updateSettings("maxShiftHours", Math.max(1, Number(e.target.value || 1)))} />
            </label>
            <label className="text-sm">
              Assignment strategy
              <select className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.assignmentStrategy} onChange={(e) => updateSettings("assignmentStrategy", e.target.value === "greedy" ? "greedy" : "optimised")}> 
                <option value="optimised">Optimised</option>
                <option value="greedy">Greedy</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input id="persist" type="checkbox" checked={config.settings.persistResult} onChange={(e) => updateSettings("persistResult", e.target.checked)} />
            <label htmlFor="persist" className="text-sm">Persist generated schedules to DynamoDB</label>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium">Work days</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAY_ORDER.map((day) => {
                const selected = config.settings.workDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkDay(day)}
                    className={`rounded-md border px-3 py-1 text-sm ${selected ? "border-foreground bg-foreground text-background" : "border-foreground/20"}`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium">Children count by age bucket</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {Object.entries(config.childrenCount).map(([bucket, value]) => (
                <label key={bucket} className="text-sm">
                  {bucket}
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1"
                    value={value}
                    onChange={(e) => updateChildrenBucket(bucket, Number(e.target.value || 0))}
                  />
                </label>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-foreground/15 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Staff editor</h2>
            <button type="button" onClick={addStaffMember} className="rounded-md border border-foreground/30 px-3 py-1 text-sm">Add staff</button>
          </div>
          <p className="mt-1 text-sm text-foreground/65">Edit staff directly without JSON.</p>
          <div className="mt-3 max-h-[36rem] overflow-auto rounded-md border border-foreground/15">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-foreground/20 bg-foreground/5">
                  <th className="px-2 py-2 text-left">Name</th>
                  <th className="px-2 py-2 text-left">ID</th>
                  <th className="px-2 py-2 text-left">Rate</th>
                  <th className="px-2 py-2 text-left">Office</th>
                  <th className="px-2 py-2 text-left">Holiday (comma list)</th>
                  <th className="px-2 py-2 text-left">Preferred shifts</th>
                  <th className="px-2 py-2 text-left"></th>
                </tr>
              </thead>
              <tbody>
                {config.staff.map((member, index) => (
                  <tr key={`${member.staffID}-${index}`} className="border-b border-foreground/10 align-top">
                    <td className="px-2 py-2"><input className="w-36 rounded border border-foreground/20 px-2 py-1" value={member.staffName} onChange={(e) => updateStaff(index, { staffName: e.target.value })} /></td>
                    <td className="px-2 py-2"><input className="w-24 rounded border border-foreground/20 px-2 py-1" value={member.staffID} onChange={(e) => updateStaff(index, { staffID: e.target.value })} /></td>
                    <td className="px-2 py-2"><input type="number" min={0} className="w-20 rounded border border-foreground/20 px-2 py-1" value={member.hourlyRate} onChange={(e) => updateStaff(index, { hourlyRate: Number(e.target.value || 0) })} /></td>
                    <td className="px-2 py-2"><input type="checkbox" checked={member.isOffice} onChange={(e) => updateStaff(index, { isOffice: e.target.checked })} /></td>
                    <td className="px-2 py-2"><input className="w-48 rounded border border-foreground/20 px-2 py-1" value={(member.holiday || []).join(", ")} onChange={(e) => updateStaff(index, { holiday: parseCsvList(e.target.value) })} /></td>
                    <td className="px-2 py-2"><input className="w-48 rounded border border-foreground/20 px-2 py-1" value={(member.preferredShifts || []).join(", ")} onChange={(e) => updateStaff(index, { preferredShifts: parseCsvList(e.target.value) })} /></td>
                    <td className="px-2 py-2"><button type="button" className="rounded border border-red-700/40 px-2 py-1 text-xs text-red-700" onClick={() => removeStaffMember(index)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="rounded-xl border border-foreground/15 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Staff rota by day</h2>
            <p className="mt-1 text-sm text-foreground/65">Rows are staff members and columns are selected days.</p>
          </div>
          <div>
            <label className="text-sm">
              Search staff name
              <input
                value={staffSearch}
                onChange={(e) => {
                  setStaffSearch(e.target.value);
                  setVisibleStaffRows(STAFF_PAGE_SIZE);
                }}
                placeholder="e.g. Alice"
                className="ml-2 rounded-md border border-foreground/20 bg-background px-2 py-1"
              />
            </label>
          </div>
          {weekOptions.length > 0 ? (
            <label className="text-sm">
              Week
              <select className="ml-2 rounded-md border border-foreground/20 bg-background px-2 py-1" value={selectedWeek} onChange={(e) => setSelectedWeek(Number(e.target.value))}>
                {weekOptions.map((week) => (
                  <option key={week} value={week}>Week {week}</option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/20">
                <th className="px-2 py-2 text-left">Staff</th>
                {activeDays.map((day) => (
                  <th key={day} className="px-2 py-2 text-left">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStaff.length === 0 ? (
                <tr>
                  <td className="px-2 py-3 text-foreground/60" colSpan={Math.max(activeDays.length + 1, 2)}>No staff match the current filter.</td>
                </tr>
              ) : (
                visibleStaff.map((member) => (
                  <tr key={member.staffID} className="border-b border-foreground/10 align-top">
                    <td className="px-2 py-2 font-medium">
                      <div>{member.staffName}</div>
                      <div className="text-xs text-foreground/60">{member.staffID}</div>
                    </td>
                    {activeDays.map((day) => {
                      const lines = shiftCellContent(member, day);
                      const isLeave = lines[0] === "On leave";
                      return (
                        <td key={`${member.staffID}-${day}`} className="min-w-44 px-2 py-2">
                          <div className={`space-y-1 text-xs ${isLeave ? "text-amber-700" : "text-foreground"}`}>
                            {lines.map((line, idx) => (
                              <div key={`${member.staffID}-${day}-${idx}`}>{line}</div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-md border border-foreground/30 px-3 py-1 text-sm disabled:opacity-40"
            disabled={visibleStaffRows >= filteredStaff.length}
            onClick={() => setVisibleStaffRows((prev) => prev + STAFF_PAGE_SIZE)}
          >
            Show more staff
          </button>
          <button
            type="button"
            className="rounded-md border border-foreground/30 px-3 py-1 text-sm disabled:opacity-40"
            disabled={visibleStaffRows <= STAFF_PAGE_SIZE}
            onClick={() => setVisibleStaffRows(STAFF_PAGE_SIZE)}
          >
            Reset rows
          </button>
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
