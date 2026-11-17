# Resume item image upload plan

## Goal and approach

Allow each resume item to have one optional image. Selecting a local image draws a centered crop onto a 640 by 640 canvas and immediately uploads the exported image. The upload returns an ID, which goes into a hidden `image` input. Submitting the resume form continues to send JSON through the existing CRUD endpoints; MongoDB stores only the image ID.

Keep the implementation in the existing browser files, the Mongoose schema, and two new Netlify Functions. Use native browser APIs and `@netlify/blobs`, with no image editor, multipart parser package, additional MongoDB collection, or storage service class.

## Fixed image contract

These are implementation choices shared by the client and image endpoint:

| Property | Value |
| --- | --- |
| Output dimensions | 640 by 640 pixels |
| Content type | `image/jpeg` |
| Extension | `.jpg` |
| JPEG export quality | `0.85` |
| Transparent source background | White before drawing |
| Blob store name | `resume-images` |
| Blob key / returned ID | Server-generated UUID, without an extension |
| Resume item field | Optional `image` string containing that UUID |
| Upload size limit | 2 MiB for the exported file |

Do not store content type, dimensions, extension, original filename, or a URL in MongoDB or blob metadata. Store only a server-generated `createdAt` timestamp in blob metadata so cleanup can determine upload age. Every replacement upload gets a fresh ID; never overwrite an existing image.

## Browser form and canvas

In `public/index.html`, add a labeled optional file picker, a preview canvas with actual `width="640" height="640"` attributes, an image status/error area, and `<input type="hidden" id="image" name="image">`. Give the picker `accept="image/*"` and no `name`, so the original file does not enter the resume form's JSON. Include a `type="button"` Remove image control and an initially hidden `<img>` for previewing an already saved image during editing.

In `public/styles.css`, make the canvas and saved preview responsive with a square aspect ratio and a maximum displayed width of 640px. CSS may shrink the preview on small screens; the exported canvas stays 640 by 640.

Handle the file picker's `change` event in `public/app.js`:

1. If the picker has no file, leave the current image unchanged.
2. Keep the previous hidden ID until the new upload succeeds. Use the existing busy state to disable submission, editing, deletion, image removal, and further selection throughout decoding and uploading. Show an uploading status.
3. Decode the local file using an `Image` and an object URL. Handle decoding errors, reject zero dimensions, and revoke the object URL when finished. Selecting a browser-supported image is enough; there is no remote URL input or server-side resizing.
4. Fill the canvas white, then draw the source centered with enough scaling to cover the entire square. Crop equally from opposite edges, with no dragging or zoom controls:

   ```js
   const size = 640;
   const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
   const width = image.naturalWidth * scale;
   const height = image.naturalHeight * scale;
   context.fillStyle = '#fff';
   context.fillRect(0, 0, size, size);
   context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
   ```

5. Immediately call `canvas.toBlob(callback, 'image/jpeg', 0.85)` and await the result with a small Promise wrapper. Treat a null result or an output larger than 2 MiB as an error.
6. Upload the resulting Blob:

   ```js
   const upload = new FormData();
   upload.append('file', blob, 'image.jpg');
   const response = await fetch('/api/image', { method: 'POST', body: upload });
   ```

   Let the browser set the multipart Content-Type and boundary. Check `response.ok` before reading the returned ID.
7. On success, assign the returned `id` to the hidden input and show that the image is ready to be saved with the experience. On failure, preserve the previous ID, restore its preview (or hide the failed preview if there was no previous image), and show a retry message. Do not leave a failed replacement looking saved.
8. Clear the file picker after processing so selecting the same file again triggers `change`. Release the busy state in `finally`.

Use a short, accessible status message to distinguish uploading an image from saving the experience. An upload alone does not create or update a resume item.

## Fit the existing form code

The current `fields` array includes every input and textarea, and validation assumes each has a matching error element. Adjust that array to include only the existing editable text, number, and textarea fields. Handle the image picker and hidden input explicitly. This also avoids assigning a saved UUID to a file input, which browsers prohibit.

