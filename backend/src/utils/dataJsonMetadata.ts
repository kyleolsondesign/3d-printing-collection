import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';

export type DataJsonPlatform = 'makerworld' | 'thangs';

export interface DataJsonMetadata {
    source_platform: DataJsonPlatform;
    source_url: string | null;
    title: string | null;
    designer: string | null;
    designer_url: string | null;
    description: string | null;
    license: string | null;
    license_url: string | null;
    tags: string[];
    imageUrls: string[];
}

/**
 * Strip HTML tags from a string, converting common block elements to spaces.
 */
export function stripHtml(html: string): string {
    return html
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<\/li>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Detect which platform a data.json file is from.
 * Returns null if the file doesn't match a known format.
 */
export function detectDataJsonPlatform(data: unknown): DataJsonPlatform | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const props = d?.props as Record<string, unknown> | undefined;
    const pageProps = props?.pageProps as Record<string, unknown> | undefined;

    if (pageProps?.design && typeof pageProps.design === 'object') {
        return 'makerworld';
    }
    const initialState = pageProps?.initialState as Record<string, unknown> | undefined;
    if (initialState?.model && typeof initialState.model === 'object') {
        return 'thangs';
    }

    return null;
}

function extractFromMakerworld(data: Record<string, unknown>): DataJsonMetadata {
    const props = data.props as Record<string, unknown>;
    const pageProps = props.pageProps as Record<string, unknown>;
    const design = pageProps.design as Record<string, unknown>;

    const id = design?.id as number | string | undefined;
    const title = (design?.title as string | undefined) ?? null;
    const summaryHtml = (design?.summary as string | undefined) ?? null;
    const description = summaryHtml ? stripHtml(summaryHtml).substring(0, 2000) : null;

    const rawTags = design?.tags as string[] | undefined;
    const tags = Array.isArray(rawTags) ? rawTags.filter(t => typeof t === 'string') : [];

    const designCreator = design?.designCreator as Record<string, unknown> | undefined;
    const designerName = (designCreator?.name as string | undefined) ?? null;
    const handle = (designCreator?.handle as string | undefined) ?? null;
    const designer_url = handle ? `https://makerworld.com/en/@${handle}` : null;

    const source_url = id != null ? `https://makerworld.com/en/models/${id}` : null;

    // License: MakerWorld uses plain string licenses, not CC URLs
    const licenseRaw = (design?.license as string | undefined) ?? null;
    // Only keep if it looks like a real license description
    const license = licenseRaw && licenseRaw.length < 200 ? licenseRaw : null;

    // Images: design_pictures filtered to non-real-life-photos
    const designExtension = design?.designExtension as Record<string, unknown> | undefined;
    const designPictures = designExtension?.design_pictures as Array<Record<string, unknown>> | undefined;
    const imageUrls: string[] = [];
    if (Array.isArray(designPictures)) {
        for (const pic of designPictures) {
            if (pic?.isRealLifePhoto === 0 || pic?.isRealLifePhoto === false) {
                const url = pic?.url as string | undefined;
                if (url && typeof url === 'string') {
                    imageUrls.push(url);
                }
            }
        }
    }

    // If no non-real-life photos found, try coverUrl as fallback
    if (imageUrls.length === 0) {
        const coverUrl = design?.coverUrl as string | undefined;
        if (coverUrl) imageUrls.push(coverUrl);
    }

    return {
        source_platform: 'makerworld',
        source_url,
        title,
        designer: designerName,
        designer_url,
        description,
        license,
        license_url: null, // MakerWorld doesn't use CC license URLs
        tags,
        imageUrls,
    };
}

function extractFromThangs(data: Record<string, unknown>): DataJsonMetadata {
    const props = data.props as Record<string, unknown>;
    const pageProps = props.pageProps as Record<string, unknown>;
    const initialState = pageProps.initialState as Record<string, unknown>;
    const modelState = initialState.model as Record<string, unknown>;
    const modelData = modelState.data as Record<string, unknown>;

    const id = modelData?.id as number | string | undefined;
    const title = (modelData?.name as string | undefined) ?? null;
    const description = (modelData?.description as string | undefined)?.substring(0, 2000) ?? null;

    const rawTags = modelData?.tags as string[] | undefined;
    const tags = Array.isArray(rawTags) ? rawTags.filter(t => typeof t === 'string') : [];

    const owner = modelData?.owner as Record<string, unknown> | undefined;
    const designerUsername = (owner?.username as string | undefined) ?? null;
    const designerFullName = (owner?.fullName as string | undefined) ?? null;
    const designer = designerUsername || designerFullName;
    const designer_url = designerUsername
        ? `https://thangs.com/designer/${encodeURIComponent(designerUsername)}`
        : null;

    // Source URL: constructed from owner username + model id + name slug
    let source_url: string | null = null;
    if (designerUsername && id != null && title) {
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + id;
        source_url = `https://thangs.com/designer/${encodeURIComponent(designerUsername)}/3d-model/${slug}`;
    }

    // Images: attachments uploaded by the model owner
    const attachments = modelData?.attachments as Array<Record<string, unknown>> | undefined;
    const imageUrls: string[] = [];
    if (Array.isArray(attachments)) {
        for (const att of attachments) {
            if (att?.uploadedByModelOwner === true) {
                const url = (att?.imageUrl as string | undefined) ?? (att?.enhancedImageUrl as string | undefined);
                if (url && typeof url === 'string') {
                    imageUrls.push(url);
                }
            }
        }
    }

    return {
        source_platform: 'thangs',
        source_url,
        title,
        designer,
        designer_url,
        description,
        license: null,
        license_url: null,
        tags,
        imageUrls,
    };
}

/**
 * Read and parse the data.json file in a folder, returning structured metadata.
 * Returns null if no data.json exists or if the format is unrecognized.
 */
export async function extractMetadataFromDataJson(folderPath: string): Promise<DataJsonMetadata | null> {
    const jsonPath = path.join(folderPath, 'data.json');

    if (!fs.existsSync(jsonPath)) return null;

    let data: unknown;
    try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        data = JSON.parse(raw);
    } catch {
        return null;
    }

    const platform = detectDataJsonPlatform(data);
    if (!platform) return null;

    try {
        if (platform === 'makerworld') {
            return extractFromMakerworld(data as Record<string, unknown>);
        } else {
            return extractFromThangs(data as Record<string, unknown>);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[dataJson] Failed to extract metadata from ${jsonPath}: ${msg}`);
        return null;
    }
}

/**
 * Download an image from a URL and save it to destPath.
 * Follows up to 3 redirects. Returns true on success.
 */
export function downloadImageFromUrl(url: string, destPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const attempt = (currentUrl: string, redirectsLeft: number) => {
            const lib = currentUrl.startsWith('https') ? https : http;
            const req = lib.get(currentUrl, { timeout: 15000 }, (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectsLeft > 0) {
                        res.resume();
                        attempt(res.headers.location, redirectsLeft - 1);
                    } else {
                        res.resume();
                        resolve(false);
                    }
                    return;
                }
                if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
                    res.resume();
                    resolve(false);
                    return;
                }
                const contentType = res.headers['content-type'] ?? '';
                if (!contentType.startsWith('image/')) {
                    res.resume();
                    resolve(false);
                    return;
                }
                const file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close(() => resolve(true));
                });
                file.on('error', () => {
                    fs.unlink(destPath, () => {});
                    resolve(false);
                });
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        };
        attempt(url, 3);
    });
}
