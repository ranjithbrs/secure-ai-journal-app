$ErrorActionPreference = "Stop"

$PROJECT_ID = (gcloud config get-value project)
$SERVICE_NAME = "mindreflect-ai-journal"
$REGION = "us-central1"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Deploying MindReflect AI Journal to Google Cloud Run" -ForegroundColor Cyan
Write-Host "Project ID: $PROJECT_ID" -ForegroundColor Yellow
Write-Host "Challenge Label: dev-tutorial=cloud-run-ai-challenge" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# Submit Build
gcloud builds submit --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Deploy to Cloud Run with Mandatory Challenge Label
gcloud run deploy $SERVICE_NAME `
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME" `
  --platform managed `
  --region $REGION `
  --allow-unauthenticated `
  --set-env-vars GCP_PROJECT=$PROJECT_ID `
  --update-labels dev-tutorial=cloud-run-ai-challenge

Write-Host "Deployment Completed Successfully!" -ForegroundColor Green
gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)'
