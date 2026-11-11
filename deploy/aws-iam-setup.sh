#!/usr/bin/env bash
# Run ONCE as an AWS admin (for example in AWS CloudShell, ap-south-1): lets the ai-trader-dev user deploy and call the
# compute Lambda. Afterwards run deploy/compute-lambda.sh from the dev machine as usual.
set -euo pipefail
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ROLE=aitrader2-compute-lambda
USER=ai-trader-dev
REGION=ap-south-1

aws iam create-role --role-name "$ROLE" --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

aws iam put-user-policy --user-name "$USER" --policy-name aitrader2-compute-deploy --policy-document "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    { \"Effect\": \"Allow\", \"Action\": \"iam:PassRole\", \"Resource\": \"arn:aws:iam::$ACCOUNT:role/$ROLE\" },
    { \"Effect\": \"Allow\", \"Action\": \"iam:GetRole\", \"Resource\": \"arn:aws:iam::$ACCOUNT:role/$ROLE\" },
    { \"Effect\": \"Allow\", \"Action\": \"lambda:*\", \"Resource\": \"arn:aws:lambda:$REGION:$ACCOUNT:function:aitrader2-compute\" }
  ]
}"
echo "done: role $ROLE and deploy rights for $USER"
