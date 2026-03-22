import json
import os

def lambda_handler(event, context):
    bucket = os.environ.get("BUCKET_NAME", "unknown")
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "message": "Hello from Lambda - this message is via an API Gateway!",
            "bucket": bucket
        })
    }