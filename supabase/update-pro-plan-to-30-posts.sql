update public.plans
set
  credits_monthly = 30,
  features = '["30 AI-generated posts/month", "Direct LinkedIn publishing", "Custom tone & style", "Analytics dashboard", "Image generation", "Priority support"]'::jsonb,
  updated_at = now()
where id = 'pro';

select id, name, credits_monthly, features
from public.plans
where id = 'pro';
