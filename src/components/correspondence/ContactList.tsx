/**
 * components/correspondence/ContactList.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * The registry: who this project corresponds with, and how well each way of
 * reaching them is actually known.
 *
 * THE UNIT IS THE CHANNEL, NOT THE CONTACT
 * A contact's useful state is not a single value: an organisation can have a
 * correct phone number and a dead email, and a body that only accepts portal
 * submissions has neither. So every row shows its channels individually, and the
 * verification control lives on the channel. The row's summary ("2 unverified") is
 * derived, never stored — which is what stops the UI and the data disagreeing.
 *
 * WHY THE STATUS CONTROL CYCLES RATHER THAN OPENING A MENU
 * There are exactly three states and they are a small ordered set (unverified →
 * verified → bounced). A dropdown per channel would put a popover in a list of
 * dozens of rows and bury a one-click action; a cycling button keeps it inline,
 * keyboard reachable, and its `title` names the state it will move to. The
 * unverified state is drawn dashed — the same convention the harvest grid uses for
 * "not confirmed yet" — so an unverified channel is visible without reading.
 *
 * Editing is inline and deliberate: a row enters edit mode, and saving writes one
 * contact and its changed channels. Values are canonicalised in main, so an email
 * typed in capitals still deduplicates against one that was not.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import {
  CheckIcon,
  GlobeIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  RotateCcwIcon,
  Share2Icon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import {
  CHANNEL_LABELS,
  CONTACT_CHANNEL_KINDS,
  VERIFICATION_LABELS,
  type ChannelVerification,
  type ContactChannel,
  type ContactChannelKind,
  type ContactWithChannels,
} from '@/main/ipc/channels';
import { useContacts, useCorrespondenceCounts } from '@/hooks/use-correspondence';

/** One glyph per channel, so a row is scannable without reading the kind label. */
const CHANNEL_ICON: Record<ContactChannelKind, typeof MailIcon> = {
  email: MailIcon,
  phone: PhoneIcon,
  portal: GlobeIcon,
  postal: MapPinIcon,
  social: Share2Icon,
  manual: RotateCcwIcon,
};

/** The next state a click moves this channel to. */
const NEXT_VERIFICATION: Record<ChannelVerification, ChannelVerification> = {
  unverified: 'verified',
  verified: 'bounced',
  bounced: 'unverified',
};

export interface ContactListProps {
  projectId: string | null;
  /** Called when the user asks for more contacts — opens Harvest. */
  onHarvest: () => void;
}

