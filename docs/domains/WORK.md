# DOMAIN: WORK (Tasks, Projects, Approvals, Time, Calendar)

**Purpose:** the execution layer — work is created, assigned, approved, and completed;
meeting actions and AI recommendations LAND here (no parallel task stores).

**Responsibilities:** task CRUD + assignment + due dates, project delivery, approval
engine (start_approval_protocol, route_work), attendance/geofencing (clock in/out,
field visits), time tracking, calendar events.

**Entities:** tasks, projects, approvals + approval_actions, attendance_records +
attendance_policies + business_locations + attendance_events + field_visits(+events),
time_entries, events.

**States:** task pending → in_progress → completed/cancelled; approval pending →
approved/rejected (audit via approval_actions BEFORE status update — ordering matters);
attendance verified/outside_geofence/unverified; field visit lifecycle with
idempotent client_event_id.

**User flows:** create task (ALL staff can create — canCreate; management actions
stay canManage); approvals inbox with one-tap decisions; clock-in geofence-verified
(server-authoritative); offline presence queue syncs on reconnect.

**Permissions:** task visibility business-scoped RLS; approvals decided by the
routed approver (NOT the requester — the Session-5 trigger fix); attendance writes
server-verified.

**Database:** 004 (tasks), 039 (approvals engine), 007 (automations execute real
task/notification writes), PR #15 presence (attendance geofencing, postgis-guarded).

**APIs:** start_approval_protocol, route_work, clock_in_staff/clock_out_staff,
create_field_visit/start/complete (all idempotent), create_action_task (meeting
actions → real tasks).

**Events:** TaskCompleted, ProjectDelayed on the business bus; tasks.created on the
platform bus.

**Notifications:** approval requests + task assignments via canonical notifications.

**Analytics:** tasks feed workload/capacity intelligence + OPS-001 overload rule.

**AI interaction:** accepted recommendations create real tasks (linked_action_id);
capture pipeline creates tasks from intents.

**Failure states:** approval audit-insert failure surfaces a visible warning (the
audit trail must never be silently missing); geofence failure → unverified (honest),
never verified-by-default.

**Recovery:** automation retry + dead-letter queue (automation_runs with exponential
backoff 30s/2m/8m, max 3, revive RPC); offline presence queue replays.

**Security:** geofence verification is server-side; presence writes carry
verification_status — never trusted from the client.

**Accessibility:** kanban/list keyboard operable; modals labeled.

**Performance:** tasks index (business_id,status,due_date); attendance queries
indexed.

**Tests:** approval threshold suite (8); platformResilience suite (backoff, DLQ);
meeting action→task linking tests.

**Definition of Done:** work flows from any source (human, meeting, AI, automation)
into ONE task system with auditable approvals and honest status.
