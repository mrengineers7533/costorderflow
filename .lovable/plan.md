## Move account menu to top-right header

Relocate the user info, Admin Panel link, and Sign out action from the sidebar footer into a Google-style avatar dropdown in the top app header. Sidebar logic is otherwise untouched.

### Changes

**1. `src/components/AppLayout.tsx`**
- Add a new `UserMenu` next to `GlobalSearch` / `ActivityBell` on the right side of the header.
- Pass the existing `user` prop into it.

**2. New `src/components/UserMenu.tsx`**
- Trigger: round avatar button (initials, same logic as current sidebar card) on the top-right.
- Uses shadcn `DropdownMenu` (Radix) — closes on outside click and Esc by default; responsive.
- Content:
  - Header block: full name (via `useProfileName`) and email (muted).
  - `DropdownMenuSeparator`.
  - "Admin Panel" item — visible only when `useUserRole(user.id).isAdmin`; navigates to `/admin` via `react-router`'s `useNavigate` (same destination as current sidebar link).
  - "Sign out" item — calls `supabase.auth.signOut()` (same call as current sidebar button), styled with destructive color.
- No changes to auth, role, or routing logic.

**3. `src/components/AppSidebar.tsx`**
- Remove the footer user card, the Admin Panel menu item, and the Sign out menu item.
- Keep the collapse/expand toggle button in the footer.
- Imports cleaned up (`supabase`, `useProfileName`, `LogOut`, `ShieldCheck` removed if unused after edit).

### Out of scope
- No business-logic changes, no permission/role changes, no new routes, no sidebar visual redesign beyond removing the moved items.
