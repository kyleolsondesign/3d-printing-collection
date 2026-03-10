import Anthropic from '@anthropic-ai/sdk';
import db from '../config/database.js';

// Categories that require the full phrase to appear in the item name.
// Individual tokens from these categories (e.g. "mini", "one", "brick") are
// too generic and cause false matches, so token-based scoring is skipped for them.
export const PHRASE_ONLY_CATEGORIES = new Set([
    'A1 Mini',
    'Core One',
    'CyberBrick',
]);

// Common noise words to ignore in fuzzy matching
export const NOISE_WORDS = new Set([
    'free', '3d', 'print', 'model', 'stl', 'file', 'files', 'download',
    'printable', 'printing', 'printer', 'printed', 'the', 'and', 'for',
    'with', 'from', 'this', 'that', 'new', 'set', 'version', 'design',
    'ready', 'high', 'quality', 'low', 'poly', 'obj', 'fbx', 'gcode',
    // Platform/source names — zero categorization signal
    'maker', 'world', 'makerworld', 'thangs', 'printables', 'patreon', 'thingiverse', 'com',
]);

// Semantic synonym groups for 3D printing categories.
export const SYNONYM_GROUPS: string[][] = [
    // Toys, figures, games
    ['toy', 'toys', 'figure', 'figures', 'figurine', 'miniature', 'bust', 'statue', 'character', 'diorama', 'game', 'games', 'puzzle'],
    // Tools, hardware, functional parts
    ['tool', 'tools', 'wrench', 'bracket', 'mount', 'holder', 'clip', 'organizer', 'jig', 'fixture', 'hardware', 'hanger', 'hook'],
    // Plants, nature, garden
    ['plant', 'plants', 'pot', 'vase', 'planter', 'succulent', 'flower', 'garden'],
    // Vehicles, transportation
    ['vehicle', 'vehicles', 'car', 'truck', 'boat', 'airplane', 'aircraft', 'ship', 'tank'],
    // Animals, creatures
    ['animal', 'animals', 'dog', 'cat', 'bird', 'fish', 'creature', 'beast', 'dinosaur'],
    // Jewelry, accessories
    ['jewelry', 'keychain', 'pendant', 'ring', 'earring', 'necklace', 'charm', 'accessory'],
    // Electronics, tech
    ['electronic', 'electronics', 'phone', 'cable', 'charger', 'raspberry', 'arduino', 'circuit'],
    // Household, kitchen, storage
    ['household', 'kitchen', 'bathroom', 'shelf', 'storage', 'container', 'box', 'drawer'],
    // Stands, supports, bases
    ['stand', 'stands', 'base', 'support', 'platform', 'riser', 'dock'],
];

// Build reverse lookup: word → synonym group
export const SYNONYM_MAP = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
        SYNONYM_MAP.set(word, group);
    }
}

export interface FuzzyMatchContext {
    name: string;
    modelFileNames?: string[];
    pdfTags?: string[];
    readmeText?: string | null;
    pdfText?: string | null;
}

export interface ScoreDebugEntry {
    category: string;
    score: number;  // 0–100 integer percentage
    source: 'exact' | 'name' | 'files' | 'tags' | 'text' | 'hint';
}

export interface CategorizationSuggestion {
    category: string;
    confidence: 'high' | 'medium' | 'low';
    debugScores: ScoreDebugEntry[];
}

// Generic item for Claude-powered categorization
export interface CategorizationItem {
    identifier: string;  // key for results map (e.g. filepath or model id as string)
    name: string;
    isFolder?: boolean;
    fileCount?: number;
    modelFileNames?: string[];
    pdfFilename?: string | null;
    pdfText?: string | null;
    pdfTags?: string[];
    readmeText?: string | null;
    designer?: string | null;
}

export function tokenize(name: string): string[] {
    return name
        .replace(/[_\-./\\()[\]{}]+/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2 && !NOISE_WORDS.has(w));
}

// Expand a token set with synonyms from SYNONYM_GROUPS
export function expandWithSynonyms(tokens: string[]): string[] {
    const expanded = new Set(tokens);
    for (const token of tokens) {
        const group = SYNONYM_MAP.get(token);
        if (group) {
            for (const synonym of group) {
                expanded.add(synonym);
            }
        }
    }
    return Array.from(expanded);
}

// Pure token overlap score: what fraction of catTokens are covered by itemTokens
export function scoreTokensVsCategory(itemTokens: string[], catTokens: string[]): number {
    if (itemTokens.length === 0 || catTokens.length === 0) return 0;
    let matchCount = 0;
    for (const catToken of catTokens) {
        if (itemTokens.some(t => t.includes(catToken) || catToken.includes(t))) {
            matchCount++;
        }
    }
    return matchCount / catTokens.length;
}