- Extend `setBusy()` to disable the picker and Remove image button alongside the existing controls. Leave the hidden input enabled so it remains serializable.
- `editItem(item)` sets the hidden value to `item.image ?? ''`, resets the picker, and loads the saved image preview when present. Loading an existing image does not trigger another upload.
- `clearForm()` explicitly empties the hidden value and picker, clears/hides image previews and image status, and resets the Remove image button. It is already called after a successful save and on Cancel edit.
- Remove image empties the hidden value and clears the preview. Persist that removal only when the experience is saved. Cancel edit leaves the stored experience unchanged.
- Continue using `Object.fromEntries(new FormData(form))` for POST and PUT. Remove an empty `data.image` before JSON serialization, just as empty `end_year` is removed. A populated hidden input automatically enters the existing payload.
- Always include the current image ID when editing an item that keeps its image. PUT uses full document replacement, so omitting `image` deliberately removes the reference.
- If saving the experience fails, retain its uploaded image ID for a retry. Abandoning the form or replacing an uploaded image leaves an orphan for cleanup.

## Image API

Add `netlify/functions/image.js`, using the same default-export Request/Response style as the existing functions, with `config = { path: '/api/image' }`. Use `getStore('resume-images')` and the native Node UUID generator. Netlify's [upload example](https://docs.netlify.com/build/data-and-storage/netlify-blobs/#example) demonstrates `request.formData()` and storing the resulting File with `store.set()`.

| Request | Behavior |
| --- | --- |
| `POST /api/image` | Read multipart field `file`, store the exported JPEG, return HTTP 201 with `{ "id": "<uuid>" }`. |
| `GET /api/image?id=<uuid>` | Return the stored bytes with fixed `Content-Type: image/jpeg`. |
| Other methods | Return HTTP 405 with `Allow: GET, POST`. |

For POST, reject a non-multipart or malformed request, a missing/non-file `file` field, or an empty file with HTTP 400. Reject unsupported content with HTTP 415 and oversized output with HTTP 413. Check the declared JPEG type and JPEG signature bytes; treat 640 by 640 as the client export contract rather than adding an image decoder to the server. A signature check is a basic check, not full image validation. This stays within the existing learning demo's scope.

Generate the ID and timestamp on the server, then await `store.set(id, file, { metadata: { createdAt: Date.now() } })` before returning success. Do not accept a client-provided storage key, filename, or timestamp.

For GET, reject a missing or malformed UUID with HTTP 400. Read with `store.get(id, { type: 'arrayBuffer' })`, return HTTP 404 for `null`, and return the binary data otherwise. Do not JSON-encode image bytes. Use `Cache-Control: no-store` on errors so a failed lookup is not cached. Use the same simple cache policy for successful reads initially.

Catch unexpected storage errors and return a generic HTTP 500 JSON error. This endpoint does not connect to MongoDB and does not expose a public delete operation.

## MongoDB and display

In `server/models.js`, add an optional `image` String field with UUID-format validation when a value is present. Existing documents need no migration. Do not add an index.

The existing create, replacement update, delete, and list handlers can remain unchanged: Mongoose accepts the new schema field, and the list endpoint already returns stored fields. Deleting an item removes its reference without synchronously deleting a blob.

Add an initially hidden image element to `#resume-item-template`. In `loadItems()`, when `item.image` is present, set its `src` to `/api/image?id=${encodeURIComponent(item.image)}` and reveal it. Give it fixed width/height attributes, responsive CSS, and suitable alt text tied to the experience. Hide a failed image and show a small unavailable message without preventing the rest of the item from rendering. Items without an image keep their current layout.

## Cleanup of unreferenced images

Add `netlify/functions/cleanup-images.js`. Configure it inline with `export const config = { schedule: '@daily' }`. Netlify schedules use UTC and run automatically on published deploys; local runs require manual invocation. See [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/).

Use one straightforward sequence and a sequential loop:

