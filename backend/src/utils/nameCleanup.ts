/**
 * Cleans up folder names to create friendly model names
 * - Replaces underscores and hyphens with spaces
 * - Removes leading/trailing numbers and special chars
 * - Title cases words
 * - Removes common file suffixes
 */
export function cleanupFolderName(folderName: string): string {
    let cleaned = folderName;

    // Replace underscores and hyphens with spaces
    cleaned = cleaned.replace(/[_-]/g, ' ');

    // Remove common file extensions that might be in folder names
    cleaned = cleaned.replace(/\.(stl|3mf|obj|gcode|ply|amf|zip|rar|7z)$/i, '');

    // Remove leading numbers followed by space/dash/underscore (e.g., "001 ", "01-", "1_")
    cleaned = cleaned.replace(/^\d+[\s\-_]+/, '');

    // Remove trailing numbers in parentheses (e.g., " (1)", " (copy)")
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/g, '');

    // Remove version numbers (v1, v2, etc.)
    cleaned = cleaned.replace(/\s+v\d+$/i, '');

    // Remove "copy", "final", "final2" etc at the end
    cleaned = cleaned.replace(/\s+(copy|final|latest|new|old|backup)\d*$/i, '');

    // Trim extra whitespace
    cleaned = cleaned.trim();

    // Replace multiple spaces with single space
    cleaned = cleaned.replace(/\s+/g, ' ');

    // Title case (capitalize first letter of each word)
    cleaned = cleaned.replace(/\b\w/g, (char) => char.toUpperCase());

    return cleaned || folderName; // Return original if cleaned is empty
}
