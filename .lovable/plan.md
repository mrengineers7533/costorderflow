
# Model-wise Access Control (with full Admin access)

Adds two layers on top of the existing per-module access:

1. **Per-module View vs Edit** split (existing module checkbox becomes two: View, Edit).
2. **Per-document access lists** on Orders, BOQs, PIs, Purchase Orders, Requisitions — admin chooses which users can view and which can edit a specific document.

Admins always bypass both layers. Anonymous users get nothing. Enforcement happens in both UI (route/page guards, action buttons) and database (RLS policies).

## Default visibility on create

- Creator: edit access (auto-row in the document-access table).
- Admin: always full access (bypass).
- Everyone else: no access until admin adds them.

## Admin management — two surfaces

- **Inside each document**: a "Manage Access" button (Order editor, BOQ editor, PI editor, PO detail, Requisition detail) opens a dialog to add/remove users and toggle View / Edit per user.
- **Central admin screen**: new tab `Admin → Document Access` listing all documents with filters (type, number, client) and the assigned users; admin can edit lists from here too.
- **Admin → Access Control** (existing): each module row now shows two checkboxes — **View** and **Edit** — instead of one.

## Technical plan

### Database

New enum + tables (one migration):

```text
create type access_perm as enum ('view','edit');

-- 1. Module-level view/edit split
alter table public.user_module_access
  add column permission access_perm not null default 'edit';
-- existing rows = 'edit' (back-compat: prior single checkbox meant full module access)

-- 2. Per-document access (polymorphic)
create type doc_kind as enum ('order','boq','pi','purchase_order','requisition');

create table public.document_access (
  id uuid primary key default gen_random_uuid(),
  doc_kind doc_kind not null,
  doc_id   uuid not null,
  user_id  uuid not null references auth.users(id) on delete cascade,
  permission access_perm not null default 'view',
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (doc_kind, doc_id, user_id)
);
-- GRANT SELECT,INSERT,UPDATE,DELETE to authenticated; GRANT ALL to service_role.
-- RLS: admin manages all rows; users can SELECT only their own rows.

-- 3. Security-definer helpers
public.has_doc_access(_user uuid, _kind doc_kind, _doc_id uuid, _need access_perm) returns boolean
-- admin → true
-- creator of the doc → true (looked up per kind)
-- has document_access row with permission >= _need → true ('edit' implies 'view')

public.has_module_perm(_user uuid, _module text, _need access_perm) returns boolean
-- admin → true; otherwise checks user_module_access.permission
```

### RLS changes per document table

For `orders`, `boqs`, `proforma_invoices`, `purchase_orders`, `requisitions`:

- Replace existing SELECT policy with: `has_doc_access(auth.uid(), '<kind>', id, 'view')`.
- Replace existing UPDATE/DELETE policies with: `has_doc_access(..., 'edit')`.
- INSERT remains tied to authenticated module access; the creator row is added by a trigger:
  - `AFTER INSERT` trigger inserts `document_access(doc_kind, doc_id, NEW.created_by/user_id, 'edit')`.
- Cascade lookup for related tables (e.g. `boq_revisions`, `requisition_items`, `purchase_order_rows`, `proforma_invoice_documents`, `boq_design_comments`, `client_copies`) routed via their parent doc: policy uses `has_doc_access` on the parent.
- Storage buckets: keep existing token-based RPCs; no change required for this layer.

Activity, notifications, counters, audit logs are untouched.

### Frontend

- `src/lib/access/modules.ts` — extend `ModuleKey` unchanged; add `Perm = 'view'|'edit'`.
- `src/hooks/useUserAccess.ts` — return `Map<ModuleKey, Perm>` instead of `Set<ModuleKey>`; helpers `canView(m)`, `canEdit(m)`.
- New hook `useDocAccess(kind, id)` → `{ canView, canEdit, loading }` (admin/creator bypass).
- New guard `<RequireDocAccess kind id need="view|edit">` used inside detail/editor pages; when `need='edit'` and user only has view, the page renders in read-only mode (existing components already support `readOnly` flags where applicable; otherwise inputs are disabled via a context provider).
- `RequireModule` extended to take optional `need` prop (`view` default).
- Admin → Access Control screen: each module cell becomes two checkboxes (View, Edit). Edit auto-implies View.
- Admin → Document Access (new tab in `AdminTabs`): table with type filter + search; row click opens the same "Manage Access" dialog used inside documents.
- "Manage Access" dialog: user search → add → toggle view/edit → remove. Writes to `document_access`.
- Lists (`OrdersList`, `BoqList`, `PiList`, `PurchaseList`, `RequisitionsList`): rely on RLS — non-admin users will simply not see docs they can't access. No client-side filter changes needed beyond removing any stale assumptions.

### Files to add

- `supabase/migrations/<ts>_model_wise_access.sql`
- `src/lib/access/docAccess.ts` (kind constants, perm helpers)
- `src/hooks/useDocAccess.ts`
- `src/components/RequireDocAccess.tsx`
- `src/components/access/ManageDocAccessDialog.tsx`
- `src/pages/admin/AdminDocumentAccess.tsx` + tab entry in `AdminTabs`

### Files to edit

- `src/hooks/useUserAccess.ts`, `src/components/RequireModule.tsx`
- `src/pages/admin/AdminAccess.tsx` (split View/Edit columns)
- Editor/detail pages: `OrderEditor`, `BoqEditor`, `DesignBoqView`, `PiEditor`, `PurchaseDetail`, `RequisitionDetail` — wrap in `RequireDocAccess`, add "Manage Access" button (admin or doc-editor only), gate save/edit buttons by `canEdit`.

### Out of scope (unchanged)

Calculations, workflow, approval logic, notifications, acknowledgements, revision/auto-BOQ logic, PDF/print, data-saving logic beyond access checks, manufacturing screens, and all token-based public review/verification RPCs.

## Rollout / back-compat

- Existing `user_module_access` rows default to `permission='edit'` (no UX regression).
- Existing documents get a one-time backfill in the migration: insert `(doc_kind, id, creator_id, 'edit')` for every order, boq, pi, purchase_order, requisition with a known creator. Documents without a creator stay admin-only until access is granted.

## Risks

- RLS misconfiguration could hide existing user data. The migration includes the backfill above so current creators keep edit access on day one.
- Related-table policies (revisions, items, attachments) must route through parent-doc access — covered in the migration.

