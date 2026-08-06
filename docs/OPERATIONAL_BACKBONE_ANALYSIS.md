# Operational Backbone Analysis
## What's Missing for a Complete Business Management System

---

## Executive Summary

An operational backbone is the **core infrastructure** that makes a business management system actually *operational*. It's what turns a collection of features into a **working business**.

**Current Status:** We have features. We need **integration, automation, and operational workflows**.

---

## The 5 Pillars of Operational Backbone

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATIONAL BACKBONE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│   │ PEOPLE  │  │ PROCESS │  │FINANCE │  │ASSETS  │     │
│   │ & ORGS  │  │  & FLOW │  │ & BUDGET│  │ & STOCK │     │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘     │
│        │            │            │            │           │
│        └────────────┴─────┬──────┴────────────┘           │
│                           │                                │
│                    ┌─────┴─────┐                         │
│                    │  PLANNING │                         │
│                    │ &SCHEDULING│                         │
│                    └───────────┘                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. PEOPLE & ORGANIZATIONS

### What's EXISTING:
- ✅ Staff management
- ✅ Basic roles (owner, admin, staff)
- ✅ Functional roles (CRM, HR, etc.)

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Departments** | 🔴 Critical | Core structure | Medium |
| **Teams** | 🔴 Critical | Collaboration | Medium |
| **Reporting Lines** | 🔴 Critical | Org hierarchy | High |
| **Job Positions/Titles** | 🔴 Critical | Clear roles | Low |
| **Organizational Chart** | 🟡 High | Visualization | Medium |
| **Capacity Planning** | 🟡 High | Resource mgmt | High |
| **Skills Matrix** | 🟢 Medium | Staffing | Medium |
| **Staff Directory** | 🟢 Medium | Communication | Low |

### Database Gaps:
```sql
-- MISSING: Departments
CREATE TABLE departments (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments,
  head_id UUID REFERENCES staff, -- Department head
  budget DECIMAL
);

-- MISSING: Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments,
  lead_id UUID REFERENCES staff,
  color TEXT
);

-- MISSING: Staff-Department-Team relationships
CREATE TABLE staff_assignments (
  staff_id UUID REFERENCES staff,
  department_id UUID REFERENCES departments,
  team_id UUID REFERENCES teams,
  role TEXT,
  start_date DATE,
  end_date DATE
);

-- MISSING: Job Positions
CREATE TABLE positions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments,
  level TEXT, -- Junior, Mid, Senior, Lead, Manager, Director
  salary_range JSONB
);
```

---

## 2. PROCESSES & WORKFLOWS

### What's EXISTING:
- ✅ Basic approvals
- ✅ Requisitions
- ✅ Workflow builder (basic)

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Approval Chains** | 🔴 Critical | Decision flow | High |
| **Digital Signatures** | 🔴 Critical | Document approval | High |
| **Business Rules Engine** | 🔴 Critical | Auto-decisions | High |
| **Document Templates** | 🟡 High | Standard docs | Medium |
| **Auto-routing Rules** | 🔴 Critical | Route by logic | Medium |
| **Escalation Paths** | 🟡 High | Handle delays | Medium |
| **Parallel Approvals** | 🟡 High | Multiple approvers | Medium |
| **Conditional Logic** | 🔴 Critical | If/then flows | High |

### Database Gaps:
```sql
-- MISSING: Approval Templates
CREATE TABLE approval_templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- invoice, leave, requisition
  steps JSONB NOT NULL, -- [{order: 1, approver: "manager", type: "single"}]
  conditions JSONB, -- {field: "amount", operator: "gt", value: 10000}
  is_active BOOLEAN DEFAULT TRUE
);

-- MISSING: Approval Instances
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES approval_templates,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  current_step INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending', -- pending, approved, rejected, cancelled
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- MISSING: Approval Actions
CREATE TABLE approval_actions (
  id UUID PRIMARY KEY,
  approval_id UUID REFERENCES approvals,
  step INTEGER NOT NULL,
  approver_id UUID REFERENCES staff,
  action TEXT NOT NULL, -- approve, reject, request_info, delegate
  comment TEXT,
  signature_url TEXT, -- For digital signatures
  acted_at TIMESTAMPTZ
);

-- MISSING: Escalation Rules
CREATE TABLE escalation_rules (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES approval_templates,
  delay_hours INTEGER DEFAULT 24,
  escalate_to UUID REFERENCES staff,
  action TEXT DEFAULT 'notify' -- notify, reassign, auto_approve, auto_reject
);

-- MISSING: Document Templates
CREATE TABLE document_templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- invoice, contract, letter, report
  content TEXT NOT NULL, -- HTML/Markdown with placeholders
  placeholders JSONB, -- [{key: "{{client_name}}", source: "contacts.name"}]
  created_by UUID REFERENCES staff
);
```

