/**
 * Test-only in-memory Supabase fake shared by the approval-sync integration
 * tests. Production code is untouched — this module is only imported from
 * `src/test/**`.
 *
 * Supports the subset of the supabase-js surface those tests exercise:
 *   .from(t).select(cols).eq().in().or().order().limit().maybeSingle()/single()/await
 *   .from(t).insert(rows).select().single()/await
 *   .from(t).update(patch).eq().in().await
 *   .rpc(name, args)
 *   .auth.getUser()
 *   .storage.from(b).upload()
 *   .functions.invoke()
 *
 * State (`tables`, `rpcCalls`, `writeCalls`) is exported so tests can seed
 * fixtures and assert no writes occur during read-only refresh/navigation.
 */

type Row = Record<string, unknown>;

export const tables: Record<string, Row[]> = {};
export const rpcCalls: Array<{ name: string; args: unknown }> = [];
export const writeCalls: Array<{ table: string; op: "insert" | "update" }> = [];

export function resetFake() {
  for (const k of Object.keys(tables)) delete tables[k];
  rpcCalls.length = 0;
  writeCalls.length = 0;
}

function ensure(t: string): Row[] {
  if (!tables[t]) tables[t] = [];
  return tables[t];
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function buildQuery(table: string, mode: "select" | "insert" = "select", pending?: Row[]) {
  let rows: Row[] = mode === "insert" ? (pending || []) : [...ensure(table)];
  let limit: number | null = null;

  const api: {
    select: (cols?: string) => typeof api;
    eq: (col: string, val: unknown) => typeof api;
    in: (col: string, arr: unknown[]) => typeof api;
    or: (str: string) => typeof api;
    order: (col?: string, opts?: unknown) => typeof api;
    limit: (n: number) => typeof api;
    single: () => Promise<{ data: Row | null; error: null }>;
    maybeSingle: () => Promise<{ data: Row | null; error: null }>;
    then: (onF: (v: { data: Row[]; error: null }) => unknown) => Promise<unknown>;
  } = {
    select() { return api; },
    eq(col, val) { rows = rows.filter((r) => r[col] === val); return api; },
    in(col, arr) { rows = rows.filter((r) => arr.includes(r[col] as never)); return api; },
    or(str) {
      const clauses = str.split(",").map((c) => c.trim());
      rows = rows.filter((r) => clauses.some((c) => {
        const [col, op, ...vparts] = c.split(".");
        const v = vparts.join(".");
        const cell = String(r[col] ?? "");
        if (op === "eq") return cell === v;
        if (op === "like") {
          const re = new RegExp("^" + v.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m).replace(/%/g, ".*") + "$");
          return re.test(cell);
        }
        return false;
      }));
      return api;
    },
    order() { return api; },
    limit(n) { limit = n; return api; },
    async single() {
      if (mode === "insert") {
        for (const r of pending || []) ensure(table).push(clone(r));
        writeCalls.push({ table, op: "insert" });
        return { data: clone((pending || [])[0] || null), error: null };
      }
      const out = limit != null ? rows.slice(0, limit) : rows;
      return { data: out[0] ? clone(out[0]) : null, error: null };
    },
    async maybeSingle() { return api.single(); },
    then(onF) {
      if (mode === "insert") {
        for (const r of pending || []) ensure(table).push(clone(r));
        writeCalls.push({ table, op: "insert" });
        return Promise.resolve(onF({ data: clone(pending || []), error: null }));
      }
      const out = limit != null ? rows.slice(0, limit) : rows;
      return Promise.resolve(onF({ data: clone(out), error: null }));
    },
  };
  return api;
}

export const supabase = {
  auth: {
    getUser: async () => ({
      data: {
        user: {
          id: "u-test",
          email: "tester@example.com",
          user_metadata: { full_name: "Tester" },
        },
      },
    }),
  },
  rpc: async (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    return { data: null, error: null };
  },
  from(table: string) {
    return {
      select: (_cols?: string) => buildQuery(table, "select"),
      insert: (payload: Row | Row[]) => {
        const arr = Array.isArray(payload) ? payload : [payload];
        const enriched = arr.map((r) => ({
          id: (r.id as string) || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...r,
        }));
        return buildQuery(table, "insert", enriched);
      },
      update: (patch: Row) => {
        const filters: Array<(r: Row) => boolean> = [];
        const api: {
          eq: (c: string, v: unknown) => typeof api;
          in: (c: string, arr: unknown[]) => typeof api;
          then: (onF: (v: { data: null; error: null }) => unknown) => Promise<unknown>;
        } = {
          eq(col, val) { filters.push((r) => r[col] === val); return api; },
          in(col, arr) { filters.push((r) => arr.includes(r[col] as never)); return api; },
          then(onF) {
            for (const r of ensure(table)) {
              if (filters.every((f) => f(r))) Object.assign(r, patch, { updated_at: new Date().toISOString() });
            }
            writeCalls.push({ table, op: "update" });
            return Promise.resolve(onF({ data: null, error: null }));
          },
        };
        return api;
      },
    };
  },
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
    }),
  },
  functions: {
    invoke: async () => ({ data: null, error: null }),
  },
};