export function ContactList({ projectId, onHarvest }: ContactListProps) {
  const {
    contacts,
    loading,
    saveContact,
    deleteContact,
    saveChannel,
    deleteChannel,
    setChannelVerified,
  } = useContacts(projectId);
  const counts = useCorrespondenceCounts(projectId);
  const [adding, setAdding] = useState(false);

  const totals = counts.data ?? { contacts: 0, channels: 0, unverified: 0 };
  const unverifiedHere = contacts.reduce(
    (sum, contact) =>
      sum + contact.channels.filter((c) => c.verified === 'unverified').length,
    0,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {/* Readout: what the registry knows, and what it does not. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>
            {unverifiedHere} unverified way
            {unverifiedHere === 1 ? '' : 's'} of reaching them
          </span>
          {totals.unverified > unverifiedHere && (
            <Badge
              variant="outline"
              className="text-[10px]"
              title="Unverified channels belonging to contacts outside this project scope"
            >
              {totals.unverified - unverifiedHere} more outside this project
            </Badge>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={onHarvest}
            >
              <PlusIcon className="size-3.5" />
              Harvest more
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setAdding(true)}
            >
              <PlusIcon className="size-3.5" />
              Add contact
            </Button>
          </div>
        </div>

        {loading && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            <Loader2Icon className="mr-1 inline size-3 animate-spin" />
            Loading contacts…
          </p>
        )}

        {adding && (
          <ContactEditor
            projectId={projectId}
            onCancel={() => setAdding(false)}
            onSave={async (input) => {
              await saveContact(input);
              setAdding(false);
            }}
          />
        )}

        {!loading && contacts.length === 0 && !adding && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No contacts in this scope yet.
          </p>
        )}

        <ul className="flex flex-col gap-1.5">
          {contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              onSaveContact={(patch) =>
                saveContact({ id: contact.id, name: contact.name, ...patch })
              }
              onDelete={() => deleteContact(contact.id)}
              onSaveChannel={saveChannel}
              onDeleteChannel={deleteChannel}
              onCycleVerification={(channel) =>
                setChannelVerified(
                  channel.id,
                  NEXT_VERIFICATION[channel.verified],
                )
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── One contact ──────────────────────────────────────────────────────────────

interface ContactRowProps {
  contact: ContactWithChannels;
  onSaveContact: (patch: {
    name?: string;
    role?: string;
    notes?: string;
  }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onSaveChannel: (input: {
    id?: string;
    contactId: string;
    kind: ContactChannelKind;
    value: string;
    label?: string;
  }) => Promise<ContactChannel>;
  onDeleteChannel: (id: string) => Promise<boolean>;
  onCycleVerification: (channel: ContactChannel) => Promise<unknown>;
}

function ContactRow({
  contact,
  onSaveContact,
  onDelete,
  onSaveChannel,
  onDeleteChannel,
  onCycleVerification,
}: ContactRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [role, setRole] = useState(contact.role);
  const [addingChannel, setAddingChannel] = useState(false);

  const unverified = contact.channels.filter(
    (c) => c.verified === 'unverified',
  ).length;

  if (editing) {
    return (
      <li>
        <ContactEditor
          projectId={contact.project_id}
          initial={{ id: contact.id, name, role }}
          onCancel={() => {
            setName(contact.name);
            setRole(contact.role);
            setEditing(false);
          }}
          onSave={async (input) => {
            await onSaveContact({ name: input.name, role: input.role });
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="group flex flex-col gap-1.5 rounded-lg border border-border/60 px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {contact.name}
          </span>
          {contact.role && (
            <span className="block truncate text-[11px] text-muted-foreground">
              {contact.role}
            </span>
          )}
        </span>

        {contact.kind === 'person' && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            Person
          </Badge>
        )}

        {unverified > 0 && (
          <Badge
            variant="outline"
            className="shrink-0 text-[10px]"
            title="Some ways of reaching this contact have not been checked"
          >
            {unverified} to check
          </Badge>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
          title="Edit this contact"
          onClick={() => setEditing(true)}
        >
          <PencilIcon className="size-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
          title="Delete this contact"
          onClick={() => void onDelete()}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>

      <ul className="flex flex-col gap-1">
        {contact.channels.map((channel) => {
          const Icon = CHANNEL_ICON[channel.kind];
          return (
            <li
              key={channel.id}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2 py-1',
                channel.verified === 'unverified'
                  ? 'border-dashed border-border'
                  : channel.verified === 'bounced'
                    ? 'border-destructive/40 bg-destructive/5'
                    : 'border-border/60',
              )}
            >
              <Icon className="size-3 shrink-0 text-muted-foreground" />
              <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                {CHANNEL_LABELS[channel.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px]">
                {channel.value}
              </span>

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-6 shrink-0 gap-1 px-1.5 text-[10px]',
                  channel.verified === 'unverified' &&
                    'text-muted-foreground',
                  channel.verified === 'bounced' && 'text-destructive',
                )}
                title={`${VERIFICATION_LABELS[channel.verified]} — click to mark as ${VERIFICATION_LABELS[NEXT_VERIFICATION[channel.verified]].toLowerCase()}`}
                onClick={() => void onCycleVerification(channel)}
              >
                {channel.verified === 'verified' && (
                  <CheckIcon className="size-3" />
                )}
                {channel.verified === 'bounced' && (
                  <TriangleAlertIcon className="size-3" />
                )}
                {VERIFICATION_LABELS[channel.verified]}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                title="Remove this channel"
                onClick={() => void onDeleteChannel(channel.id)}
              >
                <XIcon className="size-3" />
              </Button>
            </li>
          );
        })}
      </ul>

      {addingChannel ? (
        <ContactEditor
          projectId={contact.project_id}
          mode="channel"
          contactId={contact.id}
          onCancel={() => setAddingChannel(false)}
          onSave={async () => setAddingChannel(false)}
          onSaveChannel={onSaveChannel}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-fit gap-1 px-1.5 text-[11px] text-muted-foreground"
          onClick={() => setAddingChannel(true)}
        >
          <PlusIcon className="size-3" />
          Add a way to reach them
        </Button>
      )}
    </li>
  );
}

// ─── Editors ──────────────────────────────────────────────────────────────────

interface ContactEditorProps {
  projectId: string | null;
  initial?: { id: string; name: string; role: string };
  onCancel: () => void;
  onSave: (input: {
    projectId: string | null;
    name: string;
    role: string;
  }) => Promise<unknown>;
  /** Channel mode: the editor collects a kind + value for an existing contact. */
  mode?: 'contact' | 'channel';
  contactId?: string;
  onSaveChannel?: (input: {
    contactId: string;
    kind: ContactChannelKind;
    value: string;
  }) => Promise<ContactChannel>;
}

/**
 * Inline create/edit form. Shared by "add contact" and "add a channel" because
 * both are the same two-field shape and two components would drift.
 */
function ContactEditor({
  projectId,
  initial,
  onCancel,
  onSave,
  mode = 'contact',
  contactId,
  onSaveChannel,
}: ContactEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [kind, setKind] = useState<ContactChannelKind>('email');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'channel') {
        if (!value.trim() || !contactId || !onSaveChannel) return;
        await onSaveChannel({ contactId, kind, value: value.trim() });
        await onSave();
        return;
      }
      if (!name.trim()) return;
      await onSave({ projectId, name: name.trim(), role: role.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      {mode === 'contact' ? (
        <>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Organisation or person"
            aria-label="Name"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (optional)"
            aria-label="Role"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </>
      ) : (
        <div className="flex items-center gap-1.5">
          <NativeSelect
            size="sm"
            className="w-24 shrink-0"
            value={kind}
            aria-label="Channel kind"
            onChange={(e) => setKind(e.target.value as ContactChannelKind)}
          >
            {CONTACT_CHANNEL_KINDS.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {CHANNEL_LABELS[option]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="name@example.org"
            aria-label="Channel value"
            className="h-7 flex-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
              if (e.key === 'Escape') onCancel();
            }}
          />
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={saving}
          onClick={() => void submit()}
        >
          {saving && <Loader2Icon className="size-3.5 animate-spin" />}
          {mode === 'channel' ? 'Add channel' : initial ? 'Save' : 'Add contact'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
