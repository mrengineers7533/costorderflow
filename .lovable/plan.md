## What's actually happening

The database is behaving correctly, not hiding data by mistake. Every OA, BOQ, PI, Purchase Order and Requisition is protected by a per-document access rule:

A signed-in user can only see a document if **one** of these is true:
1. They are an **admin**.
2. They are the **creator** of that document.
3. They have been explicitly **granted access** to that specific document in **Admin → Document Access**.

Giving a user "BOQs (view)" or "OA (edit)" module permission only unlocks the **page/menu** — it does not, by itself, reveal any documents. This matches the visibility rule you just confirmed: "Only documents shared with them."

I checked the data. Every non-admin user I saw (`design@…`, `office.*@…`, `purchase.1@…`, `project.1@…`, etc.) has:
- `orders_created = 0`, `boqs_created = 0`, `pis_created = 0`
- `docs_shared = 0` in `document_access` (one exception: `bhavesh@…` has 1)

So their lists are empty because nothing has been shared with them yet — not because of a bug.

## What I propose to build

To make sharing practical (right now Admin → Document Access is one-doc-at-a-time), add bulk tools. No RLS changes, no change to who-can-see-what rules.

### 1. Bulk share in Admin → Document Access
On the existing document list, add:
- Checkboxes on each row + a "Select all on page" checkbox.
- A "Share selected…" button that opens a dialog to pick one or more users and a permission (`view` / `edit`) and writes `document_access` rows for every selected doc × user.
- A "Revoke selected…" action to remove those grants.

### 2. Per-user "Grant access" panel in Admin → Users
On each user row, a "Manage access" button opening a dialog with tabs per document kind (OA / BOQ / PI / PO / Requisition). Admin filters/searches, ticks documents, picks permission, saves — inserts `document_access` rows in one go.

### 3. Optional convenience toggle (off by default)
In Admin → Settings, a checkbox: **"Auto-share new documents with everyone who has that module's view permission."**
When on, a database trigger inserts `document_access` rows on `INSERT` into `orders` / `boqs` / `proforma_invoices` / `purchase_orders` / `requisitions` for every user that currently has module view perm for the relevant module. Off by default so the rule you chose ("only docs shared with them") stays the default; admins can opt in if they want new docs auto-visible to the team.

### 4. Small UX touch on empty lists
On BOQ / OA / PI / PO / Requisition lists, when the signed-in user is non-admin and sees zero rows, show a one-line hint: "No documents have been shared with you yet. Ask an admin to grant access in Admin → Document Access."

## Technical notes

- All writes go to the existing `public.document_access` table `(doc_kind, doc_id, user_id, permission)`. No schema changes needed for items 1, 2, 4.
- Item 3 needs one migration: an `app_settings` key `auto_share_module_view` (boolean) plus AFTER INSERT triggers on the five document tables that read that setting and fan out `document_access` rows. Triggers are `SECURITY DEFINER` with `search_path = public` and are idempotent (`ON CONFLICT DO NOTHING`).
- No changes to RLS policies, `has_doc_access`, notifications, approvals, module permissions, or any existing workflow.

## What I will NOT do

- Change RLS so module permission alone reveals documents (you rejected that option).
- Change creator-detection, approval flow, notifications, or Design/Manufacturing/Purchase logic.
- Touch existing single-doc "Manage access" dialogs — they stay.

Confirm and I'll build items 1, 2, and 4 first. Tell me if you also want item 3 (the auto-share toggle) in the same pass.
