import Anthropic from '@anthropic-ai/sdk';
import db from '../config/database.js';
import { tokenize, expandWithSynonyms, scoreTokensVsCategory, NOISE_WORDS } from './categorization.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModelContext {
    id: number;
    filename: string;
    category: string;
    description: string | null;
    rawPdfTags: string[];
    fileNames: string[];
}

interface AutotagResult {
    modelId: number;
    modelName: string;
    tagsAdded: string[];
}

interface AutotagResponse {
    processed: number;
    tagged: number;
    results: AutotagResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildModelContext(models: ModelContext[]): void {
    // Nothing to build — context is already in the struct
}

/** Load model contexts in two batch queries (avoids N+1). */
function loadModelContexts(modelIds: number[]): ModelContext[] {
    if (modelIds.length === 0) return [];

    const placeholders = modelIds.map(() => '?').join(', ');

    const rows = db.prepare(`
        SELECT m.id, m.filename, m.category,
               mm.description
        FROM models m
        LEFT JOIN model_metadata mm ON mm.model_id = m.id
        WHERE m.id IN (${placeholders}) AND m.deleted_at IS NULL
    `).all(...modelIds) as Array<{
        id: number;
        filename: string;
        category: string;
        description: string | null;
    }>;

    const fileRows = db.prepare(`
        SELECT model_id, filename
        FROM model_files
        WHERE model_id IN (${placeholders})
    `).all(...modelIds) as Array<{ model_id: number; filename: string }>;

    const filesByModel = new Map<number, string[]>();
    for (const f of fileRows) {
        if (!filesByModel.has(f.model_id)) filesByModel.set(f.model_id, []);
        filesByModel.get(f.model_id)!.push(f.filename);
    }

    return rows.map(row => {
        return {
            id: row.id,
            filename: row.filename,
            category: row.category,
            description: row.description,
            rawPdfTags: [] as string[],
            fileNames: filesByModel.get(row.id) || [],
        };
    });
}

/** Upsert tags and model_tag associations in a transaction. Returns array of new tag names added. */
function applyTags(modelId: number, tagNames: string[], source: string): string[] {
    const applied: string[] = [];
    db.transaction(() => {
        for (const name of tagNames) {
            const trimmed = name.trim().toLowerCase();
            if (!trimmed) continue;
            let tag = db.prepare('SELECT id FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number } | undefined;
            if (!tag) {
                const result = db.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(trimmed, source);
                tag = { id: Number(result.lastInsertRowid) };
            }
            const existing = db.prepare('SELECT 1 FROM model_tags WHERE model_id = ? AND tag_id = ?').get(modelId, tag.id);
            if (!existing) {
                db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tag.id);
                applied.push(trimmed);
            }
        }
    })();
    return applied;
}

// ── Heuristic auto-tagging ────────────────────────────────────────────────────

/** Score existing tags against a model's context and return best matches. */
function suggestTagsHeuristic(model: ModelContext, existingTags: Array<{ name: string }>, maxTags: number): string[] {
    // Build context tokens from all available sources
    const nameTokens = expandWithSynonyms(tokenize(model.filename));
    const descTokens = model.description
        ? expandWithSynonyms(tokenize(model.description.substring(0, 500)))
        : [];
    const pdfTagTokens = expandWithSynonyms(model.rawPdfTags.flatMap(t => tokenize(t)));
    const fileTokens = expandWithSynonyms(
        model.fileNames.flatMap(fn => {
            const base = fn.replace(/\.(stl|3mf|obj|gcode|ply|amf|zip|rar|7z)$/i, '');
            return tokenize(base);
        })
    );
    const allTokens = Array.from(new Set([...nameTokens, ...descTokens, ...pdfTagTokens, ...fileTokens]));

    const scored: Array<{ name: string; score: number }> = [];
    for (const tag of existingTags) {
        const tagTokens = tokenize(tag.name);
        if (tagTokens.length === 0) continue;
        const score = scoreTokensVsCategory(allTokens, tagTokens);
        if (score >= 0.4) {
            scored.push({ name: tag.name, score });
        }
    }

    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
        return scored.slice(0, maxTags).map(s => s.name);
    }

