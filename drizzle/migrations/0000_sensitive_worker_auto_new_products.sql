-- lovable-cron-fallback-reviewed: background classification of new products needs time-based wakeups; gated by WHERE EXISTS, 5-min cadence
SELECT cron.unschedule('sensitive-vision-worker');
SELECT cron.schedule('sensitive-vision-worker', '*/5 * * * *', $c$
  SELECT net.http_post(url := u, headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 55000)
  FROM unnest(ARRAY['https://project--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978.lovable.app/api/public/sensitive-worker','https://project--fa78f6b9-1ce8-4e6e-8494-e0b16eb5f978-dev.lovable.app/api/public/sensitive-worker']) AS u
  WHERE EXISTS (SELECT 1 FROM public.sensitive_image_status WHERE vision_status IN ('PENDING','PROCESSING'))
     OR EXISTS (SELECT 1 FROM public.sensitive_pending_products2(1, false))
$c$);