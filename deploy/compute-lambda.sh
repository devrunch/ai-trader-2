#!/usr/bin/env bash
# Builds services/compute as an arm64 Python 3.13 zip and deploys it to Lambda behind an IAM-authenticated Function URL.
# Only the API's AWS user may call it (resource policy). Prints the URL for COMPUTE_URL.
#   deploy/compute-lambda.sh
set -euo pipefail
REGION=${AWS_REGION:-ap-south-1}
NAME=aitrader2-compute
ROLE=aitrader2-compute-lambda
cd "$(git rev-parse --show-toplevel)/services/compute"
BUILD=$(mktemp -d)
trap 'rm -rf "$BUILD"' EXIT

echo "== build =="
uv export --no-dev --no-hashes --no-emit-project --format requirements-txt > "$BUILD/requirements.txt" 2>/dev/null
uv pip install -q --target "$BUILD/pkg" --python-platform aarch64-manylinux_2_28 --python-version 3.13 --only-binary :all: -r "$BUILD/requirements.txt"
cp -r src/compute "$BUILD/pkg/compute"
find "$BUILD/pkg" -name '__pycache__' -type d -prune -exec rm -rf {} +
(cd "$BUILD/pkg" && python -c "import shutil; shutil.make_archive('../lambda', 'zip', '.')")
echo "zip: $(du -h "$BUILD/lambda.zip" | cut -f1)"

echo "== role =="
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
CALLER=$(aws sts get-caller-identity --query Arn --output text)
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --output text --query Role.Arn --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sleep 10 # a new role takes a few seconds before Lambda can assume it
fi

echo "== function =="
# The AWS CLI on Windows needs a Windows path for the zip.
ZIP=$(cygpath -m "$BUILD/lambda.zip" 2>/dev/null || echo "$BUILD/lambda.zip")
if aws lambda get-function --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$NAME" --region "$REGION" --zip-file "fileb://$ZIP" --query LastModified --output text
else
  aws lambda create-function --function-name "$NAME" --region "$REGION" --runtime python3.13 --architectures arm64 \
    --handler compute.lambda_handler.handler --memory-size 1024 --timeout 30 \
    --role "arn:aws:iam::$ACCOUNT:role/$ROLE" --zip-file "fileb://$ZIP" --query FunctionArn --output text
fi
aws lambda wait function-updated-v2 --function-name "$NAME" --region "$REGION"

echo "== url (IAM auth; only $CALLER may invoke) =="
if ! aws lambda get-function-url-config --function-name "$NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$NAME" --region "$REGION" --auth-type AWS_IAM --query FunctionUrl --output text >/dev/null
  aws lambda add-permission --function-name "$NAME" --region "$REGION" --statement-id api-invoke --action lambda:InvokeFunctionUrl \
    --principal "$CALLER" --function-url-auth-type AWS_IAM >/dev/null
fi
echo "COMPUTE_URL=$(aws lambda get-function-url-config --function-name "$NAME" --region "$REGION" --query FunctionUrl --output text)"
