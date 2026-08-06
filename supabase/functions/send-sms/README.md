# Send SMS Edge Function

This Supabase Edge Function handles sending SMS messages via the Termii API.

## Setup

### 1. Create Termii Account

1. Sign up at [termii.com](https://termii.com)
2. Get your API key from the dashboard
3. Register a sender ID (alphanumeric, up to 11 characters)

### 2. Configure Environment Variables

Set the following environment variables in your Supabase project:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Save Termii Settings

In the Avenize SMS settings page (`/app/sms`), enter:
- **API Key**: Your Termii API key
- **Sender ID**: Your registered sender ID (e.g., "Avenize")
- **Channel**: DND (recommended for transactional messages)

### 4. Run Database Migration

Apply the SMS migration to create the required tables:

```bash
psql $DATABASE_URL -f supabase/migrations/20260101000003_sms_tables.sql
```

### 5. Deploy Edge Function

The function is in the `supabase/functions/send-sms/` directory. Deploy with:

```bash
supabase functions deploy send-sms
```

Or from the function directory:

```bash
cd supabase/functions/send-sms
supabase functions deploy send-sms
```

## API Usage

### Send SMS

```bash
curl -X POST https://your-project.supabase.co/functions/v1/send-sms \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "08012345678",
    "message": "Hello from Avenize!",
    "channel": "dnd"
  }'
```

### Response

```json
{
  "success": true,
  "message": "SMS sent successfully",
  "message_id": "msg_abc123"
}
```

## Channels

| Channel | Description | Use Case |
|---------|-------------|----------|
| `dnd` | Do Not Disturb bypass | Transactional messages (payments, OTPs) |
| `whatsapp` | WhatsApp Business | Customer engagement |
| `generic` | Standard SMS | General messaging (may be blocked by DND) |

## Rate Limits

Termii has rate limits depending on your plan:
- **Free tier**: 50 SMS/day
- **Pay-as-you-go**: Based on credits purchased
- **Enterprise**: Custom limits

## Cost Estimation

SMS costs in Nigeria:
- DND channel: ~₦4-8 per segment
- WhatsApp: Free for template messages
- Generic: ~₦3-6 per segment

GSM-7 encoding: 160 characters per segment
Concatenated SMS: 153 characters per segment

## Troubleshooting

### "Termii not configured"
- Make sure you've saved your API key in the SMS settings page
- Check that the `termii_api_key` setting exists in the `settings` table

### "Failed to send SMS"
- Verify your Termii API key is valid
- Check your Termii balance
- Ensure the phone number format is correct (Nigerian numbers: 080xxxxxxx or +234xxxxxxxxx)

### "SMS not appearing in history"
- Check the `sms_logs` table in Supabase
- Verify RLS policies allow your user to view logs
