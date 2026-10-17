-- Custom migration: accounts created before user management existed. The
-- first account (the owner, from /primeiro-acesso) becomes the administrator
-- and any other account a regular user. An install that already has an
-- administrator keeps its roles.
update "user" set "role" = 'admin'
where "id" = (select "id" from "user" order by "created_at", "id" limit 1)
  and not exists (select 1 from "user" where "role" = 'admin');
--> statement-breakpoint
update "user" set "role" = 'user' where "role" is null;
