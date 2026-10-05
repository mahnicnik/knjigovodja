#!/usr/bin/env bash
#
# Lokalna, ZACASNA PostgreSQL baza za teste nad pravim PostgreSQL
# (tests/stevilcenje-socasno.spec.ts - socasna dodelitev davcnih stevilk, K4).
# NIKOLI ne kazi TEST_PG_URL na produkcijo: test brise in ustvari tabele.
#
#   ./skripte/zacasna-pg.sh
#   TEST_PG_URL=postgresql://racunko_test:racunko_test@localhost:5432/racunko_test \
#     npx playwright test tests/stevilcenje-socasno.spec.ts   (iz apps/web)
#
# Zahteva namescen PostgreSQL (Ubuntu: apt install postgresql).
set -euo pipefail
pg_ctlcluster "$(pg_lsclusters -h | awk 'NR==1{print $1}')" main start 2>/dev/null || true
su postgres -c "psql -qc \"do \\\$\\\$ begin if not exists (select from pg_roles where rolname='racunko_test') then create role racunko_test login password 'racunko_test' superuser; end if; end \\\$\\\$;\""
su postgres -c "createdb -O racunko_test racunko_test" 2>/dev/null || true
echo "TEST_PG_URL=postgresql://racunko_test:racunko_test@localhost:5432/racunko_test"
