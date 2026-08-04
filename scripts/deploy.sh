#!/bin/bash

# TikTally Backoffice — deploy pra Hostinger (subdomínio backoffice.tiktally.com.br)
#
#   ./scripts/deploy.sh              # build + deploy
#   ./scripts/deploy.sh --skip-build # deploy do build existente (usado no CI)
#
# O subdomínio é um "website" próprio na Hostinger, apontando pra
# public_html/backoffice — então o deploy NÃO toca no app principal, que vive na
# raiz de public_html. É por isso que HOSTINGER_DOMAIN precisa ser o subdomínio.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export HOSTINGER_DOMAIN="${HOSTINGER_DOMAIN:-backoffice.tiktally.com.br}"

SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

echo "========================================="
echo "  TikTally Backoffice → ${HOSTINGER_DOMAIN}"
echo "========================================="
echo ""

if [ "$SKIP_BUILD" = false ]; then
  echo "[1/4] Build..."
  cd "$PROJECT_DIR"
  npm run build
  echo ""
else
  echo "[1/4] Build pulado (--skip-build)"
fi

if [ ! -d "${PROJECT_DIR}/dist" ]; then
  echo "ERRO: dist/ não encontrado."
  exit 1
fi

# O .htaccess precisa ir junto — sem ele, /coupons dá 404 no refresh. O Vite
# copia public/ pra dist/, mas o zip ignora dotfiles se não for explícito.
if [ ! -f "${PROJECT_DIR}/dist/.htaccess" ]; then
  echo "ERRO: dist/.htaccess ausente — o SPA quebraria em qualquer rota."
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ARCHIVE_NAME="tiktally_backoffice_${TIMESTAMP}.zip"
ARCHIVE_PATH="${PROJECT_DIR}/${ARCHIVE_NAME}"

echo "[2/4] Empacotando: ${ARCHIVE_NAME}"
cd "${PROJECT_DIR}/dist"
# -x exclui .DS_Store; dotfiles como .htaccess entram porque usamos "." como raiz
zip -r -q "${ARCHIVE_PATH}" . -x "*.DS_Store"
cd "$PROJECT_DIR"
echo "       Tamanho: $(du -h "${ARCHIVE_PATH}" | cut -f1)"
unzip -l "${ARCHIVE_PATH}" | grep -q "\.htaccess" \
  && echo "       .htaccess incluído ✓" \
  || { echo "ERRO: .htaccess ficou de fora do zip."; rm -f "${ARCHIVE_PATH}"; exit 1; }
echo ""

echo "[3/4] Upload..."
echo "[4/4] Deploy..."
echo ""

node "${PROJECT_DIR}/scripts/hostinger-deploy.mjs" "${ARCHIVE_PATH}"
DEPLOY_EXIT=$?

rm -f "${ARCHIVE_PATH}"

if [ $DEPLOY_EXIT -eq 0 ]; then
  echo ""
  echo "✅ https://${HOSTINGER_DOMAIN}"
fi

exit $DEPLOY_EXIT
