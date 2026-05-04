import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Domain = { id: string; domain: string; is_protected: boolean; created_at: string };

export default function AdminDomains() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    const [{ data: d }, { data: p }] = await Promise.all([
      supabase.from("allowed_domains").select("*").order("domain"),
      supabase.from("profiles").select("email"),
    ]);
    setDomains((d as Domain[]) ?? []);
    setEmails(((p as { email: string | null }[]) ?? []).map((r) => (r.email ?? "").toLowerCase()));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    emails.forEach((e) => {
      const dom = e.split("@")[1];
      if (!dom) return;
      m.set(dom, (m.get(dom) ?? 0) + 1);
    });
    return m;
  }, [emails]);

  async function add() {
    const dom = newDomain.trim().toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dom)) {
      toast.error("Enter a valid domain (e.g. example.com)");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("allowed_domains").insert({ domain: dom });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setNewDomain("");
    toast.success("Domain added");
    refresh();
  }

  async function remove(d: Domain) {
    if (d.is_protected) return;
    if (!confirm(`Remove ${d.domain}? Users with this domain will no longer be able to sign in.`)) return;
    const { error } = await supabase.from("allowed_domains").delete().eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Domain removed");
    refresh();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <AdminTabs title="Domain Access" description="Email domains allowed to sign in" />

      <Card className="mb-4">
        <CardContent className="p-4 flex gap-2">
          <Input
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={busy}><Plus className="h-4 w-4 mr-1" /> Add domain</Button>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : domains.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No domains yet</TableCell></TableRow>
            ) : domains.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.domain}</TableCell>
                <TableCell>{counts.get(d.domain) ?? 0}</TableCell>
                <TableCell>
                  {d.is_protected
                    ? <Badge>Protected</Badge>
                    : <Badge variant="secondary">Allowed</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(d.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  {d.is_protected ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="ghost" disabled>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Required for admin access</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}