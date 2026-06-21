import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  addFounderInteraction,
  deleteFounderContact,
  getFounderCrm,
  saveFounderContact,
  type FounderCrmContact,
  type FounderCrmInteraction,
  type FounderCrmOverview,
} from "../api/client";
import { CyberPanel } from "../components/cyber/CyberPanel";
import { useI18n } from "../i18n";

type FilterKey = "all" | "person" | "investor" | "customer";

const EMPTY_CONTACT: FounderCrmContact = {
  name: "",
  category: "person",
  company: "",
  role: "",
  status: "active",
  priority: "medium",
  preferred_channel: "email",
  tags: [],
  notes: "",
  last_contact_at: "",
  next_follow_up_at: "",
};

function toInputDateTime(value?: string | null) {
  if (!value) return "";
  return value.replace(" ", "T").slice(0, 16);
}

function fromInputDateTime(value: string) {
  return value ? value.replace("T", " ") + ":00" : null;
}

function formatStamp(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  const parsed = new Date(value.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function FounderCrmView() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<FounderCrmOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<FounderCrmContact>(EMPTY_CONTACT);
  const [interactionText, setInteractionText] = useState("");

  async function load() {
    setLoading(true);
    try {
      const overview = await getFounderCrm();
      setData(overview);
      setError(null);
      setSelectedId((current) => current ?? overview.contacts[0]?.id ?? "new");
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredContacts = useMemo(() => {
    const contacts = data?.contacts ?? [];
    if (filter === "all") return contacts;
    return contacts.filter((contact) => contact.category === filter);
  }, [data?.contacts, filter]);

  const selectedContact = useMemo(() => {
    if (selectedId === "new") return null;
    return data?.contacts.find((contact) => contact.id === selectedId) ?? null;
  }, [data?.contacts, selectedId]);

  useEffect(() => {
    if (selectedId === "new") {
      setDraft(EMPTY_CONTACT);
      return;
    }
    if (selectedContact) {
      setDraft({
        ...selectedContact,
        company: selectedContact.company ?? "",
        role: selectedContact.role ?? "",
        preferred_channel: selectedContact.preferred_channel ?? "",
        notes: selectedContact.notes ?? "",
        last_contact_at: selectedContact.last_contact_at ?? "",
        next_follow_up_at: selectedContact.next_follow_up_at ?? "",
      });
    }
  }, [selectedContact, selectedId]);

  const selectedInteractions = useMemo(() => {
    if (!selectedContact) return [];
    return (data?.recent_interactions ?? []).filter(
      (interaction) => interaction.contact_id === selectedContact.id,
    );
  }, [data?.recent_interactions, selectedContact]);

  async function onSave() {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const saved = await saveFounderContact({
        ...draft,
        company: draft.company?.trim() || null,
        role: draft.role?.trim() || null,
        preferred_channel: draft.preferred_channel?.trim() || null,
        notes: draft.notes,
        tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
        last_contact_at: fromInputDateTime(draft.last_contact_at ?? ""),
        next_follow_up_at: fromInputDateTime(draft.next_follow_up_at ?? ""),
      });
      await load();
      if (saved.id) setSelectedId(saved.id);
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedContact?.id) return;
    const confirmed = window.confirm(t("crm.deleteConfirm", { name: selectedContact.name }));
    if (!confirmed) return;
    setSaving(true);
    try {
      await deleteFounderContact(selectedContact.id);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onAddInteraction() {
    if (!selectedContact?.id || !interactionText.trim()) return;
    setSaving(true);
    try {
      await addFounderInteraction({
        contact_id: selectedContact.id,
        kind: "note",
        summary: interactionText.trim(),
        happened_at: new Date().toISOString().slice(0, 19).replace("T", " "),
        source: "manual",
      } satisfies FounderCrmInteraction);
      setInteractionText("");
      await load();
    } catch (e) {
      setError(typeof e === "string" ? e : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <section className="td-panel p-6 founder-crm-empty">{t("crm.loading")}</section>;
  }

  return (
    <div className="founder-crm-page">
      <section className="founder-crm-hero td-panel">
        <div>
          <p className="founder-crm-kicker">{t("crm.kicker")}</p>
          <h3 className="founder-crm-headline">{t("crm.headline")}</h3>
          <p className="founder-crm-subline">{t("crm.subline")}</p>
        </div>
        <div className="founder-crm-hero-meta">
          <div>
            <span>{t("crm.problemLabel")}</span>
            <strong>{t("crm.problem")}</strong>
          </div>
          <div>
            <span>{t("crm.signalLabel")}</span>
            <strong>{data?.suggested_prompt}</strong>
          </div>
        </div>
      </section>

      {error && <div className="founder-crm-error">{error}</div>}

      <section className="founder-crm-metrics">
        <MetricCard label={t("crm.metrics.total")} value={String(data?.summary.total_contacts ?? 0)} tone="cyan" />
        <MetricCard label={t("crm.metrics.people")} value={String(data?.summary.people_met ?? 0)} tone="green" />
        <MetricCard label={t("crm.metrics.investors")} value={String(data?.summary.investors ?? 0)} tone="amber" />
        <MetricCard label={t("crm.metrics.customers")} value={String(data?.summary.customers ?? 0)} tone="magenta" />
        <MetricCard label={t("crm.metrics.overdue")} value={String(data?.summary.overdue_followups ?? 0)} tone="amber" />
        <MetricCard label={t("crm.metrics.week")} value={String(data?.summary.due_this_week ?? 0)} tone="cyan" />
      </section>

      <div className="founder-crm-grid">
        <CyberPanel title={t("crm.queueTitle")} subtitle={t("crm.queueDesc")} glow="amber" className="founder-crm-column">
          <div className="founder-crm-filter-row">
            {(["all", "person", "investor", "customer"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`founder-crm-filter ${filter === key ? "is-active" : ""}`}
              >
                {t(`crm.filters.${key}`)}
              </button>
            ))}
            <button type="button" onClick={() => setSelectedId("new")} className="founder-crm-filter founder-crm-add">
              {t("crm.newContact")}
            </button>
          </div>

          <div className="founder-crm-contact-list">
            {filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelectedId(contact.id ?? null)}
                className={`founder-crm-contact-card ${selectedContact?.id === contact.id ? "is-active" : ""}`}
              >
                <div className="founder-crm-contact-top">
                  <div>
                    <strong>{contact.name}</strong>
                    <p>{[contact.company, contact.role].filter(Boolean).join(" · ") || t("crm.noCompany")}</p>
                  </div>
                  <span className={`founder-crm-priority priority-${contact.priority}`}>{contact.priority}</span>
                </div>
                <div className="founder-crm-contact-meta">
                  <span>{t(`crm.filters.${contact.category}`)}</span>
                  <span>{contact.status}</span>
                  <span>{contact.preferred_channel || "-"}</span>
                </div>
                <p className="founder-crm-ai-nudge">{contact.ai_nudge}</p>
              </button>
            ))}
            {filteredContacts.length === 0 && <p className="founder-crm-empty">{t("crm.emptyContacts")}</p>}
          </div>
        </CyberPanel>

        <CyberPanel
          title={selectedId === "new" ? t("crm.createTitle") : selectedContact?.name || t("crm.detailTitle")}
          subtitle={selectedId === "new" ? t("crm.createDesc") : selectedContact?.ai_nudge}
          glow="cyan"
          className="founder-crm-column"
          headerRight={
            selectedId !== "new" ? (
              <button type="button" onClick={onDelete} className="founder-crm-inline-action danger" disabled={saving}>
                {t("crm.delete")}
              </button>
            ) : undefined
          }
        >
          <div className="founder-crm-form">
            <div className="founder-crm-form-grid">
              <Field label={t("crm.fields.name")}>
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t("crm.fields.category")}>
                <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  <option value="person">{t("crm.filters.person")}</option>
                  <option value="investor">{t("crm.filters.investor")}</option>
                  <option value="customer">{t("crm.filters.customer")}</option>
                </select>
              </Field>
              <Field label={t("crm.fields.company")}>
                <input value={draft.company ?? ""} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
              </Field>
              <Field label={t("crm.fields.role")}>
                <input value={draft.role ?? ""} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              </Field>
              <Field label={t("crm.fields.status")}>
                <input value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} />
              </Field>
              <Field label={t("crm.fields.priority")}>
                <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                  <option value="critical">{t("crm.priorities.critical")}</option>
                  <option value="high">{t("crm.priorities.high")}</option>
                  <option value="medium">{t("crm.priorities.medium")}</option>
                  <option value="low">{t("crm.priorities.low")}</option>
                </select>
              </Field>
              <Field label={t("crm.fields.channel")}>
                <input
                  value={draft.preferred_channel ?? ""}
                  onChange={(e) => setDraft({ ...draft, preferred_channel: e.target.value })}
                />
              </Field>
              <Field label={t("crm.fields.tags")}>
                <input
                  value={draft.tags.join(", ")}
                  onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",") })}
                />
              </Field>
              <Field label={t("crm.fields.lastContact")}>
                <input
                  type="datetime-local"
                  value={toInputDateTime(draft.last_contact_at)}
                  onChange={(e) => setDraft({ ...draft, last_contact_at: e.target.value })}
                />
              </Field>
              <Field label={t("crm.fields.followUp")}>
                <input
                  type="datetime-local"
                  value={toInputDateTime(draft.next_follow_up_at)}
                  onChange={(e) => setDraft({ ...draft, next_follow_up_at: e.target.value })}
                />
              </Field>
            </div>
            <Field label={t("crm.fields.notes")}>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={5} />
            </Field>
            <div className="founder-crm-actions">
              <button type="button" onClick={onSave} className="founder-crm-primary" disabled={saving}>
                {saving ? t("common.saving") : t("crm.save")}
              </button>
              <button type="button" onClick={() => setSelectedId("new")} className="founder-crm-secondary">
                {t("crm.newContact")}
              </button>
            </div>
          </div>
        </CyberPanel>

        <div className="founder-crm-side">
          <CyberPanel title={t("crm.remindersTitle")} subtitle={t("crm.remindersDesc")} glow="magenta">
            <div className="founder-crm-reminders">
              {(data?.reminders ?? []).slice(0, 6).map((reminder) => (
                <button
                  key={`${reminder.contact_id}-${reminder.next_follow_up_at}`}
                  type="button"
                  onClick={() => setSelectedId(reminder.contact_id)}
                  className="founder-crm-reminder-item"
                >
                  <div className="founder-crm-reminder-head">
                    <strong>{reminder.name}</strong>
                    <span>{formatStamp(reminder.next_follow_up_at, locale)}</span>
                  </div>
                  <p>{reminder.ai_nudge}</p>
                </button>
              ))}
              {(!data?.reminders || data.reminders.length === 0) && (
                <p className="founder-crm-empty">{t("crm.emptyReminders")}</p>
              )}
            </div>
          </CyberPanel>

          <CyberPanel title={t("crm.interactionsTitle")} subtitle={t("crm.interactionsDesc")} glow="green">
            <div className="founder-crm-interaction-composer">
              <textarea
                rows={3}
                value={interactionText}
                onChange={(e) => setInteractionText(e.target.value)}
                placeholder={t("crm.interactionPlaceholder")}
                disabled={!selectedContact}
              />
              <button type="button" onClick={onAddInteraction} className="founder-crm-primary" disabled={!selectedContact || saving}>
                {t("crm.addInteraction")}
              </button>
            </div>
            <div className="founder-crm-interaction-list">
              {(selectedContact ? selectedInteractions : data?.recent_interactions ?? []).map((interaction) => (
                <article key={interaction.id} className="founder-crm-interaction-item">
                  <div className="founder-crm-reminder-head">
                    <strong>{interaction.contact_name}</strong>
                    <span>{formatStamp(interaction.happened_at, locale)}</span>
                  </div>
                  <p>{interaction.summary}</p>
                </article>
              ))}
              {(selectedContact ? selectedInteractions.length === 0 : !data?.recent_interactions.length) && (
                <p className="founder-crm-empty">{t("crm.emptyInteractions")}</p>
              )}
            </div>
          </CyberPanel>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`founder-crm-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="founder-crm-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
