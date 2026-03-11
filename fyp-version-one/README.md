## This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started
To run dev server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
Start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.
This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font).

## Learn More
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## AWS Config

## Lambda

## On prem

## Project Structure
app/page.tsx
    - Scheduler UI + form
    - calls local API (/api/schedule)
app/api/schedule/route.ts
    - POST route
    - local computeSchedule() fallback
    - AWS Lambda proxy usage via process.env.LAMBDA_ENDPOINT_URL
terraform/main.tf
    - AWS provider
    - S3 bucket
    - IAM role + policy
    - Lambda function (+ deployment package)
    - API Gateway HTTP route (POST /schedule)
terraform/variables.tf + terraform/outputs.tf
terraform/README.md deployment instructions
# Lambda Structure
package.json + tsconfig.json
    - src/index.ts
    - Lambda handler exports.handler
    - schedule algorithm:
        - rooms, children, staff ratio, holidays, days/week
    - writes object into S3 (if SCHEDULE_BUCKET_NAME)
    - Build target: dist/index.js