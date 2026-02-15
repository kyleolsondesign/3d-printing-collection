import { execFile } from 'child_process';
import path from 'path';

export type SourcePlatform = 'makerworld' | 'printables' | 'thangs';

export interface PdfMetadata {
    source_platform: SourcePlatform | null;
    source_url: string | null;
    designer: string | null;
    designer_url: string | null;
    description: string | null;
    license: string | null;
    license_url: string | null;
    tags: string[];
}

/**
 * Detect source platform from PDF filename.
 */
export function detectPlatform(filename: string): SourcePlatform | null {
    const lower = filename.toLowerCase();
    if (lower.includes('makerworld')) return 'makerworld';
    if (lower.includes('printables')) return 'printables';
    if (lower.includes('thangs')) return 'thangs';
    return null;
}

/**
 * Extract designer name from PDF filename as a fallback.
 */
export function extractDesignerFromFilename(filename: string, platform: SourcePlatform | null): string | null {
    const base = path.basename(filename, '.pdf');

    if (platform === 'makerworld') {
        // "Model Name by Designer MakerWorld..." or "Remixed by Designer MakerWorld..."
        const match = base.match(/(?:Remixed )?by\s+(.+?)\s+MakerWorld/i);
        return match ? match[1].trim() : null;
    }
    if (platform === 'printables') {
        // "Model Name by Designer | Download..."
        const match = base.match(/by\s+(.+?)\s*\|/);
        return match ? match[1].trim() : null;
    }
    if (platform === 'thangs') {
        // "Model Name - 3D model by Designer on Thangs"
        const match = base.match(/by\s+(.+?)\s+on\s+Thangs/i);
        return match ? match[1].trim() : null;
    }

    // Generic fallback: "... by Designer"
    const match = base.match(/by\s+(.+?)$/i);
    return match ? match[1].trim() : null;
}

/**
 * Run pdftohtml and extract all href values from the output.
 */
export async function extractLinksFromPdf(pdfPath: string): Promise<string[]> {
    const html = await new Promise<string>((resolve, reject) => {
        execFile('pdftohtml', ['-stdout', '-noframes', '-i', pdfPath], {
            timeout: 10000,
            maxBuffer: 10 * 1024 * 1024 // 10MB
        }, (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });

    // Extract all href values
    const hrefPattern = /href="([^"]+)"/g;
    const links: string[] = [];
    let match;
    while ((match = hrefPattern.exec(html)) !== null) {
        links.push(match[1]);
    }
    return links;
}

/**
 * Run pdftotext and return the raw first-page text.
 */
