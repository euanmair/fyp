# Terraform deployment for early-years scheduler

## Requirements

- Terraform 1.2+
- AWS CLI configured (`aws configure`)

## Steps

1. Build the lambda package:

```bash
cd d:/FYP/fyp/llama
npm install
npm run build
cd d:/FYP/fyp/fyp-version-one/terraform
cp ../.. /fyp/llama/dist # ensure dist/index.js exists
zip -r lambda.zip ../llama/dist package.json node_modules
```

2. Initialize and deploy

```bash
cd d:/FYP/fyp/fyp-version-one/terraform
terraform init
terraform apply
```

3. Copy API endpoint from Terraform output and set in `.env.local`:

```bash
echo "LAMBDA_ENDPOINT_URL=<api_endpoint>/schedule" > ../.env.local
```

4. Run Next app:

```bash
cd ../
npm run dev
```
