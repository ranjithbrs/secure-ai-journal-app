#!/usr/bin/env bash
set -e

PROJECT_ID=$(gcloud config get-value project)
SERVICE_NAME="mindreflect-ai-journal"
REGION="us-central1"

echo "=========================================================="
echo "Deploying MindReflect AI Journal to Google Cloud Run"
echo "Project ID: $PROJECT_ID"
echo "Challenge Label: dev-tutorial=cloud-run-ai-challenge"
echo "=========================================================="

# Build image using Cloud Build
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Deploy to Cloud Run with required challenge tag
gcloud run deploy $SERVICE_NAME \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GCP_PROJECT=$PROJECT_ID \
  --update-labels dev-tutorial=cloud-run-ai-challenge

echo "Successfully Deployed!"
gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)'