export async function extractRawTextFromPdf(pdfPath: string): Promise<string | null> {
    try {
        const text = await new Promise<string>((resolve, reject) => {
            execFile('pdftotext', ['-l', '1', pdfPath, '-'], {
                timeout: 5000,
                maxBuffer: 1024 * 1024
            }, (error, stdout) => {
                if (error) reject(error);
                else resolve(stdout);
            });
        });
        return text?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Run pdftotext and extract a description from the output.
 */
export async function extractDescriptionFromPdf(pdfPath: string): Promise<string | null> {
    const text = await extractRawTextFromPdf(pdfPath);
    if (!text) return null;
    return parseDescription(text);
}

/**
 * Parse a description from pdftotext output.
 * Looks for text after "Description" or "Summary" headers.
 */
export function parseDescription(text: string): string | null {
    // Try to find description section
    const markers = ['Description\n', 'Summary\n'];
    for (const marker of markers) {
        const idx = text.indexOf(marker);
        if (idx !== -1) {
            const afterMarker = text.substring(idx + marker.length).trim();
            // Take lines until we hit a short line (likely a section header) or empty line
            const lines: string[] = [];
            for (const line of afterMarker.split('\n')) {
                const trimmed = line.trim();
                if (trimmed === '' && lines.length > 0) break;
                // Stop at likely section headers (short lines after content)
                if (lines.length > 0 && trimmed.length < 20 && trimmed.length > 0 && !trimmed.endsWith('.') && !trimmed.endsWith(',')) break;
                if (trimmed) lines.push(trimmed);
                if (lines.join(' ').length > 500) break;
            }
            const desc = lines.join(' ').substring(0, 500);
            if (desc.length > 20) return desc;
        }
    }
    return null;
}

/**
 * Classify extracted links into metadata fields based on URL patterns.
 */
export function classifyLinks(links: string[], platform: SourcePlatform | null): Omit<PdfMetadata, 'description'> {
    const result: Omit<PdfMetadata, 'description'> = {
        source_platform: platform,
        source_url: null,
        designer: null,
        designer_url: null,
        license: null,
        license_url: null,
        tags: [],
    };

    const seenTags = new Set<string>();

    for (const link of links) {
        // Creative Commons license (any platform)
        if (!result.license_url && link.includes('creativecommons.org/licenses/')) {
            result.license_url = link;
            result.license = parseLicenseFromUrl(link);
            continue;
        }
        if (!result.license_url && link.includes('creativecommons.org/share-your-work/public-domain')) {
            result.license_url = link;
            result.license = 'CC-PD';
            continue;
        }

        if (platform === 'makerworld') {
            classifyMakerWorldLink(link, result, seenTags);
        } else if (platform === 'printables') {
            classifyPrintablesLink(link, result, seenTags);
        } else if (platform === 'thangs') {
            classifyThangsLink(link, result, seenTags);
        }
    }

    return result;
}

function classifyMakerWorldLink(link: string, result: Omit<PdfMetadata, 'description'>, seenTags: Set<string>): void {
    // Source URL: https://makerworld.com/en/models/123456-model-name
    if (!result.source_url && /makerworld\.com\/en\/models\/\d+/.test(link)) {
        result.source_url = link;
    }

    // Designer profile: https://makerworld.com/en/@Username
    if (!result.designer_url && /makerworld\.com\/en\/@/.test(link)) {
        result.designer_url = link;
        const match = link.match(/\/@([^/?#]+)/);
        if (match) result.designer = decodeURIComponent(match[1]);
    }

    // Tags: https://makerworld.com/en/models/search?keyword=tag:%20kitchen
    const tagMatch = link.match(/keyword=tag:%20([^&]+)/);
    if (tagMatch) {
        const tag = decodeURIComponent(tagMatch[1]).toLowerCase().trim();
        if (tag && !seenTags.has(tag)) {
            seenTags.add(tag);
            result.tags.push(tag);
        }
    }
}

function classifyPrintablesLink(link: string, result: Omit<PdfMetadata, 'description'>, seenTags: Set<string>): void {
    // Source URL: https://www.printables.com/model/123456-model-name (no further subpath)
    if (!result.source_url && /printables\.com\/model\/\d+-[^/]+$/.test(link)) {
        result.source_url = link;
    }

    // Designer profile: https://www.printables.com/@Username
    if (!result.designer_url && /printables\.com\/@/.test(link)) {
        result.designer_url = link;
        const match = link.match(/\/@([^/?#]+)/);
        if (match) {
            // Printables usernames often have format @Name_123456, keep just the name part
            const raw = decodeURIComponent(match[1]);
            result.designer = raw.replace(/_\d+$/, '');
        }
    }
}

function classifyThangsLink(link: string, result: Omit<PdfMetadata, 'description'>, seenTags: Set<string>): void {
    // Source URL: https://thangs.com/designer/Name/3d-model/Title-123456
    // May have /memberships suffix — strip it
    if (!result.source_url && /thangs\.com\/designer\/[^/]+\/3d-model\//.test(link)) {
        result.source_url = link.replace(/\/memberships\/?$/, '');
    }

    // Designer profile: https://thangs.com/designer/Name (no further subpath beyond designer name)
    if (!result.designer_url && /thangs\.com\/designer\/[^/]+\/?$/.test(link)) {
        result.designer_url = link;
        const match = link.match(/\/designer\/([^/?#]+)/);
        if (match) result.designer = decodeURIComponent(match[1]);
    }

    // Also extract designer from 3d-model URL if no profile link found
    if (!result.designer) {
        const match = link.match(/thangs\.com\/designer\/([^/]+)/);
        if (match) result.designer = decodeURIComponent(match[1]);
    }

    // Tags: https://thangs.com/tag/kitchen
    const tagMatch = link.match(/thangs\.com\/tag\/([^/?#]+)/);
    if (tagMatch) {
        const tag = decodeURIComponent(tagMatch[1]).toLowerCase().trim();
        if (tag && !seenTags.has(tag)) {
            seenTags.add(tag);
            result.tags.push(tag);
        }
    }
}

/**
 * Parse a CC license type from a creativecommons.org URL.
 * e.g. https://creativecommons.org/licenses/by-nc/4.0/ → 'CC-BY-NC-4.0'
 */
export function parseLicenseFromUrl(url: string): string {
    const match = url.match(/creativecommons\.org\/licenses\/([^/?#]+)\/([^/?#]+)/);
    if (match) {
        return `CC-${match[1].toUpperCase()}-${match[2]}`;
    }
    if (url.includes('public-domain') || url.includes('cc0')) {
        return 'CC-PD';
    }
    return 'CC';
}

/**
 * Main extraction function: extract all metadata from a PDF file.
 */
export async function extractMetadataFromPdf(pdfPath: string): Promise<PdfMetadata> {
    const filename = path.basename(pdfPath);
    const platform = detectPlatform(filename);

    let links: string[] = [];
    try {
        links = await extractLinksFromPdf(pdfPath);
    } catch {
        // pdftohtml failed — fall back to filename-only extraction
    }

    const classified = classifyLinks(links, platform);

    // Fallback: extract designer from filename if not found in links
    if (!classified.designer) {
        classified.designer = extractDesignerFromFilename(filename, platform);
    }

    // Extract description from text content
    let description: string | null = null;
    try {
        description = await extractDescriptionFromPdf(pdfPath);
    } catch {
        // pdftotext failed — skip description
    }

    return {
        ...classified,
        description,
    };
}
