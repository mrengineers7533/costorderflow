import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface NotifLike {
  id: string;
  actor_department: string | null;
  target_departments: string[];
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}

interface Props {
  rows: NotifLike[];
  myReadIds: Set<string>;
  activeDept: string | null;
  activeStatus: "seen" | "pending" | null;
  onDeptClick: (d: string | null) => void;
  onStatusClick: (s: "seen" | "pending" | null) => void;
}

const PALETTE = [
  "hsl(var(--primary))",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(262 83% 58%)",
  "hsl(199 89% 48%)",
  "hsl(173 58% 39%)",
  "hsl(291 64% 42%)",
];

export function deptOf(n: NotifLike): string {
  if (n.actor_department && n.actor_department.trim()) return n.actor_department.trim();
  if (n.target_departments && n.target_departments.length > 0) return n.target_departments[0];
  const v = (n.new_value as Record<string, unknown> | null)?.department
    ?? (n.old_value as Record<string, unknown> | null)?.department;
  if (typeof v === "string" && v.trim()) return v.trim();
  return "Unknown Department";
}

export function NotificationCharts({
  rows,
  myReadIds,
  activeDept,
  activeStatus,
  onDeptClick,
  onStatusClick,
}: Props) {
  const deptData = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const d = deptOf(r);
      m.set(d, (m.get(d) || 0) + 1);
    });
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const statusData = useMemo(() => {
    let seen = 0;
    let pending = 0;
    rows.forEach((r) => (myReadIds.has(r.id) ? seen++ : pending++));
    return [
      { name: "Pending", value: pending, key: "pending" as const },
      { name: "Seen", value: seen, key: "seen" as const },
    ].filter((d) => d.value > 0);
  }, [rows, myReadIds]);

  const empty = rows.length === 0;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Notifications by Department</CardTitle>
          <CardDescription>Click a slice to filter the list by department.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {empty || deptData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No notification data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Pie
                  data={deptData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  onClick={(p: { name?: string }) => {
                    if (!p?.name) return;
                    onDeptClick(activeDept === p.name ? null : p.name);
                  }}
                  cursor="pointer"
                >
                  {deptData.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={PALETTE[i % PALETTE.length]}
                      stroke={activeDept === d.name ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                      strokeWidth={activeDept === d.name ? 2 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Pending vs Seen Notifications</CardTitle>
          <CardDescription>Click a slice to filter by your acknowledgement status.</CardDescription>
        </CardHeader>
        <CardContent className="h-[260px]">
          {empty || statusData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No notification data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={2}
                  onClick={(p: { key?: "seen" | "pending" }) => {
                    if (!p?.key) return;
                    onStatusClick(activeStatus === p.key ? null : p.key);
                  }}
                  cursor="pointer"
                >
                  {statusData.map((d) => (
                    <Cell
                      key={d.key}
                      fill={d.key === "seen" ? "hsl(199 89% 48%)" : "hsl(142 71% 45%)"}
                      stroke={activeStatus === d.key ? "hsl(var(--foreground))" : "hsl(var(--background))"}
                      strokeWidth={activeStatus === d.key ? 2 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}