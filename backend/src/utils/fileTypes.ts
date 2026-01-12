import path from 'path';

// Supported 3D model file extensions
export const MODEL_EXTENSIONS = ['.stl', '.3mf', '.gcode', '.obj', '.ply', '.amf'];

// Image extensions
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

// Document extensions
export const DOCUMENT_EXTENSIONS = ['.pdf'];

// Archive extensions
export const ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z'];

export type FileType = 'model' | 'image' | 'document' | 'archive' | 'unknown';

export function getFileType(filepath: string): FileType {
    const ext = path.extname(filepath).toLowerCase();

    if (MODEL_EXTENSIONS.includes(ext)) {
        return 'model';
    } else if (IMAGE_EXTENSIONS.includes(ext)) {
        return 'image';
    } else if (DOCUMENT_EXTENSIONS.includes(ext)) {
        return 'document';
    } else if (ARCHIVE_EXTENSIONS.includes(ext)) {
        return 'archive';
    }

    return 'unknown';
}

export function isModelFile(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return MODEL_EXTENSIONS.includes(ext);
}

export function isImageFile(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
}

export function isDocumentFile(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return DOCUMENT_EXTENSIONS.includes(ext);
}

export function isArchiveFile(filepath: string): boolean {
    const ext = path.extname(filepath).toLowerCase();
    return ARCHIVE_EXTENSIONS.includes(ext);
}
