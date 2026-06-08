#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
ZIP_NAME="dokladovka_backup_${TIMESTAMP}.zip"

mkdir -p "$BACKUP_DIR"

echo "Zalohování projektu Dokladovka..."

zip -r "$BACKUP_DIR/$ZIP_NAME" \
  src/ \
  server.ts \
  package.json \
  package-lock.json \
  tsconfig.json \
  vite.config.ts \
  index.html \
  .env.example \
  -x "src/**/*.map" \
  -x "src/**/*.d.ts" \
  -x "node_modules/*" \
  -x ".git/*" \
  -x "dist/*" \
  -x "data/*" \
  -x "*.log"

echo "Záloha vytvořena: $BACKUP_DIR/$ZIP_NAME"
echo "Velikost:"
ls -lh "$BACKUP_DIR/$ZIP_NAME"
