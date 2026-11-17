const form = document.querySelector('#resume-form');
const formStatus = document.querySelector('#form-status');
const resumeStatus = document.querySelector('#resume-status');
const resumeItems = document.querySelector('#resume-items');
const template = document.querySelector('#resume-item-template');
const submitButton = form.querySelector('button[type="submit"]');
const cancelEditButton = document.querySelector('#cancel-edit');
const fields = [...form.querySelectorAll('input[type="text"], input[type="number"], input[type="url"], textarea')];
const imageFile = document.querySelector('#image-file');
const imageId = document.querySelector('#image');
const imageCanvas = document.querySelector('#image-canvas');
const savedImage = document.querySelector('#saved-image');
const imageStatus = document.querySelector('#image-status');
const removeImageButton = document.querySelector('#remove-image');
let editingId = null;
let busy = false;

function setBusy(value) {
  busy = value;
  submitButton.disabled = value;
  cancelEditButton.disabled = value;
  imageFile.disabled = value;
  removeImageButton.disabled = value;
  for (const field of fields) field.disabled = value;
  for (const button of resumeItems.querySelectorAll('button')) button.disabled = value;
}

function clearForm() {
  editingId = null;
  form.reset();
  imageId.value = '';
  showSavedImage();
  imageStatus.textContent = '';
  imageStatus.classList.remove('error');
  submitButton.textContent = 'Save';
  cancelEditButton.hidden = true;
  for (const field of fields) {
    field.setCustomValidity('');
    field.removeAttribute('aria-invalid');
    document.getElementById(`${field.id}-error`).textContent = '';
  }
}

function editItem(item) {
  if (busy) return;
  clearForm();
  editingId = item._id;
  for (const field of fields) field.value = item[field.name] ?? '';
  imageId.value = item.image ?? '';
  showSavedImage();
  submitButton.textContent = 'Save changes';
  cancelEditButton.hidden = false;
  formStatus.textContent = 'Editing experience.';
  fields[0].focus();
}

cancelEditButton.addEventListener('click', () => {
  clearForm();
  formStatus.textContent = 'Edit cancelled.';
  fields[0].focus();
});

function showSavedImage() {
  imageCanvas.hidden = true;
  imageCanvas.getContext('2d').clearRect(0, 0, 640, 640);
  savedImage.hidden = !imageId.value;
  removeImageButton.hidden = !imageId.value;
  if (imageId.value) savedImage.src = `/api/image?id=${encodeURIComponent(imageId.value)}`;
  else savedImage.removeAttribute('src');
}

savedImage.addEventListener('error', () => {
  if (!imageId.value || savedImage.hidden) return;
  savedImage.hidden = true;
  imageStatus.textContent = 'Current image unavailable. You can replace or remove it.';
});

removeImageButton.addEventListener('click', () => {
  if (busy) return;
  imageId.value = '';
  imageFile.value = '';
  showSavedImage();
  imageStatus.classList.remove('error');
  imageStatus.textContent = 'Image removed from the form. Save the experience to keep this change.';
});

