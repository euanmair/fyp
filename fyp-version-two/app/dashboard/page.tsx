"use client";

import { useEffect, useMemo, useState } from "react";

type LambdaAction = "generateSchedule" | "getConfig" | "upsertConfig" | "patchConfig";

const REQUIRED_AGE_BUCKETS = ["0-24", "24-36", "36+"] as const;

type Assignment = {
  week?: number;
  day?: string;
  start?: string;
  end?: string;
  roomID?: string;
  roomName?: string;
  staffID?: string;
  staffName?: string;
  ageGroup?: string;
  legalRatio?: string;
  unfilled?: boolean;
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
  weekStartDate: string;
  workDays: string[];
  dayStart: string;
  dayEnd: string;
  budget: number;
  maxShiftHours: number;
  persistResult: boolean;
  forceGenerate: boolean;
};

type NurseryConfig = {
  rooms: Room[];
  staff: StaffMember[];
  settings: Settings;
  childrenCount: Record<string, number>;
};

type ShortageSummary = {
  daySegments?: number;
  practitionerRequiredPerSegment?: number;
  officeRequiredPerSegment?: number;
  totalRequiredPerSegment?: number;
  peakAvailablePractitionersPerSegment?: number;
  peakAvailableOfficePerSegment?: number;
  peakAvailableTotalPerSegment?: number;
  totalAdditionalStaffNeeded?: number;
  totalMissingPersonSlots?: number;
  additionalPractitionersNeeded?: number;
  additionalOfficeNeeded?: number;
};

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STAFF_PAGE_SIZE = 8;

const DEFAULT_CONFIG: NurseryConfig = {
  rooms: [
    { roomID: "babies-0-24", roomName: "Babies 0-24 months", capacity: 12, ageGroup: "0-24", schedule: [], isOffice: false },
    { roomID: "toddlers-24-36", roomName: "Toddlers 24-36 months", capacity: 16, ageGroup: "24-36", schedule: [], isOffice: false },
    { roomID: "preschool-36-plus", roomName: "Preschool 36+ months", capacity: 18, ageGroup: "36+", schedule: [], isOffice: false },
    { roomID: "office", roomName: "Office", capacity: 2, ageGroup: "36+", schedule: [], isOffice: true }
  ],
  staff: [
    { staffID: "p1", staffName: "Alice", trainingLevel: 3, holiday: [], preferredShifts: ["Monday early"], isOffice: false, hourlyRate: 15 },
    { staffID: "p2", staffName: "Ben", trainingLevel: 3, holiday: [], preferredShifts: [], isOffice: false, hourlyRate: 14 },
    { staffID: "o1", staffName: "Claire", trainingLevel: 4, holiday: [], preferredShifts: [], isOffice: true, hourlyRate: 18 }
  ],
  settings: {
    planningWeeks: 1,
    weekStartDate: new Date().toISOString().slice(0, 10),
    workDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    dayStart: "08:00",
    dayEnd: "14:00",
    budget: 12000,
    maxShiftHours: 8,
    persistResult: true,
    forceGenerate: false,
  },
  childrenCount: { "0-24": 6, "24-36": 4, "36+": 5 }
};