---

## 3. FINANCE & BUDGET

### What's EXISTING:
- ✅ Accounting (basic)
- ✅ Invoicing
- ✅ Payments

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Budget Tracking** | 🔴 Critical | Financial control | High |
| **Cost Centers** | 🔴 Critical | Dept expenses | Medium |
| **Profit Centers** | 🟡 High | P&L by unit | High |
| **Expense Categories** | 🔴 Critical | Tracking | Low |
| **Cost Allocation** | 🟡 High | Distribute costs | High |
| **Financial Reports** | 🟡 High | Insights | Medium |
| **Budget vs Actual** | 🔴 Critical | Control | Medium |
| **Approval for Expenses** | 🔴 Critical | Control | Medium |

### Database Gaps:
```sql
-- MISSING: Budgets
CREATE TABLE budgets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments,
  fiscal_year INTEGER NOT NULL,
  period_type TEXT NOT NULL, -- monthly, quarterly, yearly
  total_amount DECIMAL NOT NULL,
  allocated_amount DECIMAL DEFAULT 0,
  spent_amount DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'active'
);

-- MISSING: Budget Allocations
CREATE TABLE budget_allocations (
  id UUID PRIMARY KEY,
  budget_id UUID REFERENCES budgets,
  category_id UUID REFERENCES expense_categories,
  amount DECIMAL NOT NULL
);

-- MISSING: Cost Centers
CREATE TABLE cost_centers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  parent_id UUID REFERENCES cost_centers,
  type TEXT, -- revenue, expense, asset, liability
  manager_id UUID REFERENCES staff
);

-- MISSING: Expense Claims
CREATE TABLE expense_claims (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  amount DECIMAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  receipt_url TEXT,
  status TEXT DEFAULT 'pending',
  approval_id UUID REFERENCES approvals
);

-- MISSING: Financial Periods
CREATE TABLE fiscal_periods (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  period_type TEXT NOT NULL, -- month, quarter, year
  is_locked BOOLEAN DEFAULT FALSE,
  is_closed BOOLEAN DEFAULT FALSE
);
```

---

## 4. ASSETS & INVENTORY

### What's EXISTING:
- ✅ Basic inventory

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Asset Tracking** | 🔴 Critical | Equipment mgmt | Medium |
| **Asset Categories** | 🔴 Critical | Organization | Low |
| **Asset Depreciation** | 🟡 High | Accounting | High |
| **Asset Assignments** | 🔴 Critical | Who has what | Medium |
| **Maintenance Schedule** | 🟡 High | Equipment life | Medium |
| **Stock Variants** | 🔴 Critical | Product types | Medium |
| **Stock Alerts** | 🔴 Critical | Reorder points | Low |
| **Batch/Lot Tracking** | 🟡 High | Traceability | High |
| **Barcode/QR Support** | 🟢 Medium | Scanning | Medium |

### Database Gaps:
```sql
-- MISSING: Asset Register
CREATE TABLE assets (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES asset_categories,
  serial_number TEXT,
  purchase_date DATE,
  purchase_cost DECIMAL,
  current_value DECIMAL,
  depreciation_method TEXT, -- straight_line, declining
  depreciation_rate DECIMAL,
  useful_life_years INTEGER,
  location TEXT,
  status TEXT DEFAULT 'active', -- active, maintenance, retired, disposed
  assigned_to UUID REFERENCES staff
);

-- MISSING: Asset Categories
CREATE TABLE asset_categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES asset_categories,
  depreciation_rate DECIMAL,
  default_life_years INTEGER
);

-- MISSING: Maintenance Records
CREATE TABLE maintenance_records (
  id UUID PRIMARY KEY,
  asset_id UUID REFERENCES assets,
  type TEXT NOT NULL, -- preventive, corrective, inspection
  description TEXT,
  cost DECIMAL,
  performed_by UUID REFERENCES staff,
  scheduled_date DATE,
  completed_date DATE,
  status TEXT DEFAULT 'scheduled'
);

-- MISSING: Stock Variants
CREATE TABLE product_variants (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products,
  sku TEXT NOT NULL,
  name TEXT,
  price DECIMAL,
  cost DECIMAL,
  stock_quantity INTEGER DEFAULT 0,
  reorder_point INTEGER DEFAULT 0,
  attributes JSONB -- {color: "red", size: "large"}
);

-- MISSING: Stock Movements
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products,
  variant_id UUID REFERENCES product_variants,
  type TEXT NOT NULL, -- purchase, sale, adjustment, transfer
  quantity INTEGER NOT NULL,
  reference_id UUID, -- order_id, po_id, etc
  notes TEXT,
  created_by UUID REFERENCES staff,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Low Stock Alerts
CREATE TABLE stock_alerts (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products,
  variant_id UUID REFERENCES product_variants,
  threshold INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE
);
```