imageFile.addEventListener('change', async () => {
  const file = imageFile.files[0];
  if (busy || !file) return;
  setBusy(true);
  imageStatus.textContent = 'Preparing and uploading image…';
  imageStatus.classList.remove('error');
  let objectUrl;
  try {
    objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Choose a readable image.');

    const size = 640;
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const context = imageCanvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    savedImage.hidden = true;
    imageCanvas.hidden = false;

    const blob = await new Promise((resolve) => imageCanvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Unable to export the image. Please choose it again.');
    if (blob.size > 2 * 1024 * 1024) throw new Error('The cropped image is too large. Choose another image.');

    const upload = new FormData();
    upload.append('file', blob, 'image.jpg');
    const response = await fetch('/api/image', { method: 'POST', body: upload });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Unable to upload the image. Please choose it again.');
    if (typeof body.id !== 'string' || !body.id) throw new Error('Upload returned no image ID. Please try again.');
    imageId.value = body.id;
    removeImageButton.hidden = false;
    imageStatus.textContent = 'Image uploaded. Save the experience to keep it.';
  } catch (error) {
    showSavedImage();
    imageStatus.classList.add('error');
    imageStatus.textContent = error.name === 'EncodingError'
      ? 'Unable to read this image. Choose a browser-supported image.'
      : error.message || 'Unable to upload the image. Please choose it again.';
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    imageFile.value = '';
    setBusy(false);
  }
});

function validateField(field) {
  if (field.type === 'text' || field.tagName === 'TEXTAREA') {
    field.setCustomValidity(field.validity.valueMissing || field.value.trim() ? '' : 'Enter a value that is not just whitespace.');
  }
  const valid = field.checkValidity();
  document.getElementById(`${field.id}-error`).textContent = valid ? '' : field.validationMessage;
  if (valid) field.removeAttribute('aria-invalid');
  else field.setAttribute('aria-invalid', 'true');
  return valid;
}

for (const field of fields) {
  field.addEventListener('input', () => validateField(field));
  field.addEventListener('blur', () => validateField(field));
}

async function loadItems() {
  resumeStatus.textContent = 'Loading experiences…';
  try {
    const response = await fetch('/api/resume-items');
    if (!response.ok) throw new Error('Unable to load experiences. Please try again later.');
    const items = await response.json();
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const node = template.content.cloneNode(true);
      node.querySelector('article').dataset.itemId = item._id;
      node.querySelector('.job-title').textContent = item.job_title;
      node.querySelector('.employer').textContent = item.employer;
      node.querySelector('.dates').textContent = `${item.start_year} – ${item.end_year ?? 'Present'}`;
      node.querySelector('.accomplishment').textContent = item.accomplishment;
      if (item.url) {
        const url = node.querySelector('.item-url');
        const link = url.querySelector('a');
        link.textContent = item.url;
        // Only web addresses become clickable links in the shared resume.
        if (/^https?:\/\//i.test(item.url)) link.href = item.url;
        url.hidden = false;
      }
      if (item.image) {
        node.querySelector('.experience-media').hidden = false;
        const image = node.querySelector('.experience-image');
        image.alt = `Image for ${item.job_title} at ${item.employer}`;
        image.addEventListener('error', () => {
          image.hidden = true;
          image.nextElementSibling.hidden = false;
        });
        image.src = `/api/image?id=${encodeURIComponent(item.image)}`;
        image.hidden = false;
      }
      const editButton = node.querySelector('.edit-item');
      const deleteButton = node.querySelector('.delete-item');
      editButton.setAttribute('aria-label', `Edit ${item.job_title} at ${item.employer}`);
      deleteButton.setAttribute('aria-label', `Delete ${item.job_title} at ${item.employer}`);
      editButton.disabled = busy;
      deleteButton.disabled = busy;
      editButton.addEventListener('click', () => editItem(item));
      deleteButton.addEventListener('click', () => deleteItem(item, deleteButton.closest('article')));
      fragment.append(node);
    }
    resumeItems.replaceChildren(fragment);
    resumeStatus.textContent = items.length ? '' : 'No experiences yet. Add the first one above.';
    return true;
  } catch {
    resumeStatus.textContent = 'Unable to load experiences. Please refresh the page to try again.';
    return false;
  }
}

async function deleteItem(item, article) {
  if (busy || !confirm(`Delete ${item.job_title} at ${item.employer}?`)) return;
  setBusy(true);
  resumeStatus.textContent = 'Deleting experience…';
  try {
    const response = await fetch(`/api/resume-item?id=${encodeURIComponent(item._id)}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to delete the experience. Please try again.');
    }
    article.remove();
    if (editingId === item._id) {
      clearForm();
      formStatus.textContent = 'The experience you were editing was deleted.';
    }
    if (await loadItems()) {
      resumeStatus.textContent = resumeItems.children.length ? 'Experience deleted.' : 'Experience deleted. No experiences yet.';
    }
    else resumeStatus.textContent = 'Experience deleted, but the resume could not be refreshed.';
  } catch (error) {
    resumeStatus.textContent = error.message || 'Unable to delete the experience. Please try again.';
  } finally {
    setBusy(false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  formStatus.textContent = '';
  const validity = fields.map(validateField);
  if (validity.includes(false)) {
    fields[validity.indexOf(false)].focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  if (!data.end_year) delete data.end_year;
  if (!data.image) delete data.image;
  if (!data.url) delete data.url;
  const isEditing = editingId !== null;
  const url = isEditing ? `/api/resume-item?id=${encodeURIComponent(editingId)}` : '/api/resume-item';
  setBusy(true);
  formStatus.textContent = 'Saving experience…';
  try {
    const response = await fetch(url, {
      method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Unable to save the experience. Please try again.');
    }
    if (isEditing) {
      for (const article of resumeItems.querySelectorAll('article')) {
        if (article.dataset.itemId === editingId) article.remove();
      }
    }
    clearForm();
    formStatus.textContent = isEditing ? 'Experience updated.' : 'Experience saved.';
    if (!await loadItems()) formStatus.textContent = 'Experience saved, but the resume could not be refreshed.';
  } catch (error) {
    formStatus.textContent = error.message || 'Unable to save the experience. Please try again.';
  } finally {
    setBusy(false);
  }
});

loadItems();
