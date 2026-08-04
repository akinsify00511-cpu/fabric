# Edge Functions

This directory contains Supabase Edge Functions for Avenize.

## Available Functions

### execute-automation
Executes automation rules when triggers fire.

```bash
supabase functions deploy execute-automation
```

**Triggers**: deal_won, deal_lost, invoice_paid, task_completed, etc.
**Actions**: send_notification, create_task, post_to_chat, award_merit, update_deal

### dispatch-webhooks
Dispatches webhook events to registered endpoints.

```bash
supabase functions deploy dispatch-webhooks
```

### send-email
Sends email campaigns using Resend, SendGrid, or AWS SES.

```bash
supabase functions deploy send-email
```

**Environment Variables Required**:
- `RESEND_API_KEY` (recommended) OR
- `SENDGRID_API_KEY` OR
- AWS credentials for SES

### transcribe-audio
Transcribes meeting audio using OpenAI Whisper and generates summaries with GPT.

```bash
supabase functions deploy transcribe-audio
```

**Environment Variables Required**:
- `OPENAI_API_KEY`

### paystack-webhook
Handles Paystack payment webhook events.

```bash
supabase functions deploy paystack-webhook
```

**Environment Variables Required**:
- `PAYSTACK_SECRET_KEY`

## Deployment

Deploy all functions:
```bash
supabase functions deploy
```

Deploy specific function:
```bash
supabase functions deploy <function-name>
```

## Local Development

Start local Supabase:
```bash
supabase start
```

Test function locally:
```bash
supabase functions serve <function-name> --env-file .env.local
```

## Environment Variables

Set these in your Supabase project dashboard (Settings > Edge Functions):

| Variable | Description | Required |
|---------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key for Whisper/GPT | For transcribe-audio |
| `RESEND_API_KEY` | Resend API key for email | For send-email |
| `SENDGRID_API_KEY` | SendGrid API key for email | Alternative to Resend |
| `PAYSTACK_SECRET_KEY` | Paystack secret key | For paystack-webhook |