---

## 5. SCHEDULING & PLANNING

### What's EXISTING:
- ✅ Basic calendar
- ✅ Meetings

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Resource Booking** | 🔴 Critical | Rooms, equipment | Medium |
| **Availability Calendar** | 🔴 Critical | See free/busy | Medium |
| **Appointment Slots** | 🟡 High | Booking system | Medium |
| **Recurring Events** | 🟡 High | Repetitive tasks | Medium |
| **Room Management** | 🟡 High | Office mgmt | Medium |
| **Equipment Availability** | 🟡 High | Resource mgmt | Medium |
| **Shift Scheduling** | 🟡 High | Operations | High |
| **Capacity Planning** | 🟢 Medium | Resource load | High |

### Database Gaps:
```sql
-- MISSING: Resources (Rooms, Equipment)
CREATE TABLE resources (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- room, equipment, vehicle, person
  category TEXT,
  capacity INTEGER, -- For rooms
  location TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  image_url TEXT
);

-- MISSING: Resource Bookings
CREATE TABLE resource_bookings (
  id UUID PRIMARY KEY,
  resource_id UUID REFERENCES resources,
  booked_by UUID REFERENCES staff,
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'confirmed', -- tentative, confirmed, cancelled
  notes TEXT,
  recurrence_rule TEXT, -- RRULE format
  is_all_day BOOLEAN DEFAULT FALSE
);

-- MISSING: Availability Rules
CREATE TABLE availability_rules (
  id UUID PRIMARY KEY,
  resource_id UUID REFERENCES resources,
  day_of_week INTEGER, -- 0-6
  start_time TIME,
  end_time TIME,
  is_available BOOLEAN DEFAULT TRUE,
  buffer_minutes INTEGER DEFAULT 0 -- Gap between bookings
);

-- MISSING: Appointment Types
CREATE TABLE appointment_types (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER DEFAULT 0,
  location TEXT,
  is_virtual BOOLEAN DEFAULT FALSE,
  meeting_link_template TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  notification_template TEXT
);

-- MISSING: Scheduled Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  type_id UUID REFERENCES appointment_types,
  client_id UUID, -- contact_id
  staff_id UUID REFERENCES staff, -- Assigned to
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  meeting_link TEXT,
  reminder_sent BOOLEAN DEFAULT FALSE
);
```

---

## 6. COMMUNICATION & ANNOUNCEMENTS

### What's EXISTING:
- ✅ Basic chat
- ✅ Notifications

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Announcements** | 🔴 Critical | Company comms | Low |
| **Email Templates** | 🔴 Critical | Professionalism | Medium |
| **Broadcast System** | 🟡 High | Mass comms | Medium |
| **Direct Messaging** | 🟡 High | Quick comms | Medium |
| **Team Channels** | 🟡 High | Group comms | Medium |
| **Read Receipts** | 🟢 Medium | Tracking | Low |
| **Email Sequences** | 🟢 Medium | Automation | High |

