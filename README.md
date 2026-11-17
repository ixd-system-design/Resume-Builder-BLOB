# Resume builder demo

A public, shared resume that demonstrates creating, reading, editing, and deleting work experiences with a native HTML form, a Netlify Function API, and MongoDB Atlas. Anyone who can access the site can read, add, edit, or delete entries. Use fictional data only; there is no login or abuse protection.

## Prerequisites

- Node.js 22.12 or newer and npm.
- A MongoDB Atlas cluster, a database user with permission to read and write the intended database, and network access configured to permit connections from your development environment and Netlify Functions.
- A MongoDB connection string that includes the intended database name. See MongoDB's documentation for URL-encoding special characters in credentials.

## Run locally

1. Copy `.env.example` to `.env` (do not overwrite an existing file) and set `MONGODB_URI` to your Atlas connection string. Do not commit or share credentials.
2. Run `npm install` and then `npm run dev`. The dev script runs the latest Netlify CLI through `npx`; the first run may ask to install it. Netlify CLI loads variables from `.env` for local development. Open the local URL printed by the CLI.
3. Enter a fictional experience and submit it. The shared resume beneath the form reloads from MongoDB. Leave the end year blank for a current role. Use Edit to load an item into the form, Save changes to update it, or Cancel edit to return to adding. Use Delete and confirm to remove an item.

### Optional images

Choose an image in the form to immediately crop it to a centered 640 by 640 square and upload it. The canvas exports a JPEG with a white background for transparent images. Save the experience to attach the uploaded image; uploading alone does not save the experience. Remove image clears the form's reference, and saving commits that removal. Cancel edit leaves the saved experience unchanged. A failed save keeps the uploaded ID for retry.

The hidden `image` field holds only the returned UUID. MongoDB stores that optional string; content type (`image/jpeg`), dimensions (640 by 640), and extension (`.jpg`) are fixed. Image bytes live in the `resume-images` Netlify Blobs store. The original file is not uploaded. Use fictional images suitable for this public demo.

Netlify Dev uses a separate local blob store. Use a development MongoDB database with it so local references do not replace references to deployed images. Netlify supplies blob credentials to deployed Functions; no storage credentials belong in browser code. A site-wide blob store survives redeploys and is shared across deploy contexts. A preview using a different MongoDB database must use a separate Netlify site for storage isolation; never manually run cleanup against mismatched storage and database data. See [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## API

Each API function in `netlify/functions` defines its own path. The plural resume route reads the collection; the singular route creates, updates, and deletes items. Resume request and response bodies use JSON. The `resume_items` collection is chosen explicitly; no additional index is created.

- `GET /api/resume-items` returns the retrieved MongoDB documents as an array, including MongoDB-generated fields.
- `POST /api/resume-item` accepts `job_title`, `start_year`, optional `end_year`, `employer`, `accomplishment`, and optional `image` (an uploaded image UUID), and returns the created item with HTTP 201.
- `PUT /api/resume-item?id=<id>` replaces the entire document with the supplied new json data and returns the updated item. Supply all required fields; omitting `end_year` removes its existing value.
- `DELETE /api/resume-item?id=<id>` deletes an item and returns HTTP 200 with a JSON confirmation containing the deleted `id`.

For PUT and DELETE, `id` is the MongoDB `_id` returned by GET or POST. A missing or malformed ID, invalid JSON, or validation failure returns HTTP 400; an ID that does not exist returns HTTP 404. Other failures return HTTP 500. Mongoose casts and validates item fields; years must be integers from 1900 to 2100. Required text fields are trimmed and limited to 100 characters for title and employer, and 1,000 for accomplishment.

PUT uses `findOneAndReplace` to validate and replace the document while preserving its existing `_id` when the request body omits it. Omitting `end_year` removes it. Replacement also removes other existing fields not supplied; a conflicting `_id` in the body is rejected.

Include the current `image` ID in PUT to retain it; omit it to remove the image reference. The form does this automatically. Deleting or replacing an experience does not immediately delete its image bytes.

Example request body:

```json
{
  "job_title": "Software Developer",
  "start_year": 2020,
  "end_year": 2023,
  "employer": "Example Company",
  "accomplishment": "Improved the onboarding process."
}
```

### Image API and cleanup

- `POST /api/image` accepts multipart form data with one `file` field containing the canvas-exported JPEG. It returns HTTP 201 with `{ "id": "<uuid>" }`. Let the browser set the multipart boundary.
- `GET /api/image?id=<uuid>` returns binary JPEG bytes. Missing/malformed IDs return HTTP 400; missing blobs return HTTP 404.
- Uploads must be nonempty JPEG files no larger than 2 MiB. Invalid multipart or missing files return HTTP 400, unsupported content returns HTTP 415, and oversized files return HTTP 413. The server checks MIME type and signature; it assumes the canvas dimensions and does not fully decode the image. Unsupported methods return HTTP 405; unexpected failures return HTTP 500.

`cleanup-images` runs daily at midnight UTC and removes blobs uploaded more than 24 hours ago that no resume item references. Each blob has only a server-generated `createdAt` timestamp as metadata. The function checks MongoDB before deleting; database failures stop cleanup. Invalid or missing timestamps are skipped. Referenced images survive regardless of age. Eligible abandoned uploads are normally removed 24–48 hours after upload; an old image that becomes unreferenced can be removed at the next run.

An unsaved form left open for more than a day may need its image reselected. A final reference recheck reduces concurrency risk, but the MongoDB lookup and blob deletion are not atomic. This simple scheduled function is intended for demo-sized stores.

Schedules run automatically only on published deploys. To check cleanup locally with disposable local images and a development database, start `npm run dev`, then run `npx netlify-cli functions:invoke cleanup-images`. On Netlify, use the function's Run now control and inspect its logs. See [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).

## Deploy on Netlify

Push the project to GitHub and connect the repository in the Netlify dashboard. The checked-in `netlify.toml` supplies the publish and function directories, and each function configures its own API path; no build command is needed. In Netlify's environment-variable settings, configure `MONGODB_URI` for the relevant deployment contexts with a scope available to Functions, then deploy. A local `.env` file is not deployed. Use a dedicated least-privileged database user, and ensure Atlas network access permits Netlify's function infrastructure. After deployment, submit fictional data and reload the page to confirm that it persists. Consider appropriate abuse controls before using this public API for anything beyond a demo.

## Manual verification

- Create and edit an experience without an image; current form validation and CRUD should still work.
- Select portrait, landscape, square, small, and transparent images. Confirm the square preview fills its canvas and the saved image displays after reload.
- Edit text without replacing an image, then replace/remove it and save. Cancel an image edit and confirm the stored experience stays unchanged.
- Try an unreadable file and failed uploads/saves. Confirm useful feedback, preserved previous image state, and retry. Form actions should be disabled during upload.
- Check image API error responses and that successful GET responses contain JPEG bytes.
- Seed disposable local blobs with recent, old, invalid, and missing timestamps. Run cleanup: only old, unreferenced blobs should disappear. Referenced blobs and blobs exactly at the captured 24-hour cutoff should survive. Repeat the run and check that database failures stop deletion.

Automated tests are intentionally outside this demo's scope. The design and acceptance checklist are in [image-upload.md](image-upload.md).
