import { describe, expect, it } from 'vitest';

import type { McpStatus } from '@shared/mcp';

import { McpServerManager, type McpChild, type SpawnArgs } from '../mcp-manager';

class FakeChild implements McpChild {
  private lineHandlers: ((line: string) => void)[] = [];
  private exitHandlers: ((info: { code: number | null; expected: boolean }) => void)[] = [];
  killed = false;
  /** Lines written back to the child's stdin (the app→child reply channel). */
  sent: string[] = [];

  onStdoutLine(handler: (line: string) => void): void {
    this.lineHandlers.push(handler);
  }
  onExit(handler: (info: { code: number | null; expected: boolean }) => void): void {
    this.exitHandlers.push(handler);
  }
  send(line: string): void {
    this.sent.push(line);
  }
  kill(): void {
    if (this.killed) return;
    this.killed = true;
    this.emitExit(0);
  }
  emitLine(line: string): void {
    for (const h of [...this.lineHandlers]) h(line);
  }
  emitExit(code: number | null): void {
    for (const h of [...this.exitHandlers]) h({ code, expected: this.killed });
  }
}

/** A spawn that auto-reports a URL derived from the requested port. */
function autoSpawn() {
  const children: FakeChild[] = [];
  const argsLog: SpawnArgs[] = [];
  const spawn = (args: SpawnArgs): McpChild => {
    const child = new FakeChild();
    children.push(child);
    argsLog.push(args);
    setTimeout(() => {
      child.emitLine(`WORKFLOW_MCP_LISTENING http://127.0.0.1:${args.port || 4000}/mcp?token=${args.token}`);
    }, 0);
    return child;
  };
  return { spawn, children, argsLog };
}

function manualSpawn() {
  const children: FakeChild[] = [];
  const spawn = (): McpChild => {
    const child = new FakeChild();
    children.push(child);
    return child;
  };
  return { spawn, children };
}