    // Fallback: derive new tags from notable noun tokens in the context
    const contextStr = [model.filename, model.description || ''].join(' ');
    const candidates = tokenize(contextStr).filter(t => t.length >= 4 && !NOISE_WORDS.has(t));
    return [...new Set(candidates)].slice(0, Math.min(3, maxTags));
}

// ── Claude auto-tagging ───────────────────────────────────────────────────────

const AUTOTAG_PROMPT = `You are tagging 3D printing models with descriptive keywords.

Existing tags in the collection:
{existingTags}

For each model below, suggest up to {maxTags} relevant tags.
Prefer existing tags when they fit well. You may suggest new tags if none of the existing ones are appropriate.
Use short, lowercase, descriptive words. Avoid: platform names, 'free', '3d', 'print', 'model', 'stl', 'file'.

Models:
{models}

Respond with ONLY a JSON array, one entry per model in order:
[{"tags": ["tag1", "tag2"]}, ...]

No explanation, just the JSON array.`;

function formatModelForPrompt(model: ModelContext, index: number): string {
    const lines = [`${index + 1}. "${model.filename}"`];
    if (model.category) lines.push(`   Category: ${model.category}`);
    if (model.fileNames.length > 0) {
        const displayNames = model.fileNames.slice(0, 5).join(', ');
        lines.push(`   Files: ${displayNames}`);
    }
    if (model.description) {
        lines.push(`   Description: "${model.description.substring(0, 300)}"`);
    }
    if (model.rawPdfTags.length > 0) {
        lines.push(`   PDF tags: ${model.rawPdfTags.slice(0, 10).join(', ')}`);
    }
    return lines.join('\n');
}

async function suggestTagsWithClaude(
    models: ModelContext[],
    existingTagNames: string[],
    apiKey: string,
    maxTags: number
): Promise<Map<number, string[]>> {
    const client = new Anthropic({ apiKey });
    const results = new Map<number, string[]>();

    // Batch in groups of 10
    const BATCH_SIZE = 10;
    for (let i = 0; i < models.length; i += BATCH_SIZE) {
        const batch = models.slice(i, i + BATCH_SIZE);
        const modelList = batch.map((m, j) => formatModelForPrompt(m, j)).join('\n\n');
        const tagList = existingTagNames.slice(0, 200).join(', '); // cap to avoid prompt bloat

        const prompt = AUTOTAG_PROMPT
            .replace('{existingTags}', tagList || '(none yet)')
            .replace('{maxTags}', String(maxTags))
            .replace('{models}', modelList);

        try {
            const response = await client.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 2048,
                messages: [{ role: 'user', content: prompt }]
            });

            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) continue;

            const parsed = JSON.parse(jsonMatch[0]) as Array<{ tags?: string[] }>;
            for (let j = 0; j < batch.length && j < parsed.length; j++) {
                const tags = (parsed[j].tags || [])
                    .map((t: string) => t.trim().toLowerCase())
                    .filter((t: string) => t.length > 0 && t.length <= 50);
                results.set(batch[j].id, tags);
            }
        } catch (err) {
            console.error('Claude autotag batch error:', err);
            // Continue with remaining batches
        }
    }

    return results;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function autotagModels(opts: {
    modelIds?: number[];
    minTagCount?: number;
    useAi?: boolean;
    dryRun?: boolean;
}): Promise<AutotagResponse> {
    const { minTagCount = 2, useAi = false, dryRun = false } = opts;
    const maxTagsPerModel = 5;

    // Find models with fewer tags than the threshold
    let targetIds: number[];
    if (opts.modelIds && opts.modelIds.length > 0) {
        targetIds = opts.modelIds;
    } else {
        const rows = db.prepare(`
            SELECT m.id FROM models m
            WHERE m.deleted_at IS NULL
              AND (SELECT COUNT(*) FROM model_tags WHERE model_id = m.id) <= ?
        `).all(minTagCount) as Array<{ id: number }>;
        targetIds = rows.map(r => r.id);
    }

    if (targetIds.length === 0) {
        return { processed: 0, tagged: 0, results: [] };
    }

    const contexts = loadModelContexts(targetIds);

    // Load all existing tags for heuristic scoring / Claude context
    const existingTags = db.prepare('SELECT id, name FROM tags ORDER BY name ASC').all() as Array<{ id: number; name: string }>;
    const existingTagNames = existingTags.map(t => t.name);

    let aiResults: Map<number, string[]> | null = null;
    if (useAi) {
        const apiKeyRow = db.prepare("SELECT value FROM config WHERE key = 'anthropic_api_key'").get() as { value: string } | undefined;
        if (apiKeyRow?.value) {
            aiResults = await suggestTagsWithClaude(contexts, existingTagNames, apiKeyRow.value, maxTagsPerModel);
        }
    }

    const results: AutotagResult[] = [];
    let tagged = 0;

    for (const model of contexts) {
        let suggestedTags: string[];

        if (aiResults && aiResults.has(model.id)) {
            suggestedTags = aiResults.get(model.id)!;
        } else {
            suggestedTags = suggestTagsHeuristic(model, existingTags, maxTagsPerModel);
        }

        if (suggestedTags.length === 0) {
            results.push({ modelId: model.id, modelName: model.filename, tagsAdded: [] });
            continue;
        }

        let tagsAdded: string[];
        if (dryRun) {
            tagsAdded = suggestedTags;
        } else {
            tagsAdded = applyTags(model.id, suggestedTags, 'autotag');
        }

        if (tagsAdded.length > 0) tagged++;
        results.push({ modelId: model.id, modelName: model.filename, tagsAdded });
    }

    return { processed: contexts.length, tagged, results };
}

