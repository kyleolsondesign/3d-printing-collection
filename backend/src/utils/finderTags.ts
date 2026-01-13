import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type FinderTagColor = 'None' | 'Gray' | 'Green' | 'Purple' | 'Blue' | 'Yellow' | 'Red' | 'Orange';

// Map our app states to Finder tag colors
export const TAG_COLORS = {
    PRINTED_GOOD: 'Green' as FinderTagColor,
    PRINTED_BAD: 'Red' as FinderTagColor,
    QUEUED: 'Blue' as FinderTagColor,
};

/**
 * Read Finder tags from a file or folder.
 * Returns an array of tag names (e.g., ['Green', 'Blue']).
 */
export async function getFinderTags(path: string): Promise<string[]> {
    try {
        const { stdout } = await execAsync(`mdls -raw -name kMDItemUserTags "${path.replace(/"/g, '\\"')}"`, {
            timeout: 5000
        });

        // mdls returns "(null)" if no tags, or a plist-like format for tags
        if (stdout.trim() === '(null)' || stdout.trim() === '') {
            return [];
        }

        // Parse the output format: (\n    "TagName",\n    "TagName2"\n)
        // or for single tags: (\n    TagName\n)
        const matches = stdout.match(/(?:^|\s)([A-Za-z]+)(?:\n|,|$)/g);
        if (!matches) {
            return [];
        }

        return matches
            .map(m => m.trim().replace(/,/g, ''))
            .filter(t => t && t !== '(' && t !== ')');
    } catch (error) {
        // File might not exist or mdls failed
        return [];
    }
}

/**
 * Set Finder tags on a file or folder.
 * This replaces all existing tags with the new ones.
 */
export async function setFinderTags(path: string, tags: string[]): Promise<boolean> {
    try {
        const escapedPath = path.replace(/"/g, '\\"');

        if (tags.length === 0) {
            // Remove all tags
            await execAsync(`xattr -d com.apple.metadata:_kMDItemUserTags "${escapedPath}" 2>/dev/null || true`);
            return true;
        }

        // Create XML plist for tags
        const tagsXml = tags.map(t => `<string>${t}</string>`).join('');
        const plistXml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array>${tagsXml}</array></plist>`;

        // Convert to binary plist and write to xattr
        // Use a temp approach: write XML, convert to binary, apply to file
        await execAsync(
            `echo '${plistXml}' | plutil -convert binary1 -o - - | xattr -wx com.apple.metadata:_kMDItemUserTags "$(xxd -p | tr -d '\\n')" "${escapedPath}"`,
            { shell: '/bin/bash' }
        );

        return true;
    } catch (error) {
        // Try alternative method using tag command if available
        try {
            const escapedPath = path.replace(/"/g, '\\"');
            // First clear existing tags
            await execAsync(`xattr -d com.apple.metadata:_kMDItemUserTags "${escapedPath}" 2>/dev/null || true`);

            if (tags.length > 0) {
                // Use AppleScript as fallback
                const tagsStr = tags.map(t => `"${t}"`).join(', ');
                await execAsync(
                    `osascript -e 'tell application "Finder" to set label index of (POSIX file "${escapedPath}" as alias) to 0'`,
                    { timeout: 5000 }
                );

                // For color tags, we can set them via xattr with a simpler method
                await setFinderTagsSimple(path, tags);
            }
            return true;
        } catch (fallbackError) {
            console.error(`Failed to set Finder tags on ${path}:`, fallbackError);
            return false;
        }
    }
}

/**
 * Simpler method to set a single color tag using pre-computed binary plists.
 */
async function setFinderTagsSimple(path: string, tags: string[]): Promise<boolean> {
    try {
        const escapedPath = path.replace(/"/g, '\\"').replace(/'/g, "'\\''");

        // Pre-computed binary plist hex values for common tags
        const tagHexValues: Record<string, string> = {
            'Green': '62706c6973743030a10157477265656e0a3108 0a00000000000001010000000000000002000000000000000000000000000012',
            'Red': '62706c6973743030a1015352656408000a0000 00000000010100000000000000020000000000000000000000000000000f',
            'Blue': '62706c6973743030a10154426c756508000b00 0000000000010100000000000000020000000000000000000000000000000010',
            'Yellow': '62706c6973743030a1015659656c6c6f770a31 080b000000000000010100000000000000020000000000000000000000000013',
            'Orange': '62706c6973743030a10156 4f72616e67650a31080b0000000000000101000000000000000200000000000000000000000000000013',
            'Purple': '62706c6973743030a10156 507572706c650a31080b0000000000000101000000000000000200000000000000000000000000000013',
            'Gray': '62706c6973743030a101544772617908000b00 0000000000010100000000000000020000000000000000000000000000000010',
        };

        // For single tags, use the pre-computed values
        if (tags.length === 1 && tagHexValues[tags[0]]) {
            const hex = tagHexValues[tags[0]].replace(/\s/g, '');
            execSync(`xattr -wx com.apple.metadata:_kMDItemUserTags "${hex}" "${escapedPath}"`, {
                timeout: 5000
            });
            return true;
        }

        // For multiple tags or unknown tags, build dynamically
        // This is a simplified approach that may not work for all cases
        return false;
    } catch (error) {
        return false;
    }
}

/**
 * Add a tag to a file without removing existing tags.
 */
export async function addFinderTag(path: string, tag: string): Promise<boolean> {
    const existingTags = await getFinderTags(path);
    if (!existingTags.includes(tag)) {
        return setFinderTags(path, [...existingTags, tag]);
    }
    return true;
}

/**
 * Remove a specific tag from a file.
 */
export async function removeFinderTag(path: string, tag: string): Promise<boolean> {
    const existingTags = await getFinderTags(path);
    const newTags = existingTags.filter(t => t !== tag);
    if (newTags.length !== existingTags.length) {
        return setFinderTags(path, newTags);
    }
    return true;
}

/**
 * Check if a path has a specific tag.
 */
export async function hasFinderTag(path: string, tag: string): Promise<boolean> {
    const tags = await getFinderTags(path);
    return tags.includes(tag);
}

/**
 * Parse model state from Finder tags.
 * Returns the print status and queue status based on tag colors.
 */
export function parseModelStateFromTags(tags: string[]): {
    isPrinted: boolean;
    printRating: 'good' | 'bad' | null;
    isQueued: boolean;
} {
    const hasGreen = tags.includes('Green');
    const hasRed = tags.includes('Red');
    const hasBlue = tags.includes('Blue');

    return {
        isPrinted: hasGreen || hasRed,
        printRating: hasGreen ? 'good' : (hasRed ? 'bad' : null),
        isQueued: hasBlue,
    };
}

/**
 * Get the tags that should be set for a model's current state.
 */
export function getTagsForModelState(options: {
    isPrinted: boolean;
    printRating: 'good' | 'bad' | null;
    isQueued: boolean;
}): string[] {
    const tags: string[] = [];

    if (options.isPrinted) {
        tags.push(options.printRating === 'good' ? 'Green' : 'Red');
    }

    if (options.isQueued) {
        tags.push('Blue');
    }

    return tags;
}
