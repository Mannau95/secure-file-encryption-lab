/**
 * Formats a number of bytes into human-readable string (e.g. 1.25 MB)
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

/**
 * Formats seconds into human-readable mm:ss format
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatTime(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${pad(hours)}:${pad(remainingMinutes)}:${pad(seconds)}`;
  }
  
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats a timestamp into human-readable date and time
 * @param {number|string|Date} timestamp
 * @returns {string}
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return 'Invalid date';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch {
    return 'Invalid date';
  }
}

/**
 * Truncates long file paths preserving basename
 * @param {string} fullPath
 * @param {number} maxLength
 * @returns {string}
 */
export function truncatePath(fullPath, maxLength = 45) {
  if (!fullPath || fullPath.length <= maxLength) return fullPath || '';
  
  const separator = fullPath.includes('/') ? '/' : '\\';
  const parts = fullPath.split(separator);
  
  if (parts.length <= 2) {
    return `${fullPath.slice(0, 15)}...${fullPath.slice(-20)}`;
  }
  
  const filename = parts[parts.length - 1];
  const startDir = parts[0] + separator + parts[1];
  
  if (startDir.length + filename.length + 5 < maxLength) {
    return `${startDir}${separator}...${separator}${filename}`;
  }
  
  return `...${separator}${filename}`;
}

/**
 * Extracts the file basename from a full path
 * @param {string} fullPath
 * @returns {string}
 */
export function getFilenameFromPath(fullPath) {
  if (!fullPath) return '';
  const separator = fullPath.includes('/') ? '/' : '\\';
  const parts = fullPath.split(separator);
  return parts[parts.length - 1] || fullPath;
}

/**
 * Extracts extension from filename or path (without dot)
 * @param {string} filenameOrPath
 * @returns {string}
 */
export function getFileExtension(filenameOrPath) {
  if (!filenameOrPath) return '';
  const basename = getFilenameFromPath(filenameOrPath);
  const dotIndex = basename.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === 0) return '';
  return basename.slice(dotIndex + 1).toLowerCase();
}
