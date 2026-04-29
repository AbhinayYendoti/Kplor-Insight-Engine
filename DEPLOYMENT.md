# Kplor Insight Engine Deployment

## Backend (Render)

Use the included `render.yaml` for consistent setup.

Required Render env vars:

- `NVIDIA_API_KEY=<your key>`
- `FRONTEND_ORIGIN=https://<your-vercel-domain>`

Health check after deploy:

- `GET https://<your-render-url>/health`

Expected response shape:

```json
{"status":"ok","model":"meta/llama-3.1-8b-instruct"}
```

## Frontend (Vercel)

Set environment variable in Vercel project:

- `VITE_API_URL=https://<your-render-url>/api`

Then redeploy frontend.

## Production sanity checks

1. Open frontend and run Analyze on sample input.
2. Verify clusters appear.
3. Click Generate Recommendations.
4. Verify sprint card appears and no console/network errors.

## Notes

- API key is backend-only. Do not add it to frontend env.
- CORS allows your explicit `FRONTEND_ORIGIN` and Vercel preview domains.
