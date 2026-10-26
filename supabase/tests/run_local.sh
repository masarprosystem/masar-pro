#!/bin/sh
# تشغيل الاختبار الشامل على Postgres محلي (للمطور): ./run_local.sh <psql connection args>
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
DB=masar_test_$$
createdb "$@" $DB
psql "$@" -d $DB -q -v ON_ERROR_STOP=1 -f "$DIR/tests/local_stubs.sql"
for f in "$DIR"/migrations/0*.sql; do PGOPTIONS="-c client_min_messages=warning" psql "$@" -d $DB -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null; done
psql "$@" -d $DB -v ON_ERROR_STOP=1 -f "$DIR/tests/regression.sql"
dropdb "$@" $DB
