-- Custom migration (doc 03 §9.4): a card's "Fatura atual" used to stay in
-- initial_balance_cents, which no invoice summed. It becomes a paid adjustment
-- dated the day the card was created (in the person's time zone), linked to the
-- invoice a purchase made that day goes to (doc 03 §9.1, same formula as
-- invoiceFor in src/lib/finance/invoices.ts), and the card's initial balance
-- goes to 0. Balance, limit and net worth stay the same. One statement, so it
-- needs no session state; running it again changes nothing.
with opening as (
  select a.id as account_id, a.user_id, a.initial_balance_cents as cents,
         (a.created_at at time zone coalesce(s.timezone, 'America/Sao_Paulo'))::date as d,
         c.closing_day, c.due_day
  from fin_accounts a
  join credit_card_details c on c.account_id = a.id
  left join user_settings s on s.user_id = a.user_id
  where a.type = 'credit_card' and a.initial_balance_cents <> 0
),
closing_month as (
  select o.*,
    (date_trunc('month', o.d::timestamp)
      + case when o.d >= make_date(extract(year from o.d)::int, extract(month from o.d)::int,
               least(o.closing_day, extract(day from date_trunc('month', o.d::timestamp) + interval '1 month' - interval '1 day')::int))
        then interval '1 month' else interval '0 days' end)::date as cm
  from opening o
),
due_month as (
  select m.*,
    case when m.due_day > m.closing_day then m.cm else (m.cm + interval '1 month')::date end as dm
  from closing_month m
),
dated as (
  select y.account_id, y.user_id, y.cents, y.d, y.dm as reference_month,
    make_date(extract(year from y.cm)::int, extract(month from y.cm)::int,
      least(y.closing_day, extract(day from y.cm::timestamp + interval '1 month' - interval '1 day')::int)) as closing_date,
    make_date(extract(year from y.dm)::int, extract(month from y.dm)::int,
      least(y.due_day, extract(day from y.dm::timestamp + interval '1 month' - interval '1 day')::int)) as due_date
  from due_month y
),
opening_target as (
  select t.*, coalesce(i.id, gen_random_uuid()) as invoice_id, i.id is null as is_new
  from dated t
  left join card_invoices i
    on i.account_id = t.account_id and i.reference_month = t.reference_month
),
new_invoices as (
  insert into card_invoices (id, user_id, account_id, reference_month, closing_date, due_date)
  select invoice_id, user_id, account_id, reference_month, closing_date, due_date
  from opening_target where is_new
),
entries as (
  insert into transactions (id, user_id, account_id, kind, status, amount_cents, description, occurred_on, paid_at, invoice_id)
  select gen_random_uuid(), user_id, account_id, 'adjustment'::txn_kind, 'paid'::txn_status,
         cents, 'Valor inicial da fatura', d, now(), invoice_id
  from opening_target
)
update fin_accounts a set initial_balance_cents = 0
from opening_target o where a.id = o.account_id;
