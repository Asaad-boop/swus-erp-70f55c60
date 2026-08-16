# Advanced Users & Access — single reliable control center

## Goal
Users & Access শুধু **HRM → Users & Access** (`/erp/hr/access`) পেজে থাকবে। Settings-এর duplicate “Users” entry সরিয়ে এই screen-কে staff login, roles, brands, page permissions, employee linking ও security-এর একমাত্র source of truth করা হবে।

## What will change

### 1. Fix the access model and current live-data failures
- Current live data-তে brand access থাকা ১৩ user-এর মধ্যে ৯ জনের কোনো staff role নেই; role ছাড়া brand assignment ERP entry দেয় না। Editor-এ এই invalid state আর save হতে দেওয়া হবে না।
- পুরোনো/renamed routes permission JSON-এ আছে (`/erp/hr/attendance/muster`, `/erp/hr/reports`, `/erp/hr/leave`, `/erp/hr/staff` ইত্যাদি)। Save/read-এর সময় canonical route validation ও stale-path cleanup হবে।
- “No brands selected” বর্তমানে UI-তে “all brands” বলা হলেও database enforcement-এ “no brand access”; এই contradiction দূর করে explicit access scope (`all` বনাম selected brands) রাখা হবে।
- Existing affected staff records safe migration/backfill দিয়ে valid state-এ আনা হবে; admin records অপরিবর্তিত থাকবে।

### 2. One atomic access profile per user
- আলাদা আলাদা role/brand/page mutation বাদ দিয়ে একটি transactional admin operation হবে: role(s), brand scope, page mode, explicit pages এবং employee link একসাথে validate + save। মাঝপথে failure হলে partial access তৈরি হবে না।
- Access profile read-ও এক server function থেকে হবে, যাতে UI আলাদা query merge করে inconsistent snapshot না দেখায়।
- Admin নিজের শেষ admin access remove/delete/disable করতে পারবে না; at least one active admin safeguard থাকবে।
- Every mutation server-side admin verification, strict role enum, known page allowlist, valid brand IDs, duplicate employee-link guard এবং audit metadata enforce করবে।

### 3. Advanced access workspace UI
- Dense master/detail layout: বামে searchable staff directory, status/role/brand/access-mode filters; ডানে selected user access profile।
- Overview header-এ login state, last sign-in, employee link, effective roles, brands এবং effective page count দেখা যাবে।
- **Access template / Roles:** multi-role presets, role descriptions এবং effective module preview।
- **Brands:** explicit “All brands” অথবা selected brands; ambiguous empty state থাকবে না।
- **Pages:** দুই mode — “Role defaults” এবং “Custom access”; grouped permission tree, search, section select, hidden/detail routes, stale route warning, effective-access preview এবং reset।
- **Employee & Security:** employee link, enable/disable, password reset link, direct password change, delete with confirmation।
- Single sticky review/save bar থাকবে; unsaved changes, validation errors ও change summary save-এর আগেই দেখাবে।
- User creation wizard-এ identity → employee link → roles/template → brands → page mode → review; incomplete/roleless staff তৈরি হতে পারবে না।

### 4. Make changes take effect immediately everywhere
- Route gate, sidebar, role hook এবং brand provider একটি shared “my access profile” query ব্যবহার করবে; duplicate browser reads সরানো হবে।
- Permission change হলে affected user's next navigation/window-focus-এ fresh profile fetch হবে; current admin UI cache সঙ্গে সঙ্গে refresh হবে।
- Sidebar visibility, direct URL gate এবং first-allowed landing একই resolver ব্যবহার করবে। Unknown ERP routes fail closed হবে; admin bypass থাকবে।
- Restricted brand list BrandProvider-এ enforce হবে, তাই brand picker-এ unauthorized brand দেখা যাবে না এবং `all` শুধু allowed brands বোঝাবে।

### 5. Remove duplicate management surface
- Settings থেকে “Users” navigation section এবং redirect card সরানো হবে। Users & Access শুধু HRM navigation-এ থাকবে।
- Catalog/nav-কে canonical source রেখে active route coverage test যোগ হবে, যাতে নতুন ERP page permission editor থেকে missing না হয়।

## Technical details
- Existing `user_roles`, `user_brand_access`, `staff_permissions` tables retained; `staff_permissions.permissions`-এ versioned normalized access document রাখা হবে (`pageMode`, `allowedPages`, `brandMode`) for backward compatibility.
- Transactional database function/admin server wrapper access profile replace করবে এবং audit log লিখবে; schema/RLS grants existing security model অনুযায়ী থাকবে।
- `createServerFn` files thin wrapper থাকবে; validation/constants/helpers পৃথক runtime-safe modules-এ যাবে।
- Automated tests: exact/prefix/detail route resolution, role-default vs custom mode, stale paths, all/selected brands, roleless prevention, last-admin safety, sidebar/gate parity এবং atomic rollback.
- Browser verification: admin create/edit flow এবং a restricted non-admin session দিয়ে allowed page open, denied direct URL, sidebar filtering ও brand filtering যাচাই।
