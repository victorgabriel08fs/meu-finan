-- Custom migration: the app is dark by default (0003 changed the column
-- default). Nothing wrote user_settings.theme before this release, so every
-- existing row still holds the old default and moves to the new one.
update "user_settings" set "theme" = 'dark' where "theme" = 'system';