describe('McpServerManager', () => {
  it('starts and reports a running URL and bound port', async () => {
    const { spawn, argsLog } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 5123, generateToken: () => 'tok' });
    const status = await m.start();
    expect(status.state).toBe('running');
    expect(status.url).toBe('http://127.0.0.1:5123/mcp?token=tok');
    expect(status.port).toBe(5123);
    expect(argsLog[0]).toEqual({ port: 5123, token: 'tok', tls: false, appBridge: false });
  });

  it('fails with an error status when the child never reports a URL', async () => {
    const { spawn, children } = manualSpawn();
    const m = new McpServerManager({ spawn, initialPort: 0, generateToken: () => 't', readyTimeoutMs: 20 });
    const status = await m.start();
    expect(status.state).toBe('error');
    expect(status.error).toMatch(/timed out/i);
    expect(children[0]!.killed).toBe(true);
  });

  it('stops a running server and kills the child', async () => {
    const { spawn, children } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 4000, generateToken: () => 't' });
    await m.start();
    const status = await m.stop();
    expect(status.state).toBe('stopped');
    expect(status.url).toBeNull();
    expect(children[0]!.killed).toBe(true);
  });

  it('surfaces an unexpected crash as an error', async () => {
    const { spawn, children } = autoSpawn();
    const events: McpStatus[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      generateToken: () => 't',
      onStatusChanged: (s) => events.push(s),
    });
    await m.start();
    children[0]!.emitExit(1); // crash (not killed)
    expect(m.status().state).toBe('error');
    expect(m.status().error).toMatch(/exited unexpectedly/i);
    expect(events.some((e) => e.state === 'error')).toBe(true);
  });

  it('restarts on a port change while running', async () => {
    const { spawn, argsLog } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 4000, generateToken: () => 't' });
    await m.start();
    const status = await m.setPort(6001);
    expect(status.state).toBe('running');
    expect(status.port).toBe(6001);
    expect(argsLog).toHaveLength(2);
    expect(argsLog[1]!.port).toBe(6001);
  });

  it('just persists the port when stopped (no spawn)', async () => {
    const { spawn, children } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 4000, generateToken: () => 't' });
    const status = await m.setPort(7000);
    expect(status.state).toBe('stopped');
    expect(status.configuredPort).toBe(7000);
    expect(children).toHaveLength(0);
  });

  it('emits starting → running status transitions', async () => {
    const { spawn } = autoSpawn();
    const events: McpStatus[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      generateToken: () => 't',
      onStatusChanged: (s) => events.push(s),
    });
    await m.start();
    const states = events.map((e) => e.state);
    expect(states).toContain('starting');
    expect(states).toContain('running');
    expect(states.indexOf('starting')).toBeLessThan(states.indexOf('running'));
  });

  it('passes the TLS preference to the spawned child', async () => {
    const { spawn, argsLog } = autoSpawn();
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      initialTls: true,
      generateToken: () => 't',
    });
    await m.start();
    expect(argsLog[0]!.tls).toBe(true);
    expect(m.status().configuredTls).toBe(true);
  });

  it('restarts with TLS when the preference is toggled while running', async () => {
    const { spawn, argsLog } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 4000, generateToken: () => 't' });
    await m.start();
    expect(argsLog[0]!.tls).toBe(false);
    await m.setTls(true);
    expect(argsLog).toHaveLength(2);
    expect(argsLog[1]!.tls).toBe(true);
  });

  it('is idempotent when already running', async () => {
    const { spawn, children } = autoSpawn();
    const m = new McpServerManager({ spawn, initialPort: 4000, generateToken: () => 't' });
    await m.start();
    await m.start();
    expect(children).toHaveLength(1);
  });

  it('reuses the persisted token across restarts (stable URL)', async () => {
    const { spawn, argsLog } = autoSpawn();
    let minted = 0;
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      initialToken: 'persisted-token',
      generateToken: () => `fresh-${(minted += 1)}`,
    });
    await m.start();
    await m.stop();
    await m.start();
    expect(argsLog.map((a) => a.token)).toEqual(['persisted-token', 'persisted-token']);
    expect(minted).toBe(0); // never generated — the persisted token was reused
  });

  it('mints and reports a token when none is persisted', async () => {
    const { spawn, argsLog } = autoSpawn();
    const changed: string[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      initialToken: '',
      generateToken: () => 'minted',
      onTokenChanged: (t) => changed.push(t),
    });
    await m.start();
    expect(changed).toEqual(['minted']);
    expect(argsLog[0]!.token).toBe('minted');
  });

  it('refreshToken rotates the token, reports it, and restarts when running', async () => {
    const { spawn, argsLog } = autoSpawn();
    const changed: string[] = [];
    let n = 0;
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      initialToken: 'old',
      generateToken: () => `rotated-${(n += 1)}`,
      onTokenChanged: (t) => changed.push(t),
    });
    await m.start();
    const status = await m.refreshToken();
    expect(status.state).toBe('running');
    expect(changed).toEqual(['rotated-1']);
    expect(argsLog).toHaveLength(2);
    expect(argsLog[0]!.token).toBe('old');
    expect(argsLog[1]!.token).toBe('rotated-1');
    expect(status.url).toContain('token=rotated-1');
  });

  it('remembers the auto-assigned port and reuses it on restart', async () => {
    const { spawn, argsLog } = autoSpawn();
    const assigned: number[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 0, // auto-assign
      generateToken: () => 't',
      onAssignedPortChanged: (p) => assigned.push(p),
    });
    const status = await m.start();
    // autoSpawn binds `args.port || 4000`, so the OS-chosen port is 4000.
    expect(assigned).toEqual([4000]);
    expect(status.port).toBe(4000); // bound port
    expect(status.configuredPort).toBe(0); // the preference stays "auto"
    expect(argsLog[0]!.port).toBe(0); // first spawn asked the OS for a free port

    await m.stop();
    await m.start();
    expect(argsLog[1]!.port).toBe(4000); // restart reuses the remembered port
    expect(assigned).toEqual([4000]); // unchanged — nothing new to persist
  });

  it('does not remember a port when a fixed port was configured', async () => {
    const { spawn } = autoSpawn();
    const assigned: number[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 5123,
      generateToken: () => 't',
      onAssignedPortChanged: (p) => assigned.push(p),
    });
    await m.start();
    expect(assigned).toEqual([]); // explicit port → nothing to remember
  });

  it('falls back to a fresh port when the remembered port is unavailable', async () => {
    const argsLog: SpawnArgs[] = [];
    const spawn = (args: SpawnArgs): McpChild => {
      argsLog.push(args);
      const child = new FakeChild();
      setTimeout(() => {
        // Port 59020 is "in use": the child fails to bind and exits during startup
        // (as the real child does on EADDRINUSE); any other port binds fine.
        if (args.port === 59020) child.emitExit(1);
        else child.emitLine(`WORKFLOW_MCP_LISTENING http://127.0.0.1:${args.port || 4000}/mcp?token=${args.token}`);
      }, 0);
      return child;
    };
    const assigned: number[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 0,
      initialAssignedPort: 59020,
      generateToken: () => 't',
      onAssignedPortChanged: (p) => assigned.push(p),
    });

    const status = await m.start();
    expect(status.state).toBe('running');
    expect(status.port).toBe(4000);
    expect(argsLog.map((a) => a.port)).toEqual([59020, 0]); // tried remembered, then auto
    expect(assigned).toEqual([0, 4000]); // forgot the stale port, then recorded the new one
  });

  it('comes up on a free port when a fixed port is busy, without changing the preference', async () => {
    const argsLog: SpawnArgs[] = [];
    const spawn = (args: SpawnArgs): McpChild => {
      argsLog.push(args);
      const child = new FakeChild();
      setTimeout(() => {
        if (args.port === 59020) child.emitExit(1);
        else child.emitLine(`WORKFLOW_MCP_LISTENING http://127.0.0.1:${args.port || 4000}/mcp?token=${args.token}`);
      }, 0);
      return child;
    };
    const assigned: number[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 59020, // a fixed/legacy preference that happens to be in use
      generateToken: () => 't',
      onAssignedPortChanged: (p) => assigned.push(p),
    });

    const status = await m.start();
    expect(status.state).toBe('running');
    expect(status.port).toBe(4000);
    expect(status.configuredPort).toBe(59020); // the preference is preserved, not clobbered
    expect(argsLog.map((a) => a.port)).toEqual([59020, 0]);
    expect(assigned).toEqual([]); // fixed mode never writes the sticky slot
  });

  it('enables the app bridge only when a handleAppRpc handler is provided', async () => {
    const off = autoSpawn();
    const mOff = new McpServerManager({ spawn: off.spawn, initialPort: 4000, generateToken: () => 't' });
    await mOff.start();
    expect(off.argsLog[0]!.appBridge).toBe(false);

    const on = autoSpawn();
    const mOn = new McpServerManager({
      spawn: on.spawn,
      initialPort: 4000,
      generateToken: () => 't',
      handleAppRpc: async () => ({ ok: true }),
    });
    await mOn.start();
    expect(on.argsLog[0]!.appBridge).toBe(true);
  });

  it('dispatches a child app-RPC line to the handler and replies over stdin', async () => {
    const { spawn, children } = autoSpawn();
    const calls: Array<{ method: string; params: unknown }> = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      generateToken: () => 't',
      handleAppRpc: async (req) => {
        calls.push({ method: req.method, params: req.params });
        return { ok: true, result: { id: 'wf-9', name: 'Imported' } };
      },
    });
    await m.start();
    const child = children[0]!;

    child.emitLine('WORKFLOW_MCP_RPC {"id":7,"method":"importWorkflow","params":{"workflow":{"x":1}}}');
    await new Promise((r) => setTimeout(r, 0)); // let the async handler settle

    expect(calls).toEqual([{ method: 'importWorkflow', params: { workflow: { x: 1 } } }]);
    expect(JSON.parse(child.sent[0]!)).toEqual({ id: 7, ok: true, result: { id: 'wf-9', name: 'Imported' } });
  });

  it('replies with an error when the app-RPC handler rejects', async () => {
    const { spawn, children } = autoSpawn();
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      generateToken: () => 't',
      handleAppRpc: async () => {
        throw new Error('no project open');
      },
    });
    await m.start();
    children[0]!.emitLine('WORKFLOW_MCP_RPC {"id":3,"method":"importWorkflow","params":{}}');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse(children[0]!.sent[0]!)).toEqual({ id: 3, ok: false, error: 'no project open' });
  });

  it('ignores an unparseable app-RPC line (no reply)', async () => {
    const { spawn, children } = autoSpawn();
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      generateToken: () => 't',
      handleAppRpc: async () => ({ ok: true }),
    });
    await m.start();
    children[0]!.emitLine('WORKFLOW_MCP_RPC not-json');
    await new Promise((r) => setTimeout(r, 0));
    expect(children[0]!.sent).toHaveLength(0);
  });

  it('refreshToken persists the new token without spawning when stopped', async () => {
    const { spawn, children } = autoSpawn();
    const changed: string[] = [];
    const m = new McpServerManager({
      spawn,
      initialPort: 4000,
      initialToken: 'old',
      generateToken: () => 'rotated',
      onTokenChanged: (t) => changed.push(t),
    });
    const status = await m.refreshToken();
    expect(status.state).toBe('stopped');
    expect(changed).toEqual(['rotated']);
    expect(children).toHaveLength(0);
  });
});