// ── AI tag pair consolidation ─────────────────────────────────────────────────

interface TagPairInput {
    tag1: { id: number; name: string; model_count: number };
    tag2: { id: number; name: string; model_count: number };
    similarity: number;
}

export interface PairRecommendation {
    action: 'merge-keep-1' | 'merge-keep-2' | 'separate';
    reason: string;
}

const CONSOLIDATE_PROMPT = `You are managing tags for a 3D printing model collection.

Below are pairs of tags that were detected as potentially similar or duplicate. For each pair, evaluate whether they should be merged (same concept) or kept as separate tags (distinct concepts).

For pairs to merge, indicate which tag name to keep:
- "merge-keep-1": keep the first tag, delete the second
- "merge-keep-2": keep the second tag, delete the first
- "separate": these are distinct concepts, do not merge

Prefer keeping the tag with more models, or the shorter/more general form. Be conservative — only recommend merging if you're confident they mean the same thing in a 3D printing context.

Tag pairs to evaluate:
{pairs}

Respond ONLY with a JSON array, one entry per pair in the same order:
[{"action": "merge-keep-1"|"merge-keep-2"|"separate", "reason": "brief explanation"}, ...]`;

export async function analyzeTagPairsWithClaude(
    pairs: TagPairInput[],
    apiKey: string
): Promise<PairRecommendation[]> {
    const client = new Anthropic({ apiKey });
    const results: PairRecommendation[] = pairs.map(() => ({ action: 'separate', reason: 'not analyzed' }));

    // Batch in groups of 50 pairs
    const BATCH_SIZE = 50;
    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        const pairList = batch.map((p, j) =>
            `${j + 1}. "${p.tag1.name}" (${p.tag1.model_count} models) vs "${p.tag2.name}" (${p.tag2.model_count} models) — ${p.similarity}% similar`
        ).join('\n');

        try {
            const response = await client.messages.create({
                model: 'claude-sonnet-4-5-20250929',
                max_tokens: 4096,
                messages: [{ role: 'user', content: CONSOLIDATE_PROMPT.replace('{pairs}', pairList) }]
            });

            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) continue;

            const parsed = JSON.parse(jsonMatch[0]) as Array<{ action?: string; reason?: string }>;
            for (let j = 0; j < batch.length && j < parsed.length; j++) {
                const rec = parsed[j];
                const action = rec.action as PairRecommendation['action'];
                if (action === 'merge-keep-1' || action === 'merge-keep-2' || action === 'separate') {
                    results[i + j] = { action, reason: rec.reason || '' };
                }
            }
        } catch (err) {
            console.error('Claude consolidate batch error:', err);
        }
    }

    return results;
}
