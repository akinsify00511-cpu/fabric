# Avenize Feature Roadmap

## Production Ready ✅

These features are fully implemented and working:

| Feature | Status | Notes |
|---------|--------|-------|
| **Dashboard** | ✅ Live | Real-time stats, role-based views |
| **CRM** | ✅ Live | Deal tracking, pipeline, contacts, import/export CSV |
| **Finance** | ✅ Live | Invoices, payments, receipts (₦ Naira) |
| **Tasks** | ✅ Live | Task management with assignees |
| **Projects** | ✅ Live | Project tracking (Nigeria variant) |
| **People** | ✅ Live | Team management, staff directory |
| **Chat** | ✅ Live | Real-time messaging via Supabase Realtime |
| **Calendar** | ✅ Live | Event scheduling |
| **Reports** | ✅ Live | Analytics and insights |
| **Branding** | ✅ Live | White-label customization |
| **2FA (TOTP)** | ✅ Live | Authenticator app support (Google Auth, Authy) |
| **Nigeria Mode** | ✅ Live | ₦ Naira, PAYE, WHT, multi-bank transfers |

---

## Beta 🚀

These features work but require Edge Function deployment:

### Webhooks
- **Status**: Beta
- **What works**: Creating and saving webhook configurations
- **What needs setup**: Deploy `dispatch-webhooks` Edge Function + enable pg_net extension
- **Setup guide**: See `supabase/functions/dispatch-webhooks/index.ts`
- **Use case**: Connect Avenize to Zapier, Make, or custom endpoints

### Automations
- **Status**: Beta
- **What works**: Creating automation rules (triggers + actions)
- **What needs setup**: Deploy `execute-automation` Edge Function + enable pg_cron
- **Supported triggers**: deal_won, deal_lost, task_completed, invoice_paid, etc.
- **Supported actions**: send_notification, create_task, post_to_chat, award_merit
- **Setup guide**: See `supabase/functions/execute-automation/index.ts`
- **Use case**: "When deal closes → send notification + create follow-up task"

---

## Coming Soon 📅

These features are on the roadmap:

| Feature | ETA | Notes |
|---------|-----|-------|
| **SSO (Enterprise)** | Contact Sales | SAML/OIDC for Okta, Azure AD, Google Workspace |
| **Push Notifications** | Q2 2024 | Browser notifications |
| **WhatsApp Integration** | Q2 2024 | WhatsApp Business API |
| **SMS Notifications** | Q2 2024 | Termii or Africa's Talking |
| **Open Banking** | Q3 2024 | Mono/Okra bank feeds |
| **Multi-Language** | Q3 2024 | English, Yoruba, Hausa, Igbo, French, Spanish, Arabic, Portuguese, Chinese, Hindi |
| **AI Copilot** | Q4 2024 | AI bookkeeping assistant |
| **Receipt OCR** | Q4 2024 | Receipt scanning |
| **NRS/FIRS Compliance** | TBD | Nigerian e-invoicing |
| **Invoice Factoring** | TBD | Working capital loans |
| **Mobile App** | 2025 | Native iOS/Android |

---

## Not Planning

These are not on the current roadmap:

| Feature | Reason |
|---------|--------|
| Native desktop app | PWA covers desktop use cases |
| White-label mobile app | Web app works on mobile |
| Built-in accounting | Integrate with existing tools |

---

## Implementation Guides

### Deploying Webhooks

1. Enable pg_net extension in Supabase:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_net;
   ```

2. Deploy the Edge Function:
   ```bash
   supabase functions deploy dispatch-webhooks
   ```

3. Set environment variable:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

### Deploying Automations

1. Enable pg_cron extension in Supabase:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pg_cron;
   ```

2. Run the migration:
   ```bash
   psql $DATABASE_URL -f supabase/migrations/20240101000001_automation_webhook_tables.sql
   ```

3. Deploy the Edge Function:
   ```bash
   supabase functions deploy execute-automation
   ```

4. (Optional) Set up cron for periodic checks:
   ```sql
   SELECT cron.schedule(
     'check-due-tasks',
     '* * * * *',
     $$ SELECT net.http_post(
       url := 'https://your-project.supabase.co/functions/v1/execute-automation',
       body := json_build_object('trigger', 'task_due_soon')
      )$$
   );
   ```

---

## Support

For questions about roadmap features or implementation:
- Email: support@avenize.com
- Documentation: https://docs.avenize.com
