# TERRAFORM

1. ENSURE KEY SET IN MAIN.TF EXISTS IN AWS ACCOUNT, IF NOT REFRESH AND RESET VARS (EITHER IN $ENV OR SECRETS.TFVARS)
2. RUN TERRAFORM PLAN
3. RUN TERRAFORM APPLY
4. ENSURE TERRAFORM DESTROY IS RAN AFTER USE





This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

See env tokens below
$env:AWS_DEFAULT_REGION=""
$env:AWS_ACCESS_KEY_ID=""
$env:AWS_SECRET_ACCESS_KEY=""

## Local app environment

Set these for local development (`.env.local`):

```bash
JWT_SECRET=replace-with-a-long-random-secret
AWS_REGION=eu-north-1
USERS_TABLE_NAME=NurseryUsers
AWS_LAMBDA_SCHEDULER_FUNCTION=nursery-scheduler
AWS_LAMBDA_CONFIG_GET_FUNCTION=nursery-config-get
AWS_LAMBDA_CONFIG_UPSERT_FUNCTION=nursery-config-upsert
AWS_LAMBDA_CONFIG_PATCH_FUNCTION=nursery-config-patch
```

## Role and organisation model

- Accounts support `staff`, `manager`, and `admin` roles.
- Users can register with an organisation or join one later at `/join-organisation`.
- Staff accounts are directed to `/staff` for rota visibility.
- Manager/admin accounts can access `/dashboard` to generate and manage rotas.
- Admin has a separate area at `/admin`.