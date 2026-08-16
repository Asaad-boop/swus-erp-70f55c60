import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, Check, ChevronRight, CircleUserRound, Copy, KeyRound,
  LayoutGrid, Link2, Loader2, LockKeyhole, Mail, Power, Search, Shield,
  ShieldCheck, Trash2, UserPlus, Users, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HrPageHeader } from "@/components/erp/hr/hr-shell";
import { useBrand } from "@/contexts/brand-context";
import { MY_ACCESS_QUERY_KEY } from "@/hooks/use-my-access-profile";
import { useCurrentRole } from "@/hooks/use-current-role";
import { pagesForRoles } from "@/lib/erp/access";
import {
  createAccessUser, deleteAccessUser, generateAccessAuthLink, getAccessWorkspace,
  saveAccessProfile, setAccessUserBan, setAccessUserPassword,
} from "@/lib/erp/access-profile.functions";
import {
  APP_ROLES, ROLE_REGISTRY, type AccessWorkspaceUser, type AppRole,
  type BrandMode, type PageMode,
} from "@/lib/erp/access-profile.model";
import { ALL_PAGE_PATHS, PAGE_CATALOG, PAGE_GROUPS, type PageEntry } from "@/lib/erp/permissions/page-catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/erp/hr/access")({
  head: () => ({ meta: [
    { title: "Users & Access — HRM" },
    { name: "description", content: "Manage ERP staff identities, roles, brands and page access from one workspace." },
    { property: "og:title", content: "Users & Access — HRM" },
    { property: "og:description", content: "One secure workspace for staff access management." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AccessPage,
});

type Draft = {
  roles: AppRole[];
  brandMode: BrandMode;
  brandIds: string[];
  pageMode: PageMode;
  allowedPages: string[];
  employeeId: string | null;
};

type Employee = { id: string; user_id: string | null; full_name: string; employee_code: string | null; status: string };

const STAFF_ROLES = APP_ROLES.filter((role) => role !== "customer");
const emptyInvite = { email: "", displayName: "", password: "", roles: ["employee"] as AppRole[], brandMode: "all" as BrandMode, brandIds: [] as string[], pageMode: "role_default" as PageMode, allowedPages: [] as string[], employeeId: null as string | null };

function fromUser(user: AccessWorkspaceUser): Draft {
  return { roles: user.roles, brandMode: user.brandMode, brandIds: user.brandIds, pageMode: user.pageMode, allowedPages: user.allowedPages, employeeId: user.employeeId };
}

function stableDraft(value: Draft) {
  return JSON.stringify({ ...value, roles: [...value.roles].sort(), brandIds: [...value.brandIds].sort(), allowedPages: [...value.allowedPages].sort() });
}

function isDisabled(user: AccessWorkspaceUser) {
  return Boolean(user.bannedUntil && user.bannedUntil !== "none" && new Date(user.bannedUntil).getTime() > Date.now());
}

function AccessPage() {
  const { isAdmin, isLoading: roleLoading } = useCurrentRole();
  const { brands } = useBrand();
  const qc = useQueryClient();
  const workspaceFn = useServerFn(getAccessWorkspace);
  const saveFn = useServerFn(saveAccessProfile);
  const createFn = useServerFn(createAccessUser);
  const banFn = useServerFn(setAccessUserBan);
  const deleteFn = useServerFn(deleteAccessUser);
  const passwordFn = useServerFn(setAccessUserPassword);
  const linkFn = useServerFn(generateAccessAuthLink);

  const workspace = useQuery({ queryKey: ["access-workspace"], queryFn: () => workspaceFn(), enabled: isAdmin, staleTime: 0, refetchOnWindowFocus: true });
  const usersList = workspace.data?.users ?? [];
  const employees = (workspace.data?.employees ?? []) as Employee[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState(emptyInvite);
  const selected = usersList.find((user) => user.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && usersList[0]) setSelectedId(usersList[0].id);
    if (selectedId && !usersList.some((user) => user.id === selectedId)) setSelectedId(usersList[0]?.id ?? null);
  }, [selectedId, usersList]);
  useEffect(() => { if (selected) setDraft(fromUser(selected)); }, [selected]);

  const invalidate = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["access-workspace"] }),
      qc.invalidateQueries({ queryKey: MY_ACCESS_QUERY_KEY }),
    ]);
  };
  const saveMutation = useMutation({
    mutationFn: (value: Draft) => saveFn({ data: { userId: selectedId ?? "", ...value } }),
    onSuccess: async () => { toast.success("Access profile saved"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const createMutation = useMutation({
    mutationFn: () => createFn({ data: invite }),
    onSuccess: async ({ id }) => { toast.success("Staff login created"); setInviteOpen(false); setInvite(emptyInvite); setSelectedId(id); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const banMutation = useMutation({
    mutationFn: (ban: boolean) => banFn({ data: { userId: selectedId ?? "", ban } }),
    onSuccess: async () => { toast.success("Login status updated"); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteFn({ data: { userId: selectedId ?? "" } }),
    onSuccess: async () => { toast.success("Staff login deleted"); setSelectedId(null); await invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const passwordMutation = useMutation({
    mutationFn: (password: string) => passwordFn({ data: { userId: selectedId ?? "", password } }),
    onSuccess: () => toast.success("Password updated"),
    onError: (error: Error) => toast.error(error.message),
  });
  const linkMutation = useMutation({
    mutationFn: () => linkFn({ data: { email: selected?.email ?? "", type: "recovery" } }),
    onSuccess: async ({ url }) => {
      if (!url) return toast.error("Reset link could not be generated");
      await navigator.clipboard?.writeText(url);
      toast.success("Password-reset link copied");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return usersList.filter((user) => {
      if (roleFilter !== "all" && !user.roles.includes(roleFilter as AppRole)) return false;
      if (statusFilter === "active" && isDisabled(user)) return false;
      if (statusFilter === "disabled" && !isDisabled(user)) return false;
      if (statusFilter === "custom" && user.pageMode !== "custom") return false;
      return !term || `${user.displayName ?? ""} ${user.email ?? ""} ${user.employeeName ?? ""}`.toLowerCase().includes(term);
    });
  }, [roleFilter, search, statusFilter, usersList]);

  const dirty = Boolean(selected && draft && stableDraft(draft) !== stableDraft(fromUser(selected)));
  const validation = draft ? validateDraft(draft) : [];
  const effectivePages = draft ? (draft.pageMode === "custom" ? draft.allowedPages : pagesForRoles(draft.roles, ALL_PAGE_PATHS)) : [];
  const stats = {
    total: usersList.length,
    admins: usersList.filter((user) => user.roles.includes("admin")).length,
    custom: usersList.filter((user) => user.pageMode === "custom").length,
    disabled: usersList.filter(isDisabled).length,
  };

  if (roleLoading) return <div className="p-6 text-sm text-muted-foreground">Loading access…</div>;
  if (!isAdmin) return <div className="p-6"><Card className="p-6 text-sm text-muted-foreground"><Shield className="mb-2 h-5 w-5" />Admin only.</Card></div>;

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 md:p-6">
      <HrPageHeader icon={ShieldCheck} title="Users & Access" subtitle="Staff identity, role, brand, page permission and employee link — one control center." actions={<Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> New staff login</Button>} />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi label="Staff logins" value={stats.total} icon={Users} />
        <Kpi label="Administrators" value={stats.admins} icon={ShieldCheck} />
        <Kpi label="Custom access" value={stats.custom} icon={LayoutGrid} />
        <Kpi label="Disabled" value={stats.disabled} icon={LockKeyhole} />
      </div>

      <div className="grid min-h-[690px] gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="space-y-2 border-b p-3">
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff…" className="pl-9" /></div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={roleFilter} onValueChange={setRoleFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All roles</SelectItem>{STAFF_ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_REGISTRY[role].label}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All access</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="disabled">Disabled</SelectItem><SelectItem value="custom">Custom pages</SelectItem></SelectContent></Select>
            </div>
          </div>
          <ScrollArea className="h-[610px]">
            {workspace.isLoading && <div className="p-5 text-sm text-muted-foreground">Loading staff…</div>}
            {!workspace.isLoading && rows.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No staff found.</div>}
            <div className="divide-y">
              {rows.map((user) => <StaffRow key={user.id} user={user} selected={user.id === selectedId} onSelect={() => { if (!dirty || confirm("Discard unsaved access changes?")) setSelectedId(user.id); }} />)}
            </div>
          </ScrollArea>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          {!selected || !draft ? <div className="grid min-h-[680px] place-items-center text-sm text-muted-foreground">Select a staff login.</div> : (
            <>
              <ProfileHeader user={selected} effectivePages={effectivePages.length} brandCount={draft.brandMode === "all" ? brands.length : draft.brandIds.length} />
              <Tabs defaultValue="access" className="min-w-0">
                <div className="border-b px-4"><TabsList className="h-11 bg-transparent p-0"><TabsTrigger value="access">Roles</TabsTrigger><TabsTrigger value="brands">Brands</TabsTrigger><TabsTrigger value="pages">Pages</TabsTrigger><TabsTrigger value="employee">Employee</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger></TabsList></div>
                <div className="p-4 md:p-5">
                  <TabsContent value="access" className="mt-0"><RolesPanel value={draft.roles} onChange={(roles) => setDraft({ ...draft, roles })} /></TabsContent>
                  <TabsContent value="brands" className="mt-0"><BrandsPanel mode={draft.brandMode} ids={draft.brandIds} brands={brands} onChange={(brandMode, brandIds) => setDraft({ ...draft, brandMode, brandIds })} /></TabsContent>
                  <TabsContent value="pages" className="mt-0"><PagesPanel roles={draft.roles} mode={draft.pageMode} pages={draft.allowedPages} onChange={(pageMode, allowedPages) => setDraft({ ...draft, pageMode, allowedPages })} /></TabsContent>
                  <TabsContent value="employee" className="mt-0"><EmployeePanel employees={employees} selectedUserId={selected.id} value={draft.employeeId} onChange={(employeeId) => setDraft({ ...draft, employeeId })} /></TabsContent>
                  <TabsContent value="security" className="mt-0"><SecurityPanel user={selected} onPassword={(password) => passwordMutation.mutate(password)} onResetLink={() => linkMutation.mutate()} onToggle={() => banMutation.mutate(!isDisabled(selected))} onDelete={() => { if (confirm(`Permanently delete ${selected.email}?`)) deleteMutation.mutate(); }} pending={passwordMutation.isPending || linkMutation.isPending || banMutation.isPending || deleteMutation.isPending} /></TabsContent>
                </div>
              </Tabs>
              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
                <div className="min-w-0 text-xs">{validation.length ? <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{validation[0]}</span> : dirty ? <span className="text-amber-600">Unsaved access profile changes</span> : <span className="flex items-center gap-1 text-muted-foreground"><Check className="h-3.5 w-3.5" />Access profile is up to date</span>}</div>
                <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setDraft(fromUser(selected))} disabled={!dirty || saveMutation.isPending}>Discard</Button><Button size="sm" onClick={() => saveMutation.mutate(draft)} disabled={!dirty || validation.length > 0 || saveMutation.isPending}>{saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Review & save</Button></div>
              </div>
            </>
          )}
        </Card>
      </div>

      <CreateUserDialog open={inviteOpen} onOpenChange={setInviteOpen} value={invite} onChange={setInvite} brands={brands} employees={employees} pending={createMutation.isPending} onSubmit={() => createMutation.mutate()} />
    </div>
  );
}

function validateDraft(draft: Draft) {
  const errors: string[] = [];
  if (!draft.roles.length || draft.roles.every((role) => role === "customer")) errors.push("At least one staff role is required.");
  if (draft.brandMode === "selected" && !draft.brandIds.length) errors.push("Select at least one brand or choose All brands.");
  if (draft.pageMode === "custom" && !draft.allowedPages.length) errors.push("Select at least one page or choose Role defaults.");
  return errors;
}

function Kpi({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div><Icon className="h-5 w-5 text-primary" /></div>;
}

function StaffRow({ user, selected, onSelect }: { user: AccessWorkspaceUser; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} className={cn("flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent", selected && "bg-primary/10")}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-sm font-semibold">{(user.displayName || user.email || "?")[0]?.toUpperCase()}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 truncate text-sm font-medium">{user.displayName || user.email}{isDisabled(user) && <Badge variant="destructive" className="text-[9px]">Off</Badge>}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span><span className="mt-1 flex flex-wrap gap-1">{user.roles.slice(0, 2).map((role) => <Badge key={role} variant={role === "admin" ? "default" : "secondary"} className="text-[9px]">{ROLE_REGISTRY[role]?.label ?? role}</Badge>)}{user.roles.length > 2 && <Badge variant="outline" className="text-[9px]">+{user.roles.length - 2}</Badge>}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>;
}

function ProfileHeader({ user, effectivePages, brandCount }: { user: AccessWorkspaceUser; effectivePages: number; brandCount: number }) {
  return <div className="flex flex-wrap items-start justify-between gap-4 border-b bg-muted/20 p-4 md:p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-md bg-primary/10 text-primary"><CircleUserRound className="h-6 w-6" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold">{user.displayName || user.email}</h2><Badge variant={isDisabled(user) ? "destructive" : "outline"}>{isDisabled(user) ? "Disabled" : "Active"}</Badge>{!user.emailConfirmedAt && <Badge variant="secondary">Unverified</Badge>}</div><p className="truncate text-xs text-muted-foreground">{user.email} · Last sign-in {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString("en-BD") : "never"}</p></div></div><div className="flex gap-2 text-xs"><Badge variant="secondary">{effectivePages} pages</Badge><Badge variant="secondary">{brandCount} brands</Badge>{user.employeeName && <Badge variant="outline">{user.employeeName}</Badge>}</div></div>;
}

function RolesPanel({ value, onChange }: { value: AppRole[]; onChange: (value: AppRole[]) => void }) {
  return <section className="space-y-3"><PanelHeading title="Access roles" copy="Multiple roles merge their default permissions. Admin always has full access." /><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{STAFF_ROLES.map((role) => { const active = value.includes(role); return <button type="button" key={role} onClick={() => onChange(active ? value.filter((item) => item !== role) : [...value, role])} className={cn("flex items-start gap-3 rounded-md border p-3 text-left transition-colors hover:bg-accent", active && "border-primary bg-primary/5")}><Checkbox checked={active} className="mt-0.5" /><span><span className="block text-sm font-medium">{ROLE_REGISTRY[role].label}</span><span className="block text-xs text-muted-foreground">{ROLE_REGISTRY[role].description}</span></span></button>; })}</div></section>;
}

function BrandsPanel({ mode, ids, brands, onChange }: { mode: BrandMode; ids: string[]; brands: Array<{ id: string; name: string }>; onChange: (mode: BrandMode, ids: string[]) => void }) {
  return <section className="space-y-4"><PanelHeading title="Brand scope" copy="This controls the brands visible in the switcher and accepted by brand-aware database policies." /><RadioGroup value={mode} onValueChange={(value) => onChange(value as BrandMode, value === "all" ? [] : ids)} className="grid gap-2 md:grid-cols-2"><ModeChoice value="all" title="All brands" copy="Current and future active brands" icon={Building2} /><ModeChoice value="selected" title="Selected brands" copy="Only explicitly selected brands" icon={ShieldCheck} /></RadioGroup>{mode === "selected" && <div className="grid gap-2 md:grid-cols-2">{brands.map((brand) => { const active = ids.includes(brand.id); return <label key={brand.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm", active && "border-primary bg-primary/5")}><Checkbox checked={active} onCheckedChange={() => onChange(mode, active ? ids.filter((id) => id !== brand.id) : [...ids, brand.id])} />{brand.name}</label>; })}</div>}</section>;
}

function PagesPanel({ roles, mode, pages, onChange }: { roles: AppRole[]; mode: PageMode; pages: string[]; onChange: (mode: PageMode, pages: string[]) => void }) {
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const visible = useMemo(() => PAGE_CATALOG.filter((page) => (!page.hidden || showHidden || pages.includes(page.path)) && (!search.trim() || `${page.label} ${page.path} ${page.section}`.toLowerCase().includes(search.toLowerCase()))), [pages, search, showHidden]);
  const groups = useMemo(() => { const out = new Map<string, PageEntry[]>(); for (const group of PAGE_GROUPS) out.set(group, visible.filter((page) => page.group === group)); return out; }, [visible]);
  const toggleMany = (paths: string[], active: boolean) => onChange(mode, active ? [...new Set([...pages, ...paths])] : pages.filter((path) => !paths.includes(path)));
  return <section className="space-y-4"><PanelHeading title="Page access" copy="Role defaults stay current automatically. Custom access becomes the authoritative page allowlist." /><RadioGroup value={mode} onValueChange={(value) => onChange(value as PageMode, value === "custom" ? (pages.length ? pages : pagesForRoles(roles, ALL_PAGE_PATHS)) : [])} className="grid gap-2 md:grid-cols-2"><ModeChoice value="role_default" title="Role defaults" copy={`${pagesForRoles(roles, ALL_PAGE_PATHS).length} effective pages from selected roles`} icon={Shield} /><ModeChoice value="custom" title="Custom access" copy="Explicit allowlist; role pages are replaced" icon={LayoutGrid} /></RadioGroup>{mode === "custom" && <><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages…" className="pl-9" /></div><Badge variant="secondary">{pages.length} selected</Badge><Button variant="outline" size="sm" onClick={() => onChange(mode, pagesForRoles(roles, ALL_PAGE_PATHS))}>Load role set</Button><Button variant="outline" size="sm" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "Hide internal" : "Show internal"}</Button></div><div className="grid gap-3 xl:grid-cols-2">{[...groups.entries()].map(([group, entries]) => entries.length ? <div key={group} className="rounded-md border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{group}</h3><Button variant="ghost" size="sm" onClick={() => toggleMany(entries.map((page) => page.path), !entries.every((page) => pages.includes(page.path)))}>{entries.every((page) => pages.includes(page.path)) ? "Clear" : "Select all"}</Button></div><div className="space-y-1">{entries.map((page) => <label key={page.path} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-accent"><Checkbox checked={pages.includes(page.path)} onCheckedChange={() => toggleMany([page.path], !pages.includes(page.path))} /><span className="flex-1 truncate">{page.label}</span><span className="text-[10px] text-muted-foreground">{page.section}</span>{page.hidden && <Badge variant="outline" className="text-[9px]">internal</Badge>}</label>)}</div></div> : null)}</div></>}</section>;
}

function EmployeePanel({ employees, selectedUserId, value, onChange }: { employees: Employee[]; selectedUserId: string; value: string | null; onChange: (value: string | null) => void }) {
  const available = employees.filter((employee) => !employee.user_id || employee.user_id === selectedUserId || employee.id === value);
  return <section className="space-y-4"><PanelHeading title="Employee identity" copy="Link this login to exactly one HR employee for self-service attendance and payroll." /><div className="max-w-xl space-y-2"><Label>Linked employee</Label><Select value={value ?? "none"} onValueChange={(id) => onChange(id === "none" ? null : id)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No employee linked</SelectItem>{available.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name}{employee.employee_code ? ` · ${employee.employee_code}` : ""} · {employee.status}</SelectItem>)}</SelectContent></Select></div></section>;
}

function SecurityPanel({ user, onPassword, onResetLink, onToggle, onDelete, pending }: { user: AccessWorkspaceUser; onPassword: (value: string) => void; onResetLink: () => void; onToggle: () => void; onDelete: () => void; pending: boolean }) {
  const [password, setPassword] = useState("");
  return <section className="space-y-5"><PanelHeading title="Login security" copy="Reset credentials, disable access, or permanently remove this staff login." /><div className="grid gap-3 md:grid-cols-2"><div className="space-y-2 rounded-md border p-4"><Label>Set temporary password</Label><div className="flex gap-2"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 8 characters" /><Button onClick={() => { onPassword(password); setPassword(""); }} disabled={pending || password.length < 8}><KeyRound className="h-4 w-4" /> Update</Button></div></div><div className="space-y-2 rounded-md border p-4"><Label>Password recovery</Label><p className="text-xs text-muted-foreground">Generate a secure one-time recovery link.</p><Button variant="outline" onClick={onResetLink} disabled={pending || !user.email}><Copy className="h-4 w-4" /> Copy reset link</Button></div></div><Separator /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onToggle} disabled={pending}><Power className="h-4 w-4" />{isDisabled(user) ? "Enable login" : "Disable login"}</Button><Button variant="destructive" onClick={onDelete} disabled={pending}><Trash2 className="h-4 w-4" />Delete login</Button></div></section>;
}

function ModeChoice({ value, title, copy, icon: Icon }: { value: string; title: string; copy: string; icon: typeof Shield }) {
  return <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"><RadioGroupItem value={value} className="mt-1" /><Icon className="mt-0.5 h-4 w-4 text-primary" /><span><span className="block text-sm font-medium">{title}</span><span className="block text-xs text-muted-foreground">{copy}</span></span></label>;
}

function PanelHeading({ title, copy }: { title: string; copy: string }) { return <div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{copy}</p></div>; }

function CreateUserDialog({ open, onOpenChange, value, onChange, brands, employees, pending, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; value: typeof emptyInvite; onChange: (value: typeof emptyInvite) => void; brands: Array<{ id: string; name: string }>; employees: Employee[]; pending: boolean; onSubmit: () => void }) {
  const errors = validateDraft(value);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Create staff login</DialogTitle></DialogHeader><div className="space-y-5"><div className="grid gap-3 md:grid-cols-2"><div><Label>Full name</Label><Input value={value.displayName} onChange={(event) => onChange({ ...value, displayName: event.target.value })} /></div><div><Label>Email</Label><Input type="email" value={value.email} onChange={(event) => onChange({ ...value, email: event.target.value })} /></div><div><Label>Temporary password</Label><Input type="password" value={value.password} onChange={(event) => onChange({ ...value, password: event.target.value })} placeholder="Minimum 8 characters" /></div><div><Label>Employee link</Label><Select value={value.employeeId ?? "none"} onValueChange={(id) => onChange({ ...value, employeeId: id === "none" ? null : id })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Link later</SelectItem>{employees.filter((employee) => !employee.user_id).map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.full_name}</SelectItem>)}</SelectContent></Select></div></div><Separator /><div><Label>Staff roles</Label><div className="mt-2 grid gap-2 md:grid-cols-2">{STAFF_ROLES.map((role) => <label key={role} className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"><Checkbox checked={value.roles.includes(role)} onCheckedChange={() => onChange({ ...value, roles: value.roles.includes(role) ? value.roles.filter((item) => item !== role) : [...value.roles, role] })} />{ROLE_REGISTRY[role].label}</label>)}</div></div><Separator /><div><Label>Brand scope</Label><RadioGroup value={value.brandMode} onValueChange={(mode) => onChange({ ...value, brandMode: mode as BrandMode, brandIds: mode === "all" ? [] : value.brandIds })} className="mt-2 grid gap-2 md:grid-cols-2"><ModeChoice value="all" title="All brands" copy="All current and future brands" icon={Building2} /><ModeChoice value="selected" title="Selected brands" copy="Choose specific brands below" icon={ShieldCheck} /></RadioGroup>{value.brandMode === "selected" && <div className="mt-2 flex flex-wrap gap-2">{brands.map((brand) => <label key={brand.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs"><Checkbox checked={value.brandIds.includes(brand.id)} onCheckedChange={() => onChange({ ...value, brandIds: value.brandIds.includes(brand.id) ? value.brandIds.filter((id) => id !== brand.id) : [...value.brandIds, brand.id] })} />{brand.name}</label>)}</div>}</div><div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">New staff starts with role defaults. You can set an advanced custom page allowlist after creation.</div></div><DialogFooter className="items-center"><span className="mr-auto text-xs text-destructive">{errors[0] ?? ""}</span><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={onSubmit} disabled={pending || errors.length > 0 || !value.displayName || !value.email || value.password.length < 8}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Create login</Button></DialogFooter></DialogContent></Dialog>;
}