### Database Gaps:
```sql
-- MISSING: Announcements
CREATE TABLE announcements (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES staff,
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
  target_audience TEXT DEFAULT 'all', -- all, department, team, role
  target_ids UUID[], -- Specific department/team IDs
  is_pinned BOOLEAN DEFAULT FALSE,
  is_dismissible BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Announcement Views
CREATE TABLE announcement_views (
  announcement_id UUID REFERENCES announcements,
  staff_id UUID REFERENCES staff,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (announcement_id, staff_id)
);

-- MISSING: Email Templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT, -- invoice, welcome, reminder, notification
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB, -- {{client_name}}, {{invoice_number}}, etc
  created_by UUID REFERENCES staff,
  is_active BOOLEAN DEFAULT TRUE
);

-- MISSING: Direct Messages
CREATE TABLE direct_messages (
  id UUID PRIMARY KEY,
  sender_id UUID REFERENCES staff,
  recipient_id UUID REFERENCES staff,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Team Channels
CREATE TABLE channels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'public', -- public, private, direct
  created_by UUID REFERENCES staff,
  is_archived BOOLEAN DEFAULT FALSE
);

CREATE TABLE channel_members (
  channel_id UUID REFERENCES channels,
  staff_id UUID REFERENCES staff,
  role TEXT DEFAULT 'member', -- admin, member
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (channel_id, staff_id)
);

CREATE TABLE channel_messages (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels,
  sender_id UUID REFERENCES staff,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. HR CORE OPERATIONS

### What's EXISTING:
- ✅ Staff profiles
- ✅ Basic HR page

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Leave Management** | 🔴 Critical | HR basics | Medium |
| **Attendance Tracking** | 🔴 Critical | Time mgmt | High |
| **Geo-fencing** | 🟡 High | Remote work | High |
| **Performance Reviews** | 🟡 High | Employee growth | Medium |
| **Training Records** | 🟡 High | Compliance | Medium |
| **Recruitment Pipeline** | 🟡 High | Hiring | High |
| **Contracts** | 🔴 Critical | Legal | Medium |
| **Onboarding** | 🟡 High | New hires | Medium |

### Database Gaps:
```sql
-- MISSING: Leave Types
CREATE TABLE leave_types (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL, -- Annual, Sick, Maternity, Paternity, Unpaid
  code TEXT NOT NULL,
  color TEXT,
  days_allowed INTEGER, -- Per year
  requires_approval BOOLEAN DEFAULT TRUE,
  is_paid BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE
);

-- MISSING: Leave Requests
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  leave_type_id UUID REFERENCES leave_types,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_requested INTEGER NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approval_id UUID REFERENCES approvals,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Attendance Records
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  hours_worked DECIMAL,
  status TEXT, -- present, absent, late, half_day
  notes TEXT,
  location_lat DECIMAL,
  location_lng DECIMAL
);

