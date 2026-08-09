#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

empty_top_level_artifacts=(
  '='
  'CACHED'
  '[internal]'
  'bwtdallas-app@1.0.0'
  'exporting'
  'naming'
  'node'
  'reading'
  'resolve'
  'resolving'
  'transferring'
  'unpacking'
)

removed=0
for artifact in "${empty_top_level_artifacts[@]}"; do
  if [[ ! -e "$artifact" ]]; then
    continue
  fi

  if [[ ! -f "$artifact" || -s "$artifact" ]]; then
    echo "Refusing to remove non-empty unexpected artifact: $artifact" >&2
    exit 1
  fi

  rm -- "$artifact"
  removed=$((removed + 1))
done

while IFS= read -r -d '' artifact; do
  rm -- "$artifact"
  removed=$((removed + 1))
done < <(find . -type f \( -name '*.orig' -o -name '*.rej' \) -print0)

echo "Stage 10T source cleanup complete: removed ${removed} confirmed artifact file(s)."
