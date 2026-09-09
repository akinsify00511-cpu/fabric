create or replace function public.avenize_post_invoice_to_ledger(
  p_business_id uuid,
  p_invoice_id uuid,
  p_receivable_account_id uuid,
  p_revenue_account_id uuid,
  p_tax_account_id uuid default null,
  p_wht_account_id uuid default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_staff_id uuid;
  v_journal_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_key text;
begin
  v_staff_id := public.get_current_staff();
  if v_staff_id is null then
    raise exception 'Authenticated staff context required';
  end if;

  select * into v_invoice
  from public.invoices
  where id = p_invoice_id
    and business_id = p_business_id
  for update;

  if not found then
    raise exception 'Invoice not found for business';
  end if;

  if coalesce(v_invoice.total, 0) <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    v_key := 'invoice:' || p_invoice_id::text;
  else
    v_key := p_idempotency_key;
  end if;

  if not exists (select 1 from public.accounts where id=p_receivable_account_id and business_id=p_business_id) then
    raise exception 'Receivable account is outside business';
  end if;
  if not exists (select 1 from public.accounts where id=p_revenue_account_id and business_id=p_business_id) then
    raise exception 'Revenue account is outside business';
  end if;
  if coalesce(v_invoice.vat_amount, 0) > 0 then
    if p_tax_account_id is null then raise exception 'Tax account required for taxable invoice'; end if;
    if not exists (select 1 from public.accounts where id=p_tax_account_id and business_id=p_business_id) then raise exception 'Tax account is outside business'; end if;
  end if;
  if coalesce(v_invoice.wht_amount, 0) > 0 then
    if p_wht_account_id is null then raise exception 'WHT account required for WHT invoice'; end if;
    if not exists (select 1 from public.accounts where id=p_wht_account_id and business_id=p_business_id) then raise exception 'WHT account is outside business'; end if;
  end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', p_receivable_account_id, 'debit', greatest(coalesce(v_invoice.total,0),0), 'credit', 0, 'description', 'Accounts receivable'),
    jsonb_build_object('account_id', p_revenue_account_id, 'debit', 0, 'credit', greatest(coalesce(v_invoice.subtotal,0),0), 'description', 'Revenue')
  );
  if coalesce(v_invoice.vat_amount, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_tax_account_id, 'debit', 0, 'credit', v_invoice.vat_amount, 'description', 'VAT payable'));
  end if;
  if coalesce(v_invoice.wht_amount, 0) > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id', p_wht_account_id, 'debit', v_invoice.wht_amount, 'credit', 0, 'description', 'WHT receivable'));
  end if;

  v_journal_id := public.avenize_post_journal_entry(
    p_business_id,
    coalesce(v_invoice.issue_date, v_invoice.issued_at::date, current_date),
    'Invoice ' || coalesce(v_invoice.invoice_number, v_invoice.id::text),
    v_lines,
    coalesce(v_invoice.invoice_number, v_invoice.id::text),
    'invoice',
    v_invoice.id,
    coalesce(v_invoice.currency, 'NGN'),
    v_key
  );
  return v_journal_id;
end;
$$;

revoke all on function public.avenize_post_invoice_to_ledger(uuid,uuid,uuid,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.avenize_post_invoice_to_ledger(uuid,uuid,uuid,uuid,uuid,uuid,text) to authenticated;
