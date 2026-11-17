import { randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers = { 'Cache-Control': 'no-store' };

export default async (request) => {
  if (!['GET', 'POST'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET, POST' } });
  }

  try {
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id || !uuidPattern.test(id)) {
        return Response.json({ error: 'Missing or invalid image ID.' }, { status: 400, headers });
      }
      const store = getStore('resume-images');
      const image = await store.get(id, { type: 'arrayBuffer' });
      if (image === null) return Response.json({ error: 'Image not found.' }, { status: 404, headers });
      return new Response(image, { headers: { ...headers, 'Content-Type': 'image/jpeg' } });
    }

    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
      return Response.json({ error: 'Send the image as multipart form data.' }, { status: 400, headers });
    }
    let form;
    try {
      form = await request.formData();
    } catch {
      return Response.json({ error: 'Invalid multipart form data.' }, { status: 400, headers });
    }
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) {
      return Response.json({ error: 'Choose a nonempty image file.' }, { status: 400, headers });
    }
    if (file.size > 2 * 1024 * 1024) {
      return Response.json({ error: 'Image must be no larger than 2 MiB.' }, { status: 413, headers });
    }
    const signature = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    if (file.type !== 'image/jpeg' || signature[0] !== 0xff || signature[1] !== 0xd8 || signature[2] !== 0xff) {
      return Response.json({ error: 'Upload a JPEG exported from the image canvas.' }, { status: 415, headers });
    }

    const id = randomUUID();
    const store = getStore('resume-images');
    await store.set(id, file, { metadata: { createdAt: Date.now() } });
    return Response.json({ id }, { status: 201, headers });
  } catch (error) {
    console.error('Image API error:', error.name);
    return Response.json({ error: 'Unable to process the image. Please try again later.' }, { status: 500, headers });
  }
};

export const config = { path: '/api/image' };
