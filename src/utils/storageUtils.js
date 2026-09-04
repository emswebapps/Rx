import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { generateId } from './id';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileCategory(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'doc';
  return 'file';
}

/**
 * Upload a file to Firebase Storage.
 * @param {string} basePath  e.g. "users/uid123/bills/bill456"
 * @param {File}   file      the File object from an input or drop event
 * @param {Function} onProgress  called with 0-100 during upload
 * @returns {Promise<{id,name,url,type,size,uploadedAt}>}
 */
export async function uploadFile(basePath, file, onProgress) {
  if (file.size > MAX_SIZE_BYTES) throw new Error('File too large (max 10 MB)');

  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const id = generateId();
  const storedName = ext ? `${id}.${ext}` : id;
  const storageRef = ref(storage, `${basePath}/${storedName}`);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            id,
            name: file.name,
            url,
            type: file.type,
            size: file.size,
            uploadedAt: new Date().toISOString(),
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * Delete a file from Firebase Storage by its download URL.
 * Silently ignores not-found errors.
 */
export async function deleteFile(url) {
  try {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  } catch (err) {
    if (err.code !== 'storage/object-not-found') throw err;
  }
}
