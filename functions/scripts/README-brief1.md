# Brief 1 — import the 104 rugby schools

Loads every school in `brief1_schools_manifest.json` into MatchPulse's central
Organisation directory (the `(default)` database), re-hosts each logo into our
own Storage bucket, and activates each school for **rugby**.

The script uses the **Admin SDK**, so it bypasses Firestore security rules by
design. It must run somewhere with **both** Admin credentials **and** normal
internet (to reach `rugbyignite.co.za` for the logos) — i.e. **your Cloud
Shell**, not the web-session sandbox (that sandbox's network policy blocks
`rugbyignite.co.za`, which is why the logos couldn't be bundled).

## Run it

```bash
cd ~/Match-Pulse
git pull
cd functions
npm install                 # ensures firebase-admin is present

# Cloud Shell already has Application Default Credentials. Elsewhere:
#   gcloud auth application-default login

# 1) Preview — writes nothing, prints the full plan:
node scripts/brief1-import-schools.mjs --dry-run

# 2) Apply (idempotent — safe to re-run):
node scripts/brief1-import-schools.mjs
```

### Options
- `--dry-run` — plan only, no writes.
- `--owner <uid>` — owner for the created records. Defaults to the first
  `platformAdmin` user (you). The admin owns these central records until a
  verified school rep is transferred in.
- `--limit <n>` — process only the first n rows (smoke test, e.g. `--limit 3`).
- `--skip-logos` — create/reconcile records without fetching logos (fill later).

## What it does per school
1. Creates an Organisation (`name`, `type: school`, `region` = province,
   `website`), or reconciles an existing one matched by normalised name.
2. Reserves its platform-wide slug in `orgSlugs`.
3. Downloads the logo from `logo_url` and uploads it to `org-logos/{orgId}` in
   our bucket, storing a Firebase download URL on `logoUrl` (never a hotlink).
4. Activates rugby: copies identity into the `rugby` database and stamps
   `activatedSports.rugby` centrally — exactly what the in-app "Activate" does.

Province: the five curated buckets. `Klerksdorp Hoërskool` (no suggestion) is
set to **Gauteng**, matching how the manifest already folds the other North
West schools. Six schools have no website in the manifest — left blank.

## Idempotency & re-runs
Re-running matches schools by normalised name, so it never creates a duplicate;
it reconciles the name/province/website, ensures a logo, and ensures rugby is
active. Logos already hosted in our bucket are not re-fetched.

## Output
Writes `scripts/brief1_import_result.json` — a `team_id → orgId → slug` map.
`team_id` is **not** stored on the org (the brief forbids new fields); this file
is the handoff artifact **Brief 2** (matches) uses to resolve teams to orgs.

## Verify when done
- Admin → the schools list shows the 104 (alphabetical), each with a logo.
- `/organizations` (public) lists them once Home Ground is active; the rugby
  product shows all 104 as available.
- Spot-check a couple of logos load, and that provinces read correctly.
