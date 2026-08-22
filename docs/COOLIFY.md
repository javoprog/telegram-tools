# Deploy Telegram Tools with Coolify

The production image is published by GitHub Actions as:

    ghcr.io/javoprog/telegram-tools:latest

## 1. Create the application

In Coolify, create **Application → Docker Image** and use the image above. Set
the application port to **8000**.

## 2. Add persistent storage

Create a persistent volume with these values:

| Setting | Value |
| --- | --- |
| Volume name | `tg_data` |
| Mount path | `/app/data` |

Do not deploy SQLite without this volume: Telegram sessions, rules, logs and
the bcrypt override for the panel password are stored under `/app/data`.

## 3. Configure environment variables

Add these variables in Coolify:

    TG_API_ID=<telegram application api id>
    TG_API_HASH=<telegram application api hash>
    APP_SECRET_KEY=<random secret, at least 32 bytes>
    ADMIN_PASSWORD=<initial web panel password>
    PORT=8000
    DATA_DIR=/app/data
    DATABASE_URL=sqlite+aiosqlite:////app/data/app.db

Generate the application secret locally, for example:

    python -c "import secrets; print(secrets.token_urlsafe(48))"

Never commit real values to `.env` or to this repository.

## 4. Enable automatic deployment

Copy the deployment webhook from the Coolify application. In the GitHub
repository open **Settings → Secrets and variables → Actions**, create a
repository secret named `COOLIFY_WEBHOOK_URL`, and paste the complete webhook
URL as its value.

The workflow publishes both an immutable commit tag and `latest`. It calls the
Coolify webhook only after the GHCR image has been pushed successfully.

## 5. GHCR access

For a public image, set the `telegram-tools` container package visibility to
**Public** in GitHub package settings. If the package remains private, configure
Coolify registry credentials with a GitHub token that has `read:packages`.

## Rollback

To roll back, replace `latest` in Coolify with the required Git commit SHA tag,
for example:

    ghcr.io/javoprog/telegram-tools:<commit-sha>

Redeploy the application. The `/app/data` volume remains unchanged.
