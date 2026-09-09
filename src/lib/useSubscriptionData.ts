import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase'
import { useAuth } from './AuthContext'

export interface SubscriptionDetails { id:string; plan:string; plan_name:string; status:'active'|'cancelled'|'expired'|'past_due'|'paused'|null; billing_cycle:'monthly'|'yearly'; amount:number; currency:string; start_date:string; next_billing_date:string|null; cancelled_at:string|null; trial_ends_at:string|null; seats_included:number; days_until_expiry:number|null; is_active:boolean }
export interface PaymentRecord { id:string; amount:number; currency:string; status:'successful'|'failed'|'pending'|'refunded'; description:string; paid_at:string }
export interface InvoiceRecord { id:string; invoice_number:string; amount:number; currency:string; status:'paid'|'pending'|'failed'|'refunded'|'void'; due_date:string; paid_at:string|null; pdf_url:string|null }
export interface AvailablePlan { code:string; name:string; monthly_price:number; yearly_price:number; yearly_monthly_equivalent:number; savings_percent:number; currency:string; seats_min:number|null; seats_max:number|null }
export interface PaymentRequestInfo { reference:string; plan_code:string; billing_cycle:'monthly'|'yearly'; amount_cents:number; currency:string; status:string; instructions:{bank_name:string|null;account_name:string|null;account_number:string|null;note:string|null} }
interface ReturnTypeData { subscription:SubscriptionDetails|null; payments:PaymentRecord[]; invoices:InvoiceRecord[]; availablePlans:AvailablePlan[]; loading:boolean; error:string|null; refresh:()=>Promise<void>; cancelSubscription:(cancelAtPeriodEnd?:boolean)=>Promise<{success:boolean;message:string}>; requestPlanPayment:(planCode:string,billingCycle:'monthly'|'yearly')=>Promise<PaymentRequestInfo|null> }

export function useSubscriptionData():ReturnTypeData{
 const {staff}=useAuth();const [subscription,setSubscription]=useState<SubscriptionDetails|null>(null);const [payments,setPayments]=useState<PaymentRecord[]>([]);const [invoices,setInvoices]=useState<InvoiceRecord[]>([]);const [availablePlans,setAvailablePlans]=useState<AvailablePlan[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null)
 const refresh=useCallback(async()=>{
  if(!staff?.business_id){setLoading(false);return}setLoading(true);setError(null);const bid=staff.business_id
  const [s,p,i,plans]=await Promise.all([
   supabase.from('business_subscriptions').select('*').eq('business_id',bid).maybeSingle(),
   supabase.from('subscription_payments').select('*').eq('business_id',bid).order('created_at',{ascending:false}).limit(50),
   supabase.from('subscription_invoices').select('*').eq('business_id',bid).order('created_at',{ascending:false}).limit(100),
   supabase.from('plan_pricing').select('plan,display_name,monthly_amount,yearly_amount,currency,seats_min,seats_max').order('monthly_amount'),
  ])
  const first=s.error||p.error||i.error||plans.error
  if(first){setError('Billing data or pricing could not be loaded. Entitlements and commercial pricing are not assumed when the billing source is unavailable.');setSubscription(null);setPayments([]);setInvoices([]);setAvailablePlans([]);setLoading(false);return}
  if(s.data){const sub=s.data;const days=sub.next_billing_date?Math.ceil((new Date(sub.next_billing_date).getTime()-Date.now())/86400000):null;setSubscription({id:sub.id,plan:sub.plan_code||'unknown',plan_name:sub.plan_name||'Unknown',status:sub.status,billing_cycle:sub.billing_cycle,amount:Number(sub.amount_cents||0)/100,currency:sub.currency||'NGN',start_date:sub.start_date,next_billing_date:sub.next_billing_date,cancelled_at:sub.cancelled_at,trial_ends_at:null,seats_included:sub.seats_included||0,days_until_expiry:days,is_active:sub.status==='active'})}else setSubscription(null)
  setPayments((p.data??[]).map((x:any)=>({id:x.id,amount:Number(x.amount_cents||0)/100,currency:x.currency,status:x.status,description:x.description||'Subscription payment',paid_at:x.paid_at||x.created_at})))
  setInvoices((i.data??[]).map((x:any)=>({id:x.id,invoice_number:x.invoice_number,amount:Number(x.amount_cents||0)/100,currency:x.currency,status:x.status,due_date:x.due_date,paid_at:x.paid_at,pdf_url:x.pdf_url})))
  setAvailablePlans((plans.data??[]).map((x:any)=>{const monthly=Number(x.monthly_amount||0),yearly=Number(x.yearly_amount||0),equiv=yearly/12;return{code:x.plan,name:x.display_name,monthly_price:monthly,yearly_price:yearly,yearly_monthly_equivalent:equiv,savings_percent:monthly>0?Math.round((1-equiv/monthly)*100):0,currency:x.currency||'NGN',seats_min:x.seats_min,seats_max:x.seats_max}}));setLoading(false)
 },[staff?.business_id])
 useEffect(()=>{void refresh()},[refresh])
 const cancelSubscription=useCallback(async(cancelAtPeriodEnd=true)=>{if(!staff?.business_id)return{success:false,message:'Not authenticated'};const{error:e}=await supabase.rpc('cancel_subscription',{p_business_id:staff.business_id,p_cancel_at_period_end:cancelAtPeriodEnd});if(e)return{success:false,message:e.message};await refresh();return{success:true,message:cancelAtPeriodEnd?'Subscription will be cancelled at the end of the billing period':'Subscription cancelled immediately'}},[staff?.business_id,refresh])
 const requestPlanPayment=useCallback(async(planCode:string,billingCycle:'monthly'|'yearly')=>{if(!staff?.business_id)return null;try{const{data,error:e}=await supabase.rpc('request_plan_payment',{p_plan_code:planCode,p_billing_cycle:billingCycle});if(e||!data?.ok)return null;return data as PaymentRequestInfo}catch{return null}},[staff?.business_id])
 return{subcription:subscription,subscription,payments,invoices,availablePlans,loading,error,refresh,cancelSubscription,requestPlanPayment}
}
