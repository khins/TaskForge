# TaskForge web

## Cypress end-to-end tests

Cypress requires Node.js. Install Node.js 22 LTS, then run these commands from this directory:

```powershell
npm install
npm run dev
```

Keep the TaskForge API running at `http://127.0.0.1:5010`. In a second PowerShell window, provide credentials without committing them:

```powershell
$env:CYPRESS_EMAIL="your-user@example.com"
$env:CYPRESS_PASSWORD="your-password"
npm run test:e2e
```

For the interactive Cypress application, run:

```powershell
npm run test:e2e:open
```

The public availability test always runs. Authenticated tests are skipped when the credential variables are not provided.
