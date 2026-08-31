import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { PowerActionTicket } from "../../shared/desktop";

export class SystemActionService {
  private readonly tickets = new Map<string, PowerActionTicket>();

  openRecycleBin(): void {
    const child = spawn("explorer.exe", ["shell:RecycleBinFolder"], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }

  requestPowerAction(action: "shutdown" | "restart"): PowerActionTicket {
    const ticket: PowerActionTicket = {
      token: randomUUID(),
      action,
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    };
    this.tickets.set(ticket.token, ticket);
    setTimeout(() => this.tickets.delete(ticket.token), 31_000).unref();
    return ticket;
  }

  confirmPowerAction(token: string): void {
    const ticket = this.tickets.get(token);
    this.tickets.delete(token);
    if (!ticket || new Date(ticket.expiresAt).getTime() < Date.now()) throw new Error("电源操作确认已过期");
    const args = ticket.action === "restart" ? ["/r", "/t", "0"] : ["/s", "/t", "0"];
    const child = spawn("shutdown.exe", args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  }
}
