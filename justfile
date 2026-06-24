# Default recipe: lists all public commands
_default:
    @just --list

# Build everything in sequence: Shared, Frontend, Backend
build: _build-shared _build-frontend _build-backend

# Run development environment
[parallel]
dev: _dev-frontend _dev-backend

check:
    npm run build -w @dance-videos/shared
    npm run check -w @dance-videos/backend
    npm run check -w @dance-videos/frontend

_dev-frontend:
    npm run dev -w @dance-videos/frontend

_dev-backend:
    npm run dev -w @dance-videos/backend

_build-shared:
    npm run build -w @dance-videos/shared

_build-frontend:
    npm run build -w @dance-videos/frontend

_build-backend:
    npm run build -w @dance-videos/backend

# Build, ship, and restart a site's container on prod
deploy site:
    #!/usr/bin/env bash
    set -euo pipefail

    site="{{site}}"
    envfile="sites/$site/.env.deploy"
    if [[ ! -f "$envfile" ]]; then
        echo "deploy: missing $envfile" >&2
        exit 1
    fi
    set -a; source "$envfile"; set +a

    ENDPOINT="${DEPLOY_USER:?deploy: set DEPLOY_USER in $envfile}@${DEPLOY_HOST:?deploy: set DEPLOY_HOST in $envfile}"
    DOMAIN="${DEPLOY_DOMAIN:?deploy: set DEPLOY_DOMAIN in $envfile}"

    IMAGE_SRC="src/$DOMAIN"
    DATA_SRC="/srv/$DOMAIN"

    ssh "$ENDPOINT" "mkdir -p $IMAGE_SRC"
    rsync -azh --delete \
        --exclude='.git' --exclude='node_modules' --exclude='dist' \
        --exclude='data' --exclude='storage' --exclude='temp' --exclude='logs' \
        --exclude='.env' --exclude='.env.*' --exclude='/sites' \
        ./ "$ENDPOINT:$IMAGE_SRC/"

    if  [[ -d "sites/$site/branding" ]]; then
        ssh "$ENDPOINT" "mkdir -p /srv/$DOMAIN/branding"
        rsync -azh --delete "sites/$site/branding/" "$ENDPOINT:$DATA_SRC/branding/"
    fi

    ssh "$ENDPOINT" "podman build -t localhost/$DOMAIN:latest $IMAGE_SRC"

    ssh "$ENDPOINT" "systemctl --user daemon-reload && systemctl --user restart $DOMAIN"

# Preview a site's fully-branded app locally
preview site:
    #!/usr/bin/env bash
    set -euo pipefail

    site="{{site}}"
    bundle="sites/$site"

    npm run build -w @dance-videos/shared
    npm run build -w @dance-videos/frontend
    npm run build -w @dance-videos/backend

    export NODE_ENV="production"
    export PORT="8080"
    export DIST_DIR="$PWD/packages/frontend/dist"
    [ -d "$bundle/branding" ] && export BRANDING_PATH="$PWD/$bundle/branding"

    echo "Preview of '$site' at http://localhost:$PORT"
    cd packages/backend && node dist/index.js
