// Demo Data
export const DEMO_USER = { email: "demo@avenize.ng", name: "Adebayo Johnson", business_name: "TechBuild Nigeria Ltd", role: "Business Owner" }

export const DEMO_DEALS = [
  { id: "1", title: "Enterprise CRM License", stage: "negotiation", value: 2500000, contact: "Chinedu Okafor", company: "Riverside Construction", email: "chinedu@riverside.ng", phone: "08012345678", lastActivity: "2 hours ago" },
  { id: "2", title: "Annual Maintenance Contract", stage: "proposal", value: 1800000, contact: "Amina Ibrahim", company: "StyleBox Fashion", email: "amina@stylebox.ng", phone: "08098765432", lastActivity: "5 hours ago" },
  { id: "3", title: "HR Software Suite", stage: "qualified", value: 950000, contact: "Emeka Nwosu", company: "EduFirst Schools", email: "emeka@edufirst.ng", phone: "08055512345", lastActivity: "1 day ago" },
  { id: "4", title: "Project Management Tool", stage: "won", value: 450000, contact: "Olumide Adeyemi", company: "Alhaji Motors", email: "olumide@alhajimotors.ng", phone: "08033322211", lastActivity: "3 days ago" },
  { id: "5", title: "Finance Dashboard", stage: "won", value: 750000, contact: "Fatima Ahmed", company: "Lagos Tech Hub", email: "fatima@lagostech.ng", phone: "08044433322", lastActivity: "5 days ago" },
]

export const DEMO_CONTACTS = [
  { id: "1", full_name: "Chinedu Okafor", company: "Riverside Construction", email: "chinedu@riverside.ng", phone: "08012345678", last_contact: "2 hours ago", total_deals: 3, deal_value: 4500000 },
  { id: "2", full_name: "Amina Ibrahim", company: "StyleBox Fashion", email: "amina@stylebox.ng", phone: "08098765432", last_contact: "5 hours ago", total_deals: 2, deal_value: 2300000 },
  { id: "3", full_name: "Emeka Nwosu", company: "EduFirst Schools", email: "emeka@edufirst.ng", phone: "08055512345", last_contact: "1 day ago", total_deals: 4, deal_value: 1200000 },
  { id: "4", full_name: "Olumide Adeyemi", company: "Alhaji Motors", email: "olumide@alhajimotors.ng", phone: "08033322211", last_contact: "3 days ago", total_deals: 2, deal_value: 850000 },
]

export const DEMO_INVOICES = [
  { id: "1", invoice_number: "INV-2024-001", client_name: "Riverside Construction", client_email: "accounts@riverside.ng", client_address: "15 Admiralty Way, Lekki Phase 1, Lagos", items: [{ description: "CRM Enterprise License (Annual)", quantity: 1, unit_price: 2500000, total: 2500000 }], subtotal: 2500000, vat_amount: 187500, total: 2687500, amount_paid: 2687500, balance: 0, status: "paid", issue_date: "2024-01-01", due_date: "2024-01-15" },
  { id: "2", invoice_number: "INV-2024-002", client_name: "StyleBox Fashion", client_email: "finance@stylebox.ng", client_address: "24 Awolowo Road, Ikoyi, Lagos", items: [{ description: "Software Setup", quantity: 1, unit_price: 150000, total: 150000 }], subtotal: 150000, vat_amount: 11250, total: 161250, amount_paid: 0, balance: 161250, status: "sent", issue_date: "2024-01-10", due_date: "2024-01-25" },
  { id: "3", invoice_number: "INV-2024-003", client_name: "EduFirst Schools", client_email: "admin@edufirst.ng", client_address: "8 Alfred Rewane Road, Ikoyi, Lagos", items: [{ description: "HR Software License", quantity: 1, unit_price: 850000, total: 850000 }], subtotal: 850000, vat_amount: 63750, total: 913750, amount_paid: 500000, balance: 413750, status: "partially_paid", issue_date: "2024-01-05", due_date: "2024-01-20" },
]

export const DEMO_STATS = {
  revenue: { value: 2450000, change: 12.4 },
  active_deals: { value: 4, change: 2 },
  invoices_outstanding: { value: 575000, change: -5 },
  tasks_pending: { value: 8, change: 3 },
  team_active: { value: 5, change: 0 },
  projects_in_progress: { value: 2, change: 1 },
}