// Score a named source (with pre-expanded tokens) against a single category.
export function scoreNameVsCategory(
    name: string,
    expandedTokens: string[],
    category: string,
    catTokens: string[],
    normalizedCat: string,
    isPhraseOnly: boolean
): { score: number; isExact: boolean } {
    const normalizedName = name.toLowerCase().replace(/[\s_-]+/g, '');

    if (isPhraseOnly) {
        const match = name.toLowerCase().includes(category.toLowerCase())
            || normalizedName.includes(normalizedCat);
        return { score: match ? 100 : 0, isExact: match };
    }

    if (name.toLowerCase().includes(category.toLowerCase())) {
        return { score: 100, isExact: true };
    }

    return { score: scoreTokensVsCategory(expandedTokens, catTokens), isExact: false };
}

// Load per-category hint boosts from learned associations (AI-accepted + manual imports).
export function loadHintBoosts(tokens: string[], categories: string[]): Map<string, number> {
    if (tokens.length === 0) return new Map();
    try {
        const placeholders = tokens.map(() => '?').join(',');
        const rows = db.prepare(`
            SELECT category, SUM(count) as total
            FROM categorization_hints
            WHERE token IN (${placeholders})
            GROUP BY category
        `).all(...tokens) as Array<{ category: string; total: number }>;

        if (rows.length === 0) return new Map();

        const boosts = new Map<string, number>();
        for (const row of rows) {
            if (categories.includes(row.category) && row.total > 0) {
                boosts.set(row.category, Math.min(row.total / 5, 1) * 0.4);
            }
        }
        return boosts;
    } catch {
        return new Map();
    }
}

export function suggestCategoryFuzzy(
    item: FuzzyMatchContext,
    categories: string[]
): CategorizationSuggestion {
    const primaryTokens = expandWithSynonyms(tokenize(item.name));

    const modelFileContexts = (item.modelFileNames || []).map(fn => {
        const baseName = fn.replace(/\.(stl|3mf|obj|gcode|ply|amf|zip|rar|7z)$/i, '');
        return { name: baseName, tokens: expandWithSynonyms(tokenize(baseName)) };
    });

    const pdfTagTokens = expandWithSynonyms(
        (item.pdfTags || []).flatMap(tag => tokenize(tag))
    );

    const textContent = [item.readmeText, item.pdfText]
        .filter(Boolean)
        .join(' ')
        .substring(0, 500);
    const textTokens = textContent ? expandWithSynonyms(tokenize(textContent)) : [];

    const allTokensForHints = Array.from(new Set([
        ...primaryTokens,
        ...modelFileContexts.flatMap(fc => fc.tokens),
        ...pdfTagTokens,
        ...textTokens,
    ]));
    const hintBoosts = loadHintBoosts(allTokensForHints, categories);

    const hasAnyTokens = primaryTokens.length > 0
        || modelFileContexts.some(fc => fc.tokens.length > 0)
        || pdfTagTokens.length > 0
        || textTokens.length > 0
        || hintBoosts.size > 0;

    if (!hasAnyTokens) {
        return { category: 'Uncategorized', confidence: 'low', debugScores: [] };
    }

    let bestCategory = 'Uncategorized';
    let bestRawScore = 0;
    let bestAdjustedScore = 0;
    let bestIsExact = false;

    const allDebugScores: ScoreDebugEntry[] = [];

    for (const category of categories) {
        const isPhraseOnly = PHRASE_ONLY_CATEGORIES.has(category);
        const normalizedCat = category.toLowerCase().replace(/[\s_-]+/g, '');
        const catTokens = tokenize(category);

        const nameResult = scoreNameVsCategory(
            item.name, primaryTokens, category, catTokens, normalizedCat, isPhraseOnly
        );

        let fileScore = 0;
        let tagScore = 0;
        let textScore = 0;

        if (!isPhraseOnly) {
            for (const fc of modelFileContexts) {
                const r = scoreNameVsCategory(
                    fc.name, fc.tokens, category, catTokens, normalizedCat, false
                );
                if (r.score > fileScore) fileScore = r.score;
            }

            if (pdfTagTokens.length > 0) {
                tagScore = scoreTokensVsCategory(pdfTagTokens, catTokens);
            }

            if (textTokens.length > 0) {
                textScore = Math.min(scoreTokensVsCategory(textTokens, catTokens), 0.5);
            }
        }

        const secondaryScore = Math.min(Math.max(fileScore, tagScore, textScore), 0.79);
        const rawScore = nameResult.isExact ? 100 : Math.max(nameResult.score, secondaryScore);
        const catIsExact = nameResult.isExact;

        const hintBoost = hintBoosts.get(category) ?? 0;
        const adjustedScore = catIsExact ? 100 : Math.min(rawScore + hintBoost, 0.95);

        let source: ScoreDebugEntry['source'];
        if (catIsExact) {
            source = 'exact';
        } else if (rawScore === 0 && hintBoost > 0) {
            source = 'hint';
        } else if (nameResult.score >= Math.max(fileScore, tagScore, textScore)) {
            source = 'name';
        } else if (fileScore >= Math.max(tagScore, textScore)) {
            source = 'files';
        } else if (tagScore >= textScore) {
            source = 'tags';
        } else {
            source = 'text';
        }

        allDebugScores.push({
            category,
            score: adjustedScore === 100 ? 100 : Math.round(adjustedScore * 100),
            source
        });

        if (adjustedScore > bestAdjustedScore
            || (adjustedScore === bestAdjustedScore && category.length > bestCategory.length)) {
            bestRawScore = rawScore;
            bestAdjustedScore = adjustedScore;
            bestCategory = category;
            bestIsExact = catIsExact;
        }
    }

    let confidence: 'high' | 'medium' | 'low';
    if (bestIsExact || bestAdjustedScore >= 0.8) {
        confidence = 'high';
    } else if (bestRawScore > 0 || bestAdjustedScore > 0.35) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    const debugScores = allDebugScores
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return { category: bestCategory, confidence, debugScores };
}