export default function DashboardPage() {
  const [configID, setConfigID] = useState("default");
  const [availableConfigs, setAvailableConfigs] = useState<string[]>([]);
  const [newConfigName, setNewConfigName] = useState("");
  const [config, setConfig] = useState<NurseryConfig>(DEFAULT_CONFIG);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready.");
  const [error, setError] = useState<string>("");
  const [shortageMessage, setShortageMessage] = useState<string>("");
  const [lastPayload, setLastPayload] = useState<unknown>(null);
  const [lastSchedule, setLastSchedule] = useState<{ assignments?: Assignment[]; staffHours?: Record<string, number> } | null>(null);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [staffSearch, setStaffSearch] = useState("");
  const [visibleStaffRows, setVisibleStaffRows] = useState(STAFF_PAGE_SIZE);

  function refreshConfigs() {
    fetch("/api/configs")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.configIDs)) {
          setAvailableConfigs(data.configIDs);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    fetch("/api/configs")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.configIDs)) {
          setAvailableConfigs(data.configIDs);
          if (data.configIDs.length > 0 && !data.configIDs.includes(configID)) {
            setConfigID(data.configIDs[0]);
          }
        }
      })
      .catch(() => { /* ignore – user can still type manually */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureRequiredRooms(rooms: Room[]) {
    const baselineByBucket: Record<string, Room> = {
      "0-24": { roomID: "babies-0-24", roomName: "Babies 0-24 months", capacity: 12, ageGroup: "0-24", schedule: [], isOffice: false },
      "24-36": { roomID: "toddlers-24-36", roomName: "Toddlers 24-36 months", capacity: 16, ageGroup: "24-36", schedule: [], isOffice: false },
      "36+": { roomID: "preschool-36-plus", roomName: "Preschool 36+ months", capacity: 18, ageGroup: "36+", schedule: [], isOffice: false },
    };

    const nonOffice = rooms.filter((room) => !room.isOffice);
    const office = rooms.filter((room) => room.isOffice);
    const next: Room[] = [];

    for (const bucket of REQUIRED_AGE_BUCKETS) {
      const existing = nonOffice.find((room) => room.ageGroup === bucket);
      next.push(existing ?? baselineByBucket[bucket]);
    }

    return [...next, ...office];
  }

  async function addNewConfig() {
    const name = newConfigName.trim();
    if (!name) return;

    setError("");

    if (availableConfigs.includes(name)) {
      setConfigID(name);
      setNewConfigName("");
      return;
    }

    setIsLoading(true);
    setStatusMessage(`Creating config "${name}"...`);
    try {
      await callLambda("upsertConfig", { configID: name, ...config });
      setAvailableConfigs((prev) => [...prev, name].sort());
      setConfigID(name);
      setNewConfigName("");
      setStatusMessage(`Config "${name}" saved.`);
      refreshConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create config");
      setStatusMessage("Unable to create config.");
    } finally {
      setIsLoading(false);
    }
  }

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
    const incomingChildrenCount = typeof candidate.childrenCount === "object" && candidate.childrenCount !== null
      ? candidate.childrenCount
      : {};
    const requiredChildrenCount = Object.fromEntries(
      REQUIRED_AGE_BUCKETS.map((bucket) => [bucket, Number(incomingChildrenCount[bucket] ?? DEFAULT_CONFIG.childrenCount[bucket] ?? 0)])
    ) as Record<string, number>;

    const candidateRooms = Array.isArray(candidate.rooms) ? candidate.rooms as Room[] : DEFAULT_CONFIG.rooms;

    return {
      rooms: ensureRequiredRooms(candidateRooms),
      staff: Array.isArray(candidate.staff) ? candidate.staff as StaffMember[] : DEFAULT_CONFIG.staff,
      settings: {
        planningWeeks: Number(candidate.settings?.planningWeeks ?? DEFAULT_CONFIG.settings.planningWeeks),
        weekStartDate: String(candidate.settings?.weekStartDate ?? DEFAULT_CONFIG.settings.weekStartDate),
        workDays: Array.isArray(candidate.settings?.workDays) ? candidate.settings!.workDays as string[] : DEFAULT_CONFIG.settings.workDays,
        dayStart: String(candidate.settings?.dayStart ?? DEFAULT_CONFIG.settings.dayStart),
        dayEnd: String(candidate.settings?.dayEnd ?? DEFAULT_CONFIG.settings.dayEnd),
        budget: Number(candidate.settings?.budget ?? DEFAULT_CONFIG.settings.budget),
        maxShiftHours: Number(candidate.settings?.maxShiftHours ?? DEFAULT_CONFIG.settings.maxShiftHours),
        persistResult: Boolean(candidate.settings?.persistResult ?? DEFAULT_CONFIG.settings.persistResult),
        forceGenerate: Boolean(candidate.settings?.forceGenerate ?? DEFAULT_CONFIG.settings.forceGenerate),
      },
      childrenCount: requiredChildrenCount,
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
      const err = new Error(message) as Error & { shortage?: ShortageSummary };
      err.shortage = data?.payload?.shortage || data?.shortage;
      throw err;
    }
    return data;
  }

  function formatShortageMessage(shortage?: ShortageSummary | null) {
    if (!shortage || (shortage.totalAdditionalStaffNeeded || 0) <= 0) {
      return "";
    }

    const requiredPractitioners = shortage.practitionerRequiredPerSegment || 0;
    const requiredOffice = shortage.officeRequiredPerSegment || 0;
    const totalRequired = shortage.totalRequiredPerSegment || (requiredPractitioners + requiredOffice);
    const availablePractitioners = shortage.peakAvailablePractitionersPerSegment ?? 0;
    const availableOffice = shortage.peakAvailableOfficePerSegment ?? 0;
    const totalAvailable = shortage.peakAvailableTotalPerSegment ?? (availablePractitioners + availableOffice);
    const additionalTotal = shortage.totalAdditionalStaffNeeded || 0;
    const additionalPractitioners = shortage.additionalPractitionersNeeded || 0;
    const additionalOffice = shortage.additionalOfficeNeeded || 0;
    const missingSlots = shortage.totalMissingPersonSlots || 0;
    const segments = shortage.daySegments || 1;

    return `Need ${totalRequired} staff per segment (${requiredPractitioners} practitioners + ${requiredOffice} office), but only ${totalAvailable} available at peak (${availablePractitioners} practitioners + ${availableOffice} office). Additional hires needed: ${additionalTotal} (${additionalPractitioners} practitioners + ${additionalOffice} office). Missing person-slots across rota: ${missingSlots} over ${segments} segment(s) per day.`;
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
      refreshConfigs();
    });
  }

  async function handleGenerateSchedule() {
    await withAction("Generating schedule...", async () => {
      const data = await callLambda("generateSchedule", { configID, ...config });
      const payload = data?.payload;
      setLastPayload(payload);
      setShortageMessage(formatShortageMessage(payload?.shortage));
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
    setShortageMessage("");
    setIsLoading(true);
    setStatusMessage(loadingText);
    try {
      await fn();
    } catch (err) {
      if (err && typeof err === "object" && "shortage" in err) {
        const shortage = (err as { shortage?: ShortageSummary }).shortage;
        setShortageMessage(formatShortageMessage(shortage));
      }
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
          <div className="flex gap-2 flex-wrap">
            <select
              id="configID"
              value={configID}
              onChange={(e) => setConfigID(e.target.value)}
              className="rounded-md border border-foreground/20 bg-background px-3 py-2"
            >
              {availableConfigs.length === 0 && <option value={configID}>{configID}</option>}
              {availableConfigs.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <input
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addNewConfig(); }}
              placeholder="New config name"
              className="rounded-md border border-foreground/20 bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addNewConfig}
              disabled={isLoading || !newConfigName.trim()}
              className="rounded-md border border-foreground/30 px-3 py-2 text-sm disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={handleGetConfig} disabled={isLoading} className="rounded-md bg-foreground px-4 py-2 text-background disabled:opacity-50">Load Config</button>
          <button onClick={handleUpsertConfig} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Save Full Config</button>
          <button onClick={handleGenerateSchedule} disabled={isLoading} className="rounded-md border border-foreground/30 px-4 py-2 disabled:opacity-50">Generate Schedule</button>
          <a href="/dashboard/history" className="rounded-md border border-foreground/30 px-4 py-2 text-sm">Open History and Shift Editor</a>
        </div>
        <p className="mt-3 text-sm text-foreground/70">{statusMessage}</p>
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
        {shortageMessage ? <p className="mt-1 text-sm text-amber-700">{shortageMessage}</p> : null}
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
              Week start date
              <input type="date" className="mt-1 w-full rounded-md border border-foreground/20 bg-background px-2 py-1" value={config.settings.weekStartDate} onChange={(e) => updateSettings("weekStartDate", e.target.value)} />
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
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input id="persist" type="checkbox" checked={config.settings.persistResult} onChange={(e) => updateSettings("persistResult", e.target.checked)} />
            <label htmlFor="persist" className="text-sm">Persist generated schedules to DynamoDB</label>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input id="forceGenerate" type="checkbox" checked={config.settings.forceGenerate} onChange={(e) => updateSettings("forceGenerate", e.target.checked)} />
            <label htmlFor="forceGenerate" className="text-sm">Force generation if staffing is short (creates unfilled shifts)</label>
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