1. Connect with the existing `connectDatabase()` helper. Read all nonempty resume item image IDs using `ResumeItem.distinct('image', { image: { $type: 'string', $ne: '' } })` and put them in a Set. If this query fails, stop without deleting anything.
2. Capture `cutoff = Date.now() - 24 * 60 * 60 * 1000` once for the run.
3. List the dedicated image store with `await store.list()`. The SDK retrieves all pages by default. For each key absent from the Set, read its metadata with `store.getMetadata(key)` to obtain `createdAt`. Blob listings contain keys and ETags, not creation dates. See the [Blobs API reference](https://docs.netlify.com/build/data-and-storage/netlify-blobs/#list).
4. Skip a missing blob, a missing/invalid timestamp, or any image whose `createdAt` is greater than or equal to the cutoff. Missing metadata is not permission to delete.
5. Immediately before deleting each eligible blob, recheck `ResumeItem.exists({ image: key })`. If it is still unreferenced, await `store.delete(key)`. Stop on a database error; never interpret a failed lookup as an absent reference.
6. Log counts of checked, skipped, and deleted blobs, and report failures in function logs. A later run can retry remaining work.

An eligible image is strictly more than 24 hours old and unreferenced at cleanup time. This covers abandoned uploads, replaced images, removed images, and deleted experiences. A referenced image survives regardless of age, including when more than one item references it. With a daily schedule, an unreferenced upload is normally removed between 24 and 48 hours after uploading. Age is measured from upload, not from when the last reference was removed.

Keep two limits explicit: a form left unsaved for more than a day may lose its uploaded image and require reselection; the final database recheck reduces concurrency risk but cannot make a MongoDB check and a blob deletion atomic. This demo does not add cross-store locking or transactions. Keep cleanup small enough for the scheduled function's execution limit; revisit batching only if storage volume outgrows the demo.

## Files and setup

| File | Planned change |
| --- | --- |
| `package.json`, `package-lock.json` | Install `@netlify/blobs` using npm. |
| `public/index.html` | Add image controls, canvas, saved preview, hidden field, and item image. |
| `public/app.js` | Add crop/upload handling and explicit image state in existing form/render helpers. |
| `public/styles.css` | Add responsive square previews and item image styling. |
| `server/models.js` | Add optional `image` string validation. |
| `netlify/functions/image.js` | Add multipart upload and binary lookup. |
| `netlify/functions/cleanup-images.js` | Add daily orphan cleanup with existing database helpers. |
| `README.md` | Document image behavior, API, storage, expiration, and manual verification. |

Use a site-wide store so saved images survive redeployment. Netlify Functions supply storage credentials; no browser token is needed. Netlify Dev uses separate local blob storage, so pair it with a development MongoDB database. Site-wide stores are shared across deploy contexts: do not point a preview using a different database at the production image store or manually run cleanup against mismatched storage and database data. See [Blobs storage scope and local development](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## Manual acceptance checks

- Create, edit, cancel, delete, and reload experiences without images; current validation still works.
- Select landscape, portrait, square, small, and transparent images. Confirm centered coverage, a white background for transparency, and a 640 by 640 JPEG upload.
- Confirm selection uploads immediately, multipart contains only the exported file, and the resume request contains only the returned ID for the image.
- Save an image, reload, and edit text without changing it. Confirm PUT retains the image reference and the image still displays after redeployment.
- Replace an image, remove an image, and cancel an edit. Confirm MongoDB changes only on save and old blobs remain available until eligible for cleanup.
- Try an undecodable source, an upload failure, and a resume save failure. Confirm clear feedback, working retry, preserved prior image state, and no submission while uploading.
- Check missing/malformed IDs, missing blobs, bad multipart, wrong file types, oversized uploads, and unsupported API methods.
- With disposable local fixtures, manually invoke cleanup using `npx netlify-cli functions:invoke cleanup-images`. Verify that only unreferenced blobs older than 24 hours disappear, including fixtures beyond one listing page. Referenced blobs, exactly-24-hour-old blobs at the captured cutoff, younger blobs, and blobs with invalid metadata survive.
- Verify a MongoDB failure stops cleanup without deleting blobs, and repeated cleanup runs are safe. On Netlify, confirm the scheduled function is registered and inspect a manual run's logs using matching test data.

The capability is implemented in the files listed above. Use this checklist for local and deployed verification; a permanent automated test suite remains outside the existing demo's scope.