// Normalize a category suggestion to the exact casing of a known category.
export function normalizeSuggestedCategory(raw: string, categories: string[]): string {
    if (!raw) return 'Uncategorized';
    const lower = raw.toLowerCase();
    return categories.find(c => c.toLowerCase() === lower) ?? raw;
}

const DEFAULT_CATEGORIZATION_PROMPT = `You are categorizing 3D printing model files into an existing collection. The existing categories are:

{categories}

For each item below, suggest the best matching category from the list above. Use ALL available context to make your decision. If none of the existing categories fit well, use "Uncategorized". Rate your confidence: "high" if you're quite sure, "medium" if it's a reasonable guess, "low" if you're unsure.

Items to categorize:
{items}

Respond with ONLY a JSON array, one entry per item, in order:
[{"category": "...", "confidence": "high|medium|low"}, ...]

No explanation, just the JSON array.`;

// Build a text description of one item for the Claude prompt
function formatItemForPrompt(item: CategorizationItem, index: number): string {
    const lines = [`${index + 1}. "${item.name}"`];
    if (item.isFolder !== undefined) {
        lines.push(`   Type: ${item.isFolder ? 'folder' : 'file'}${item.fileCount !== undefined ? `, ${item.fileCount} model file${item.fileCount !== 1 ? 's' : ''}` : ''}`);
    }
    if (item.modelFileNames && item.modelFileNames.length > 0) {
        lines.push(`   Model files: ${item.modelFileNames.join(', ')}`);
    }
    if (item.pdfFilename) {
        lines.push(`   PDF filename: "${item.pdfFilename}"`);
    }
    if (item.pdfText) {
        lines.push(`   PDF text: "${item.pdfText}"`);
    }
    if (item.pdfTags && item.pdfTags.length > 0) {
        lines.push(`   Tags from PDF: ${item.pdfTags.join(', ')}`);
    }
    if (item.designer) {
        lines.push(`   Designer: ${item.designer}`);
    }
    if (item.readmeText) {
        lines.push(`   Readme: "${item.readmeText}"`);
    }
    return lines.join('\n');
}

// Claude-powered batch categorization. Results are keyed by item.identifier.
export async function suggestCategoriesWithClaude(
    items: CategorizationItem[],
    categories: string[],
    apiKey: string,
    promptTemplate?: string,
    categoryDefs?: string
): Promise<Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>> {
    const client = new Anthropic({ apiKey });

    const itemList = items.map((item, i) => formatItemForPrompt(item, i)).join('\n\n');
    const categoryList = categories.join(', ');

    const template = promptTemplate || DEFAULT_CATEGORIZATION_PROMPT;
    const prompt = template
        .replace('{categories}', categoryList)
        .replace('{category_definitions}', categoryDefs
            ? `Here are detailed descriptions of each category to help you decide:\n\n${categoryDefs}`
            : '')
        .replace('{items}', itemList);

    const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const results = new Map<string, { category: string; confidence: 'high' | 'medium' | 'low' }>();

    try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error('No JSON array found in response');

        const parsed = JSON.parse(jsonMatch[0]) as Array<{ category: string; confidence: string }>;
        for (let i = 0; i < items.length && i < parsed.length; i++) {
            const suggestion = parsed[i];
            const confidence = ['high', 'medium', 'low'].includes(suggestion.confidence)
                ? suggestion.confidence as 'high' | 'medium' | 'low'
                : 'low';
            const rawCategory = suggestion.category || 'Uncategorized';
            results.set(items[i].identifier, {
                category: normalizeSuggestedCategory(rawCategory, categories),
                confidence
            });
        }
    } catch (parseError) {
        console.error('Failed to parse Claude response:', parseError, text);
        // Fall through — caller will use fuzzy fallback for missing items
    }

    return results;
}
