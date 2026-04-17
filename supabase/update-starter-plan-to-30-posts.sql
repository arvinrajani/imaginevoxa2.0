update public.plans
set
  credits_monthly = 30,
  features = '["30 AI-generated posts/month", "Basic templates", "Manual copy & paste", "Community support"]'::jsonb,
  updated_at = now()
where id = 'starter';

select id, name, credits_monthly, features
from public.plans
where id = 'starter';
