SELECT cron.unschedule('monthly-accounting-telegram') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-accounting-telegram');
SELECT cron.unschedule('monthly-accounting-telegram-retry') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-accounting-telegram-retry');

SELECT cron.schedule(
  'monthly-accounting-telegram',
  '59 20 28,29,30,31 * *',
  $$
  select net.http_post(
    url:='https://project--b35291ce-dece-4302-89c8-dddfbc70b8d1.lovable.app/api/public/hooks/monthly-accounting',
    headers:='{"Content-Type": "application/json", "x-cron-key": "9d7f6a25483fc0eb1ff032bd3d90c49a855151e38840bad3"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);

SELECT cron.schedule(
  'monthly-accounting-telegram-retry',
  '23 * * * *',
  $$
  select net.http_post(
    url:='https://project--b35291ce-dece-4302-89c8-dddfbc70b8d1.lovable.app/api/public/hooks/monthly-accounting',
    headers:='{"Content-Type": "application/json", "x-cron-key": "9d7f6a25483fc0eb1ff032bd3d90c49a855151e38840bad3"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);