-- MISSING: Attendance Approvals
CREATE TABLE attendance_adjustments (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  date DATE NOT NULL,
  original_status TEXT,
  new_status TEXT,
  reason TEXT,
  approved_by UUID REFERENCES staff,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Performance Reviews
CREATE TABLE performance_reviews (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  reviewer_id UUID REFERENCES staff,
  review_period TEXT, -- Q1 2024, Annual 2024
  review_date DATE NOT NULL,
  status TEXT DEFAULT 'draft',
  rating_overall DECIMAL, -- 1-5
  rating_goals DECIMAL,
  rating_competencies DECIMAL,
  feedback TEXT,
  goals_for_next_period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Training Records
CREATE TABLE training_records (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  course_name TEXT NOT NULL,
  provider TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT, -- scheduled, in_progress, completed, cancelled
  completion_date DATE,
  certificate_url TEXT,
  expiry_date DATE,
  cost DECIMAL
);

-- MISSING: Employee Contracts
CREATE TABLE employee_contracts (
  id UUID PRIMARY KEY,
  staff_id UUID REFERENCES staff,
  contract_type TEXT, -- permanent, contract, probation, internship
  start_date DATE NOT NULL,
  end_date DATE,
  salary DECIMAL NOT NULL,
  salary_frequency TEXT, -- monthly, weekly
  currency TEXT DEFAULT 'NGN',
  probation_months INTEGER DEFAULT 3,
  notice_period_days INTEGER DEFAULT 30,
  document_url TEXT,
  status TEXT DEFAULT 'active'
);
```

---

## 8. INTEGRATION INFRASTRUCTURE

### What's EXISTING:
- ✅ Basic webhook support

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Webhook Manager** | 🔴 Critical | Automation | Medium |
| **API Keys Management** | 🔴 Critical | Developer access | Medium |
| **Zapier/Make Integration** | 🟡 High | No-code automation | High |
| **Slack/Teams Integration** | 🟡 High | Communication | Medium |
| **Payment Gateway** | 🔴 Critical | Collections | High |
| **SMS Gateway** | 🟡 High | Notifications | Medium |
| **Email Delivery** | 🔴 Critical | Communication | Medium |
| **Data Sync** | 🟡 High | External systems | High |

### Database Gaps:
```sql
-- MISSING: API Keys
CREATE TABLE api_keys (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  staff_id UUID REFERENCES staff,
  scopes TEXT[], -- read, write, admin
  rate_limit INTEGER DEFAULT 1000,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Integration Connections
CREATE TABLE integration_connections (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL, -- slack, microsoft, google, paystack, flutterwave
  name TEXT NOT NULL,
  credentials JSONB, -- Encrypted
  refresh_token TEXT, -- Encrypted
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Scheduled Syncs
CREATE TABLE scheduled_syncs (
  id UUID PRIMARY KEY,
  integration_id UUID REFERENCES integration_connections,
  entity_type TEXT NOT NULL, -- contacts, invoices, staff
  sync_type TEXT, -- push, pull, bidirectional
  frequency TEXT, -- realtime, hourly, daily, weekly
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  config JSONB
);

-- MISSING: Outbound Webhooks
CREATE TABLE outbound_webhooks (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[], -- invoice.created, staff.added
  secret TEXT, -- For signature verification
  headers JSONB, -- Custom headers
  is_active BOOLEAN DEFAULT TRUE,
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ
);
```

---

## 9. SECURITY & COMPLIANCE

### What's EXISTING:
- ✅ Basic RLS policies
- ✅ Audit logs

### What's MISSING:

| Feature | Priority | Impact | Complexity |
|---------|----------|--------|------------|
| **Data Residency** | 🔴 Critical | Legal compliance | High |
| **Encryption at Rest** | 🔴 Critical | Security | High |
| **Session Management** | 🔴 Critical | Security | Medium |
| **IP Allowlisting** | 🟡 High | Security | Low |
| **2FA/OTP** | 🔴 Critical | Security | Medium |
| **Password Policy** | 🔴 Critical | Security | Low |
| **Audit Reports** | 🟡 High | Compliance | Medium |
| **Data Retention** | 🟡 High | GDPR | Medium |

### Database Gaps:
```sql
-- MISSING: Session Management
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  token_hash TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

-- MISSING: IP Allowlist
CREATE TABLE ip_allowlist (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users, -- NULL for business-wide
  business_id UUID REFERENCES businesses,
  ip_address INET NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MISSING: Password History
CREATE TABLE password_history (
  user_id UUID REFERENCES auth.users,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, created_at)
);

-- MISSING: Data Retention Rules
CREATE TABLE data_retention_rules (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  action TEXT DEFAULT 'archive', -- archive, delete, anonymize
  is_active BOOLEAN DEFAULT TRUE
);
```

---

## Priority Matrix

```
                    IMPACT
                    High        Low
            ┌─────────┬─────────┐
      High  │  CRITICAL│  HIGH   │
PUSHINESS   │ P0       │  P1     │
            ├─────────┼─────────┤
      Low   │  MEDIUM  │  LOW    │
            │  P2       │  P3     │
            └─────────┴─────────┘
```

### CRITICAL (P0) - Must Have:
1. Departments & Teams
2. Leave Management
3. Approval Chains
4. Digital Signatures
5. Budget Tracking
6. Asset Tracking
7. Announcements
8. Data Export (actual implementation)

### HIGH (P1) - Should Have:
1. Reporting Lines
2. Cost Centers
3. Stock Variants
4. Resource Booking
5. Attendance Tracking
6. Email Templates
7. Webhook Manager
8. 2FA/OTP

### MEDIUM (P2) - Important:
1. Organizational Chart
2. Expense Claims
3. Performance Reviews
4. Training Records
5. Team Channels
6. API Keys
7. IP Allowlisting

### LOW (P3) - Nice to Have:
1. Skills Matrix
2. Batch/Lot Tracking
3. Barcode Support
4. Shift Scheduling
5. Email Sequences

---

## Implementation Roadmap

### Phase 1: Core HR & Organization (2 weeks)
- Departments & Teams
- Staff-Department Assignments
- Job Positions
- Leave Management

### Phase 2: Financial Controls (2 weeks)
- Budget Tracking
- Cost Centers
- Expense Claims
- Approval Chains

### Phase 3: Asset Management (1 week)
- Asset Register
- Asset Categories
- Maintenance Records
- Stock Variants

### Phase 4: Communication (1 week)
- Announcements
- Email Templates
- Direct Messages

### Phase 5: Scheduling (2 weeks)
- Resource Booking
- Availability Rules
- Appointment Types

### Phase 6: Security & Compliance (1 week)
- Session Management
- 2FA/OTP
- IP Allowlisting
- Data Retention
