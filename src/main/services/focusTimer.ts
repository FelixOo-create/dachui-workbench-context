import { Notification } from "electron";
import type { FocusTimerState } from "../../shared/desktop";
import type { ScheduleService } from "./schedule";
import { randomUUID } from "node:crypto";

type Listener = (state: FocusTimerState) => void;

export class FocusTimerService {
  private readonly schedule: ScheduleService | null;
  private sessionId: string | null = null;
  private activityId: string | null = null;
  private categoryId: string | null = null;
  private plannedSeconds = 25 * 60;
  private sessionFinalized = false;
  private state: FocusTimerState = {
    phase: "idle",
    durationSeconds: 25 * 60,
    remainingSeconds: 25 * 60,
    endsAt: null,
    updatedAt: new Date().toISOString(),
    segments: [],
    sessionId: null,
    activityId: null,
    categoryId: null,
    plannedSeconds: 25 * 60,
  };
  private timer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(schedule: ScheduleService | null = null) {
    this.schedule = schedule;
  }

  get(): FocusTimerState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(durationSeconds: number, metadata?: { activityId?: string | null; categoryId?: string | null }): FocusTimerState {
    const safeDuration = Number.isFinite(durationSeconds) ? Math.min(4 * 60 * 60, Math.max(60, Math.round(durationSeconds))) : 25 * 60;
    const remaining = this.state.phase === "paused" && this.state.remainingSeconds > 0
      ? this.state.remainingSeconds
      : safeDuration;
    const now = new Date().toISOString();
    if (this.state.phase !== "paused") {
      this.sessionId = randomUUID();
      this.sessionFinalized = false;
      this.activityId = metadata?.activityId ?? null;
      this.categoryId = metadata?.categoryId ?? null;
      this.plannedSeconds = safeDuration;
      if (this.schedule && (this.activityId || this.categoryId)) this.schedule.startFocusSession({ id: this.sessionId, activityId: this.activityId, categoryId: this.categoryId, plannedSeconds: safeDuration, startedAt: now });
    }
    const segments = this.state.phase === "paused" ? this.state.segments : [];
    this.state = {
      phase: "focus",
      durationSeconds: safeDuration,
      remainingSeconds: remaining,
      endsAt: new Date(Date.now() + remaining * 1000).toISOString(),
      updatedAt: now,
      segments: [...segments, { startAt: now, endAt: null }],
      sessionId: this.sessionId,
      activityId: this.activityId,
      categoryId: this.categoryId,
      plannedSeconds: this.plannedSeconds,
    };
    this.ensureTicking();
    this.emit();
    return this.get();
  }

  pause(): FocusTimerState {
    if (this.state.phase !== "focus" || !this.state.endsAt) return this.get();
    const remainingSeconds = Math.max(0, Math.ceil((new Date(this.state.endsAt).getTime() - Date.now()) / 1000));
    const now = new Date().toISOString();
    const segments = this.state.segments.map((segment, index) => index === this.state.segments.length - 1 && !segment.endAt ? { ...segment, endAt: now } : segment);
    this.state = { ...this.state, phase: "paused", remainingSeconds, endsAt: null, updatedAt: now, segments };
    this.stopTicking();
    this.emit();
    return this.get();
  }

  reset(): FocusTimerState {
    this.stopTicking();
    if (this.sessionId && this.schedule) this.schedule.cancelFocusSession(this.sessionId, new Date().toISOString());
    this.sessionId = null;
    this.activityId = null;
    this.categoryId = null;
    this.state = {
      phase: "idle",
      durationSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      endsAt: null,
      updatedAt: new Date().toISOString(),
      segments: [],
      sessionId: null,
      activityId: null,
      categoryId: null,
      plannedSeconds: 25 * 60,
    };
    this.emit();
    return this.get();
  }

  finish(status: "completed" | "saved"): FocusTimerState {
    if (this.sessionFinalized) return this.get();
    if (this.state.phase === "focus") this.pause();
    if (this.sessionId && this.schedule && this.state.segments.length > 0) {
      const segments = this.state.segments.filter((segment): segment is { startAt: string; endAt: string } => Boolean(segment.endAt));
      if (segments.length > 0 && (this.activityId || this.categoryId)) {
        try { this.schedule.finishFocusSession({ id: this.sessionId, status, segments, endedAt: new Date().toISOString() }); }
        catch (error) { this.state = { ...this.state, message: `保存番茄记录失败：${String((error as Error)?.message ?? error)}` }; this.emit(); return this.get(); }
      }
    }
    this.sessionFinalized = true;
    this.state = { ...this.state, phase: "idle", endsAt: null, updatedAt: new Date().toISOString() };
    this.stopTicking();
    this.emit();
    return this.get();
  }

  dispose(): void {
    this.stopTicking();
    this.listeners.clear();
  }

  private ensureTicking(): void {
    this.stopTicking();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.state.phase !== "focus" || !this.state.endsAt) return;
    const remainingSeconds = Math.max(0, Math.ceil((new Date(this.state.endsAt).getTime() - Date.now()) / 1000));
    const now = new Date().toISOString();
    this.state = { ...this.state, remainingSeconds, updatedAt: now };
    if (remainingSeconds === 0) {
      this.stopTicking();
      const segments = this.state.segments.map((segment, index) => index === this.state.segments.length - 1 && !segment.endAt ? { ...segment, endAt: now } : segment);
      this.state = { ...this.state, phase: "idle", endsAt: null, segments, updatedAt: now };
      if (this.sessionId && this.schedule && (this.activityId || this.categoryId)) {
        const valid = segments.filter((segment): segment is { startAt: string; endAt: string } => Boolean(segment.endAt));
        if (valid.length > 0) {
          try { this.schedule.finishFocusSession({ id: this.sessionId, status: "completed", segments: valid, endedAt: now }); this.sessionFinalized = true; }
          catch (error) { this.state = { ...this.state, message: `保存番茄记录失败：${String((error as Error)?.message ?? error)}` }; }
        }
      }
      if (Notification.isSupported()) new Notification({ title: "专注结束", body: "这一段专注已经完成，起来活动一下吧。" }).show();
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) listener(snapshot);
  }
}
