\set ON_ERROR_STOP on
\if :{?app_password}
\else
  \echo 'Pass app_password using: psql -v app_password=...'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orviko_app') THEN
    CREATE ROLE orviko_app LOGIN;
  END IF;
END $$;

ALTER ROLE orviko_app WITH
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  PASSWORD :'app_password';

GRANT CONNECT ON DATABASE :DBNAME TO orviko_app;
GRANT USAGE ON SCHEMA public TO orviko_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO orviko_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO orviko_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO orviko_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO orviko_app;
