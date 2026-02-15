# IAP purchases admin queries

After running migrations, you can inspect successful iOS purchases with either:

```sql
select *
from public.iap_purchases_recent
where user_id = '<USER_UUID>'
order by purchased_at desc
limit 100;
```

Or directly from the base table:

```sql
select user_id, product_id, transaction_id, environment, purchased_at
from public.iap_purchases
where purchased_at >= now() - interval '30 days'
order by purchased_at desc;
```
