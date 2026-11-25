import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { QuickOrderSheet } from "./quick-order-sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  Loader2,
  Megaphone,
  Phone,
  PlusCircle,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BrandTag } from "./shared";
import { useCurrentRole } from "@/hooks/use-current-role";
import {
  addNote,
  deleteNote,
  displayName,
  fetchMessages,
  fetchNotes,
  fetchOrdersByPhone,
  findBdPhone,
  PLATFORM_LABEL,
  profileLinks,
  updateConversation,
  type InboxChannel,
  type InboxConversation,
  type InboxMessage,
} from "@/lib/erp/inbox/inbox";
import { agoLabel, ContactAvatar, PlatformChip } from "./shared";

export function ContactPanel({
  conversation: c,
  channel,
  onClose,
}: {
  conversation: InboxConversation;
  channel?: InboxChannel;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { userId, isAdmin } = useCurrentRole();
  const name = displayName(c);
  const [phone, setPhone] = useState(c.contact_phone ?? "");
  const [nameEdit, setNameEdit] = useState(c.contact_name ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    setPhone(c.contact_phone ?? "");
    setNameEdit(c.contact_name ?? "");
    setNote("");
  }, [c.id, c.contact_phone, c.contact_name]);

  // Messages are already cached by the thread; reuse them to spot a phone number.
  const msgs = qc.getQueryData<InboxMessage[]>(["inbox", "messages", c.id]);
  const msgsQ = useQuery({
    queryKey: ["inbox", "messages", c.id],
    queryFn: () => fetchMessages(c.id),
    enabled: !msgs,
  });
  const detectedPhone = useMemo(() => {
    const list = msgs ?? msgsQ.data ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]!;
      if (m.direction !== "in") continue;
      const p = findBdPhone(m.body);
      if (p) return p;
    }
    return null;
  }, [msgs, msgsQ.data]);

  const savedPhone = (c.contact_phone ?? "").replace(/\D/g, "").replace(/^88/, "");
  const [orderOpen, setOrderOpen] = useState(false);
  const ordersQ = useQuery({
    queryKey: ["inbox", "orders-by-phone", savedPhone],
    queryFn: () => fetchOrdersByPhone(savedPhone),
    enabled: savedPhone.length >= 11,
  });

  const notesQ = useQuery({ queryKey: ["inbox", "notes", c.id], queryFn: () => fetchNotes(c.id) });

  const saveContact = useMutation({
    mutationFn: (patch: { contact_phone?: string | null; contact_name?: string | null }) =>
      updateConversation(c.id, patch),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["inbox", "conversations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: () => addNote(c, note.trim(), userId!),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["inbox", "notes", c.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox", "notes", c.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const normalizedPhone = phone.replace(/\D/g, "").replace(/^88/, "");

  const orders = ordersQ.data ?? [];
  const stats = useMemo(() => {
    const done = orders.filter((o) => /deliver|complete/i.test(o.status));
    const returned = orders.filter((o) => /return|cancel/i.test(o.status));
    return {
      count: orders.length,
      spent: done.reduce((s2, o) => s2 + Number(o.total ?? 0), 0),
      returnRate: orders.length ? Math.round((returned.length / orders.length) * 100) : 0,
    };
  }, [orders]);
  const fieldCls =
    "h-9 w-full rounded-lg border border-[var(--ib-line,var(--border))] bg-[var(--ib-canvas,var(--muted))] px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:bg-[var(--ib-panel,var(--background))] focus:ring-4 focus:ring-primary/10";
  const sectionTitle = "text-[12.5px] font-semibold text-[var(--ib-ink,inherit)]";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--ib-line,var(--border))] px-4">
        <span className="font-display text-[14px] font-semibold">Customer</span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ib-ink-2,inherit)] hover:bg-[var(--ib-hover,var(--muted))]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="ib-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center text-center">
          <ContactAvatar name={name} src={c.contact_avatar} platform={c.platform} size={72} />
          <div className="mt-3 font-display text-[16px] font-semibold leading-tight">{name}</div>
          {c.contact_username && (
            <div className="mt-0.5 text-[12.5px] text-[var(--ib-ink-2,inherit)]">
              @{c.contact_username}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1.5">
            <PlatformChip platform={c.platform} />
            <BrandTag brandId={c.brand_id} size="xs" />
          </div>
          <div className="mt-1.5 text-[11.5px] text-[var(--ib-ink-3,inherit)]">
            Prothom message {agoLabel(c.created_at)}
          </div>
        </div>

        {c.ad_id && (
          <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] p-2.5">
            <div className="flex items-center gap-2.5">
              {c.ad_photo ? (
                <img
                  src={c.ad_photo}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600">
                  <Megaphone className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-medium text-violet-700 dark:text-violet-300">
                  Ad theke esheche{(c.ad_count ?? 0) > 1 ? ` · ${c.ad_count} bar click` : ""}
                </div>
                <div className="truncate text-[13px] font-medium">{c.ad_title || "Message ad"}</div>
                <div className="text-[11px] text-[var(--ib-ink-3,inherit)]">
                  {c.ad_at ? agoLabel(c.ad_at) : ""}
                  {c.ad_autoreplied_at ? " · auto-reply gese" : ""}
                </div>
              </div>
            </div>
          </div>
        )}

        {savedPhone && (
          <div className="grid grid-cols-3 divide-x divide-[var(--ib-line,var(--border))] rounded-xl border border-[var(--ib-line,var(--border))] py-2.5 text-center">
            <div>
              <div className="tabular font-display text-[17px] font-semibold">{stats.count}</div>
              <div className="text-[11px] text-[var(--ib-ink-2,inherit)]">Order</div>
            </div>
            <div>
              <div className="tabular font-display text-[17px] font-semibold">
                ৳{Math.round(stats.spent).toLocaleString("en-BD")}
              </div>
              <div className="text-[11px] text-[var(--ib-ink-2,inherit)]">Kineche</div>
            </div>
            <div>
              <div
                className={cn(
                  "tabular font-display text-[17px] font-semibold",
                  stats.returnRate >= 30 && "text-rose-600 dark:text-rose-400",
                )}
              >
                {stats.returnRate}%
              </div>
              <div className="text-[11px] text-[var(--ib-ink-2,inherit)]">Return</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setOrderOpen(true)}
            title="Chat theke naam, phone, thikana, product ar color tule order banabe — inbox theke na beriye"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13.5px] font-semibold text-primary-foreground shadow-sm transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            Chat theke order banao
          </button>
          <Link
            to="/erp/orders/new"
            search={{
              phone: savedPhone || detectedPhone || undefined,
              name: c.contact_name || undefined,
              brand: c.brand_id,
              source: PLATFORM_LABEL[c.platform],
              conv: c.id,
            }}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--ib-line,var(--border))] text-[12.5px] font-medium text-[var(--ib-ink-2,inherit)] hover:bg-[var(--ib-hover,var(--muted))]"
          >
            <PlusCircle className="h-4 w-4" /> Khali order form
          </Link>
        </div>

        <div className="space-y-3">
          <div className={sectionTitle}>Contact</div>
          <div className="space-y-1.5">
            <label className="text-[11.5px] text-[var(--ib-ink-2,inherit)]">Naam</label>
            <div className="flex gap-1.5">
              <input
                value={nameEdit}
                onChange={(e) => setNameEdit(e.target.value)}
                placeholder="Customer er naam"
                className={fieldCls}
              />
              {nameEdit.trim() !== (c.contact_name ?? "") && (
                <Button
                  size="sm"
                  className="h-9 rounded-lg"
                  onClick={() => saveContact.mutate({ contact_name: nameEdit.trim() || null })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11.5px] text-[var(--ib-ink-2,inherit)]">Phone</label>
            <div className="flex gap-1.5">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01XXXXXXXXX"
                inputMode="tel"
                className={cn(fieldCls, "tabular")}
              />
              {normalizedPhone !== savedPhone && (
                <Button
                  size="sm"
                  className="h-9 rounded-lg"
                  disabled={normalizedPhone.length > 0 && normalizedPhone.length !== 11}
                  onClick={() => saveContact.mutate({ contact_phone: normalizedPhone || null })}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
          {detectedPhone && detectedPhone !== savedPhone && (
            <button
              type="button"
              onClick={() => {
                setPhone(detectedPhone);
                saveContact.mutate({ contact_phone: detectedPhone });
              }}
              className="flex w-full items-center gap-2 rounded-lg bg-[var(--ib-accent-soft,var(--muted))] px-3 py-2 text-left text-[12.5px]"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Chat e number: <span className="tabular font-semibold">{detectedPhone}</span>
              <span className="ml-auto font-semibold text-primary">Save</span>
            </button>
          )}
          <div className="flex flex-wrap gap-1.5">
            {savedPhone && (
              <a
                href={`tel:${savedPhone}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ib-line,var(--border))] px-2.5 text-[12px] font-medium hover:bg-[var(--ib-hover,var(--muted))]"
              >
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            )}
            {profileLinks(c, channel).map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--ib-line,var(--border))] px-2.5 text-[12px] font-medium hover:bg-[var(--ib-hover,var(--muted))]"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {l.label}
              </a>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className={sectionTitle}>Ager order</div>
          {!savedPhone ? (
            <div className="rounded-lg bg-[var(--ib-canvas,var(--muted))] px-3 py-2.5 text-[12px] text-[var(--ib-ink-2,inherit)]">
              Phone save korle ager order ekhane dekhabe.
            </div>
          ) : ordersQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : orders.length === 0 ? (
            <div className="rounded-lg bg-[var(--ib-canvas,var(--muted))] px-3 py-2.5 text-[12px] text-[var(--ib-ink-2,inherit)]">
              Notun customer — ei number e kono order nai.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--ib-line,var(--border))] overflow-hidden rounded-xl border border-[var(--ib-line,var(--border))]">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/erp/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-[var(--ib-hover,var(--muted))]"
                  >
                    <span className="tabular font-medium">
                      {o.invoice_no ?? o.id.slice(0, 8).toUpperCase()}
                    </span>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                      {o.status.replace(/_/g, " ")}
                    </Badge>
                    <span className="tabular ml-auto font-semibold">
                      ৳{Math.round(Number(o.total ?? 0)).toLocaleString("en-BD")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <div className={cn(sectionTitle, "flex items-center gap-1.5")}>
            <StickyNote className="h-3.5 w-3.5 text-amber-500" /> Team note
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--ib-line,var(--border))] focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && note.trim()) {
                  e.preventDefault();
                  add.mutate();
                }
              }}
              placeholder="Shudhu team dekhbe, customer na"
              rows={2}
              className="resize-none border-0 text-sm shadow-none focus-visible:ring-0"
            />
            <div className="flex justify-end border-t border-[var(--ib-line,var(--border))] px-2 py-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[12px]"
                disabled={!note.trim() || add.isPending || !userId}
                onClick={() => add.mutate()}
              >
                Note rakho
              </Button>
            </div>
          </div>
          <ul className="space-y-1.5">
            {(notesQ.data ?? []).map((n) => (
              <li
                key={n.id}
                className="group rounded-lg border-l-[3px] border-amber-400 bg-[var(--ib-amber-soft,var(--muted))] px-3 py-2 text-[12.5px]"
              >
                <div className="whitespace-pre-wrap">{n.body}</div>
                <div className="mt-1 flex items-center text-[10.5px] text-[var(--ib-ink-3,inherit)]">
                  {agoLabel(n.created_at)}
                  {(n.created_by === userId || isAdmin) && (
                    <button
                      type="button"
                      onClick={() => del.mutate(n.id)}
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <QuickOrderSheet conversation={c} open={orderOpen} onOpenChange={setOrderOpen} />
    </div>
  );
}
