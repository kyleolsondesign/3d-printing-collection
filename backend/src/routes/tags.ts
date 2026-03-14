import express from 'express';
import db from '../config/database.js';

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/** Strip separators and trailing 's' for comparison */
function normalizeTag(s: string): string {
    return s.replace(/[-_ ]+/g, '').replace(/s$/, '');
}

function tagSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    // Same after stripping separators (kitchen-tool == kitchen tool == kitchentool)
    const aN = normalizeTag(a);
    const bN = normalizeTag(b);
    if (aN === bN) return 98;
    // Plural/singular (toys == toy)
    if (a.replace(/s$/, '') === b.replace(/s$/, '')) return 95;
    if (aN.replace(/s$/, '') === bN.replace(/s$/, '')) return 95;
    // Prefix containment (kitchen < kitchen tool)
    if (a.startsWith(b) || b.startsWith(a)) return 88;
    // Levenshtein on normalised forms — only for longer tags to avoid false positives
    // (e.g. "women" vs "woven" would score 80 on a 5-char pair but are unrelated)
    const maxLen = Math.max(aN.length, bN.length);
    if (maxLen === 0) return 100;
    if (maxLen < 6) return 0;
    const dist = levenshtein(aN, bN);
    return Math.round((1 - dist / maxLen) * 100);
}

// ── Existing endpoints ────────────────────────────────────────────────────────

// List all tags with usage counts
router.get('/', (req, res) => {
    try {
        const tags = db.prepare(`
            SELECT t.id, t.name, t.source, t.created_at,
                   COUNT(CASE WHEN m.deleted_at IS NULL THEN 1 END) as model_count
            FROM tags t
            LEFT JOIN model_tags mt ON mt.tag_id = t.id
            LEFT JOIN models m ON m.id = mt.model_id
            GROUP BY t.id
            ORDER BY t.name ASC
        `).all();
        res.json(tags);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Create a new tag (or return existing one)
router.post('/', (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tag name required' });
        }
        const trimmed = name.trim().toLowerCase();

        const existing = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number; name: string } | undefined;
        if (existing) {
            return res.json(existing);
        }

        const result = db.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(trimmed, 'user');
        const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
        res.status(201).json(tag);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Delete a tag (cascades via model_tags FK) and add to blocklist to prevent re-ingestion
router.patch('/:id', (req, res) => {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
        const normalized = name.toLowerCase().trim();
        const existing = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(normalized, Number(req.params.id));
        if (existing) return res.status(409).json({ error: 'Tag name already exists' });
        db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(normalized, Number(req.params.id));
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

router.post('/bulk-rename', (req, res) => {
    try {
        const { renames } = req.body as { renames: Array<{ id: number; name: string }> };
        if (!Array.isArray(renames) || renames.length === 0) return res.status(400).json({ error: 'renames array required' });
        const doRename = db.transaction(() => {
            for (const { id, name } of renames) {
                const normalized = name.toLowerCase().trim();
                const existing = db.prepare('SELECT id FROM tags WHERE name = ? AND id != ?').get(normalized, id);
                if (!existing) {
                    db.prepare('UPDATE tags SET name = ? WHERE id = ?').run(normalized, id);
                }
                // If the target name already exists, merge instead
                else {
                    const target = existing as { id: number };
                    db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) SELECT model_id, ? FROM model_tags WHERE tag_id = ?').run(target.id, id);
                    db.prepare('DELETE FROM model_tags WHERE tag_id = ?').run(id);
                    db.prepare('INSERT OR IGNORE INTO tag_blocklist (name) SELECT name FROM tags WHERE id = ?').run(id);
                    db.prepare('DELETE FROM tags WHERE id = ?').run(id);
                }
            }
        });
        doRename();
        res.json({ success: true, count: renames.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(id) as { name: string } | undefined;
        if (tag) {
            db.prepare('INSERT OR IGNORE INTO tag_blocklist (name) VALUES (?)').run(tag.name.toLowerCase());
        }
        db.prepare('DELETE FROM tags WHERE id = ?').run(id);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Remove a name from the tag blocklist (re-allow PDF ingestion of that name)
router.delete('/blocklist/:name', (req, res) => {
    try {
        db.prepare('DELETE FROM tag_blocklist WHERE name = ?').run(req.params.name.toLowerCase());
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Add a tag to a model (creates tag if needed)
router.post('/model/:modelId', (req, res) => {
    try {
        const { modelId } = req.params;
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Tag name required' });
        }
        const trimmed = name.trim().toLowerCase();

        // Upsert tag with source = 'user'
        let tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number; name: string } | undefined;
        if (!tag) {
            const result = db.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(trimmed, 'user');
            tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as { id: number; name: string };
        }

        // Link tag to model (ignore if already linked)
        db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)').run(modelId, tag.id);

        res.json({ tag });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Remove a tag from a model
router.delete('/model/:modelId/:tagId', (req, res) => {
    try {
        const { modelId, tagId } = req.params;
        db.prepare('DELETE FROM model_tags WHERE model_id = ? AND tag_id = ?').run(modelId, tagId);
        res.json({ success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Bulk add a tag to multiple models
router.post('/bulk', (req, res) => {
    try {
        const { modelIds, tagName } = req.body;
        if (!modelIds || !Array.isArray(modelIds) || modelIds.length === 0) {
            return res.status(400).json({ error: 'modelIds array required' });
        }
        if (!tagName || !tagName.trim()) {
            return res.status(400).json({ error: 'tagName required' });
        }
        const trimmed = tagName.trim().toLowerCase();

        // Upsert tag with source = 'user'
        let tag = db.prepare('SELECT * FROM tags WHERE LOWER(name) = ?').get(trimmed) as { id: number } | undefined;
        if (!tag) {
            const result = db.prepare('INSERT INTO tags (name, source) VALUES (?, ?)').run(trimmed, 'user');
            tag = { id: Number(result.lastInsertRowid) };
        }

        const insert = db.prepare('INSERT OR IGNORE INTO model_tags (model_id, tag_id) VALUES (?, ?)');
        const insertMany = db.transaction((ids: number[]) => {
            for (const id of ids) {
                insert.run(id, tag!.id);
            }
        });
        insertMany(modelIds);

        res.json({ success: true, tagId: tag.id });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// ── New tag management endpoints ──────────────────────────────────────────────

// Find similar tags (for consolidation)
router.get('/similar', (req, res) => {
    try {
        const threshold = parseInt(req.query.threshold as string) || 80;

        const tags = db.prepare(`
            SELECT t.id, t.name, t.source,
                   COUNT(CASE WHEN m.deleted_at IS NULL THEN 1 END) as model_count
            FROM tags t
            LEFT JOIN model_tags mt ON mt.tag_id = t.id
            LEFT JOIN models m ON m.id = mt.model_id
            GROUP BY t.id
            HAVING COUNT(mt.tag_id) >= 1
            ORDER BY t.name ASC
        `).all() as Array<{ id: number; name: string; source: string; model_count: number }>;

        const pairs: Array<{
            tag1: { id: number; name: string; source: string; model_count: number };
            tag2: { id: number; name: string; source: string; model_count: number };
            similarity: number;
        }> = [];

        for (let i = 0; i < tags.length; i++) {
            for (let j = i + 1; j < tags.length; j++) {
                const sim = tagSimilarity(tags[i].name, tags[j].name);
                if (sim >= threshold) {
                    pairs.push({ tag1: tags[i], tag2: tags[j], similarity: sim });
                }
            }
        }

        pairs.sort((a, b) => b.similarity - a.similarity);
        res.json(pairs);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Merge tags: move all sourceIds associations to targetId and delete source tags
router.post('/merge', (req, res) => {
    try {
        const { sourceIds, targetId } = req.body;
        if (!Array.isArray(sourceIds) || sourceIds.length === 0 || !targetId) {
            return res.status(400).json({ error: 'sourceIds (array) and targetId required' });
        }

        const merge = db.transaction(() => {
            let mergedCount = 0;
            for (const srcId of sourceIds) {
                // Move associations to target (ignore conflicts — model already has target tag)
                db.prepare(`
                    INSERT OR IGNORE INTO model_tags (model_id, tag_id)
                    SELECT model_id, ? FROM model_tags WHERE tag_id = ?
                `).run(targetId, srcId);
                // Remove source associations and tag (blocklist so it won't be re-ingested)
                db.prepare('DELETE FROM model_tags WHERE tag_id = ?').run(srcId);
                db.prepare('INSERT OR IGNORE INTO tag_blocklist (name) SELECT name FROM tags WHERE id = ?').run(srcId);
                db.prepare('DELETE FROM tags WHERE id = ?').run(srcId);
                mergedCount++;
            }
            return mergedCount;
        });

        const mergedCount = merge();
        res.json({ success: true, mergedCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Batch merge: merge multiple pairs in a single transaction
router.post('/merge-batch', (req, res) => {
    try {
        const { merges } = req.body; // Array<{ sourceId: number, targetId: number }>
        if (!Array.isArray(merges) || merges.length === 0) {
            return res.status(400).json({ error: 'merges array required' });
        }

        const batchMerge = db.transaction(() => {
            for (const { sourceId, targetId } of merges) {
                db.prepare(`INSERT OR IGNORE INTO model_tags (model_id, tag_id) SELECT model_id, ? FROM model_tags WHERE tag_id = ?`).run(targetId, sourceId);
                db.prepare('DELETE FROM model_tags WHERE tag_id = ?').run(sourceId);
                // Add deleted source to blocklist so it won't be re-ingested
                const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(sourceId) as { name: string } | undefined;
                if (tag) {
                    db.prepare('INSERT OR IGNORE INTO tag_blocklist (name) VALUES (?)').run(tag.name.toLowerCase());
                }
                db.prepare('DELETE FROM tags WHERE id = ?').run(sourceId);
            }
            return merges.length;
        });

        const mergedCount = batchMerge();
        res.json({ success: true, mergedCount });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Cleanup tags: delete tags matching usage count and/or source criteria
// Returns preview count when dryRun=true
router.post('/cleanup', (req, res) => {
    try {
        const { maxCount, source, dryRun } = req.body;

        const conditions: string[] = [];
        const params: any[] = [];

        if (maxCount !== undefined) {
            conditions.push(`id IN (
                SELECT t.id FROM tags t
                LEFT JOIN model_tags mt ON mt.tag_id = t.id
                LEFT JOIN models m ON m.id = mt.model_id AND m.deleted_at IS NULL
                GROUP BY t.id
                HAVING COUNT(m.id) <= ?
            )`);
            params.push(maxCount);
        }

        if (Array.isArray(source) && source.length > 0) {
            const placeholders = source.map(() => '?').join(', ');
            conditions.push(`source IN (${placeholders})`);
            params.push(...source);
        }

        if (conditions.length === 0) {
            return res.status(400).json({ error: 'At least one filter (maxCount or source) required' });
        }

        const whereClause = conditions.join(' AND ');

        if (dryRun) {
            const { count } = db.prepare(`SELECT COUNT(*) as count FROM tags WHERE ${whereClause}`).get(...params) as { count: number };
            return res.json({ dryRun: true, wouldDelete: count });
        }

        // Blocklist tags before deleting so they won't be re-ingested
        const toDelete = db.prepare(`SELECT name FROM tags WHERE ${whereClause}`).all(...params) as { name: string }[];
        for (const { name } of toDelete) {
            db.prepare('INSERT OR IGNORE INTO tag_blocklist (name) VALUES (?)').run(name.toLowerCase());
        }
        const result = db.prepare(`DELETE FROM tags WHERE ${whereClause}`).run(...params);
        res.json({ success: true, deleted: result.changes });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// Auto-tag models with few/no tags
router.post('/autotag', async (req, res) => {
    try {
        const { modelIds, minTagCount = 2, useAi = false, dryRun = false } = req.body;

        const { autotagModels } = await import('../services/tagging.js');
        const result = await autotagModels({ modelIds, minTagCount, useAi, dryRun });

        res.json(result);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// AI-powered consolidation: evaluate similar pairs and recommend which to merge
router.post('/ai-consolidate', async (req, res) => {
    try {
        const { pairs } = req.body;
        if (!Array.isArray(pairs) || pairs.length === 0) {
            return res.status(400).json({ error: 'pairs array required' });
        }

        const apiKeyRow = db.prepare("SELECT value FROM config WHERE key = 'anthropic_api_key'").get() as { value: string } | undefined;
        if (!apiKeyRow?.value) {
            return res.status(400).json({ error: 'Anthropic API key not configured' });
        }

        const { analyzeTagPairsWithClaude } = await import('../services/tagging.js');
        const recommendations = await analyzeTagPairsWithClaude(pairs, apiKeyRow.value);

        res.json({ recommendations });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

// ── Auto-consolidate suggestions ─────────────────────────────────────────────

type AutoReason = 'leading-dash' | 'leading-apostrophe' | 'separator' | 'plural' | 'spelling' | 'year';

interface AutoGroup {
    winner: { id: number; name: string; source: string; model_count: number };
    losers: Array<{ id: number; name: string; source: string; model_count: number; reasons: AutoReason[] }>;
    reasons: AutoReason[];
    totalModels: number;
}

const BRIT_TO_US: Record<string, string> = {
    colour: 'color', favourite: 'favorite', behaviour: 'behavior',
    centre: 'center', fibre: 'fiber', metre: 'meter', centimetre: 'centimeter',
    millimetre: 'millimeter', neighbour: 'neighbor', honour: 'honor', armour: 'armor',
    grey: 'gray', mould: 'mold', moulding: 'molding', modelling: 'modeling',
    travelling: 'traveling', jewellery: 'jewelry', aluminium: 'aluminum',
    licence: 'license', practise: 'practice', organise: 'organize',
    recognise: 'recognize', realise: 'realize', customise: 'customize',
    tyre: 'tire', defence: 'defense', offence: 'offense',
    analyse: 'analyze', specialise: 'specialize', utilise: 'utilize',
    calibre: 'caliber', sabre: 'saber', manoeuvre: 'maneuver',
    theatre: 'theater', fulfil: 'fulfill', plough: 'plow',
};

function acBritToUs(word: string): string {
    return BRIT_TO_US[word] ?? word;
}

function acDepluralize(word: string): string {
    if (word.length < 4) return word;
    // -ss and -us endings are not regular plurals (glass, radius, virus)
    if (/ss$/.test(word) || /us$/.test(word)) return word;
    if (word.length >= 5 && /ies$/.test(word)) return word.slice(0, -3) + 'y'; // butterflies → butterfly
    if (/s$/.test(word)) return word.slice(0, -1); // cats → cat, toys → toy
    return word;
}

function acCanonical(name: string): string {
    let s = name.toLowerCase().trim();
    s = s.replace(/['\u2018\u2019]+/g, '');    // strip ALL apostrophes (leading, embedded, trailing)
    s = s.replace(/^[-_\s]+/, '');              // strip leading dashes/underscores/spaces
    s = s.replace(/[-_\s]+$/, '');              // strip trailing dashes/underscores/spaces
    s = s.replace(/[-_&+]+/g, ' ');            // separators + & + → spaces
    s = s.replace(/((?:19|20)\d{2})/g, '');    // strip 4-digit years (christmas2025 → christmas)
    s = s.replace(/[^a-z0-9\s]+$/, '');        // strip trailing garbage (backslash, etc.)
    s = s.replace(/\s+/g, ' ').trim();
    s = s.split(' ').filter(w => w.length > 0).map(w => acDepluralize(acBritToUs(w))).join(' ');
    return s;
}

function acWinnerScore(name: string): number {
    let score = 0;
    if (/^[-_]/.test(name))             score += 1000; // leading dash — worst
    if (/^[''\u2018\u2019]/.test(name)) score += 900;  // leading apostrophe
    if (/((?:19|20)\d{2})/.test(name))  score += 500;  // year suffix (christmas2025 vs christmas)
    // Trailing garbage chars (christmas\, halloween 2, etc.)
    if (/[^a-z0-9\s]$/i.test(name.trim())) score += 300;
    // Embedded/trailing apostrophe (valentine 's day, skadisikea')
    const withoutLeading = name.replace(/^[''\u2018\u2019\-_]+/, '');
    if (/['\u2018\u2019]/.test(withoutLeading)) score += 200;
    if (/[-_]/.test(withoutLeading)) score += 100; // dashes instead of spaces
    const words = name.toLowerCase().split(/\s+/);
    if (words.some(w => acBritToUs(w) !== w)) score += 10; // British spelling
    const canon = name.toLowerCase().replace(/[-_]+/g, ' ').trim();
    if (canon.split(' ').some(w => acDepluralize(w) !== w)) score += 1; // plural
    return score;
}

function acDetectReasons(loserName: string, winnerName: string): AutoReason[] {
    const reasons = new Set<AutoReason>();
    const ln = loserName.toLowerCase();

    // 1. Leading apostrophe
    if (/^[''\u2018\u2019]/.test(ln)) reasons.add('leading-apostrophe');

    // 2. Leading dash
    if (/^[-_]/.test(ln)) reasons.add('leading-dash');

    const lNoLead = ln.replace(/^[''`\u2018\u2019\-_]+/, '');

    // 3. Concatenated word: loser has no separators but winner has spaces/dashes (or vice versa)
    const lHasNoSep = !lNoLead.includes(' ') && !/[-_]/.test(lNoLead);
    const wNorm = winnerName.toLowerCase().replace(/^[''`\u2018\u2019\-_]+/, '');
    const wHasSep = wNorm.includes(' ') || /[-_]/.test(wNorm);
    if (lHasNoSep && wHasSep && lNoLead.length > 4) {
        reasons.add('separator');
    }

    // 4. Separator: loser uses dashes/underscores (after stripping leading punctuation)
    if (/[-_]/.test(lNoLead)) reasons.add('separator');

    // 5. British spelling: any word in loser maps to a different US word
    const lWords = lNoLead.replace(/[-_]+/g, ' ').trim().split(' ');
    if (lWords.some(w => acBritToUs(w) !== w)) reasons.add('spelling');

    // 6. Plural: loser words depluralize differently
    // Skip when already flagged as concatenated (whole-word depluralize is unreliable there)
    if (!lHasNoSep || !wHasSep) {
        const lUS = lWords.map(acBritToUs).join(' ');
        const lDepl = lUS.split(' ').map(acDepluralize).join(' ');
        if (lDepl !== lUS) reasons.add('plural');
    }

    // 7. Year suffix: loser name contains a 4-digit year
    if (/((?:19|20)\d{2})/.test(loserName)) reasons.add('year');

    // Spelling fallback: if no other reason and the canonical forms differ by edit distance,
    // it's a spelling error (covers misspellings not in the brit-to-US dictionary)
    if (reasons.size === 0) {
        const lc = acCanonical(loserName);
        const wc = acCanonical(winnerName);
        const maxLen = Math.max(lc.length, wc.length);
        const dist = levenshtein(lc, wc);
        if (maxLen >= 6 && dist <= (maxLen <= 10 ? 1 : 2)) {
            reasons.add('spelling');
        } else {
            reasons.add('separator');
        }
    }
    return Array.from(reasons);
}

router.get('/auto-consolidate-suggestions', (req, res) => {
    try {
        const tags = db.prepare(`
            SELECT t.id, t.name, COALESCE(t.source, 'pdf') as source,
                   COUNT(CASE WHEN m.deleted_at IS NULL THEN 1 END) as model_count
            FROM tags t
            LEFT JOIN model_tags mt ON mt.tag_id = t.id
            LEFT JOIN models m ON m.id = mt.model_id
            GROUP BY t.id
            ORDER BY t.name ASC
        `).all() as Array<{ id: number; name: string; source: string; model_count: number }>;

        // Build groups using union-find across two keys:
        // 1. canonKey: canonical form (handles plural/spelling/separator variants)
        // 2. rawKey: raw no-separator form (handles concatenated variants like "dungeonsanddragons")
        const canonKey = (name: string) => acCanonical(name).replace(/\s+/g, '');
        const rawKey = (name: string) => name.toLowerCase()
            .replace(/['\u2018\u2019]+/g, '')  // strip ALL apostrophes
            .replace(/^[-_\s]+/, '')            // strip leading
            .replace(/[\s\-_&+]+/g, '');       // strip all separators incl & and +

        const parent = new Map<number, number>();
        for (const tag of tags) parent.set(tag.id, tag.id);

        function find(id: number): number {
            if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
            return parent.get(id)!;
        }
        function union(a: number, b: number) {
            const ra = find(a), rb = find(b);
            if (ra !== rb) parent.set(ra, rb);
        }

        for (const keyFn of [canonKey, rawKey]) {
            const bucket = new Map<string, number[]>();
            for (const tag of tags) {
                const k = keyFn(tag.name);
                if (!bucket.has(k)) bucket.set(k, []);
                bucket.get(k)!.push(tag.id);
            }
            for (const ids of bucket.values()) {
                for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
            }
        }

        // Fuzzy spelling pass: compare all ungrouped singletons by rawKey.
        // Catches misspellings across word-count boundaries (e.g. "desk organizer" vs "deskorganiser").
        const tagRawKeys = new Map(tags.map(t => [t.id, rawKey(t.name)]));
        const singletons = tags.filter(t => find(t.id) === t.id);
        for (let i = 0; i < singletons.length; i++) {
            const ra = tagRawKeys.get(singletons[i].id)!;
            if (ra.length < 8) continue; // skip short tags to avoid false positives
            for (let j = i + 1; j < singletons.length; j++) {
                const rb = tagRawKeys.get(singletons[j].id)!;
                if (rb.length < 8) continue;
                if (Math.abs(ra.length - rb.length) > 2) continue; // fast reject
                const maxLen = Math.max(ra.length, rb.length);
                const threshold = maxLen <= 10 ? 1 : 2;
                if (levenshtein(ra, rb) <= threshold) union(singletons[i].id, singletons[j].id);
            }
        }

        const byRoot = new Map<number, typeof tags>();
        for (const tag of tags) {
            const root = find(tag.id);
            if (!byRoot.has(root)) byRoot.set(root, []);
            byRoot.get(root)!.push(tag);
        }

        const groups: AutoGroup[] = [];
        const renames: Array<{ id: number; from: string; to: string; model_count: number }> = [];

        for (const members of byRoot.values()) {
            // Single-member: check if it needs a rename (leading-apostrophe or year suffix)
            if (members.length === 1) {
                const tag = members[0];
                if (/^[''\u2018\u2019]/.test(tag.name)) {
                    const to = tag.name.replace(/^[''\u2018\u2019]+/, '');
                    if (to && to !== tag.name) {
                        renames.push({ id: tag.id, from: tag.name, to, model_count: tag.model_count ?? 0 });
                    }
                } else if (/((?:19|20)\d{2})/.test(tag.name)) {
                    const to = tag.name.replace(/((?:19|20)\d{2})/g, '').replace(/\s+/g, ' ').trim().replace(/[-_\s]+$/, '').trim();
                    if (to && to !== tag.name && to.length > 0) {
                        renames.push({ id: tag.id, from: tag.name, to, model_count: tag.model_count ?? 0 });
                    }
                }
                continue;
            }

            // Pick winner: lowest score, then highest model_count, then alphabetical
            const sorted = [...members].sort((a, b) => {
                const sd = acWinnerScore(a.name) - acWinnerScore(b.name);
                if (sd !== 0) return sd;
                const cd = (b.model_count ?? 0) - (a.model_count ?? 0);
                if (cd !== 0) return cd;
                return a.name.localeCompare(b.name);
            });
            const [winner, ...losers] = sorted;

            const losersWithReasons = losers.map(l => ({
                ...l,
                reasons: acDetectReasons(l.name, winner.name),
            }));
            const allReasons = new Set<AutoReason>();
            losersWithReasons.forEach(l => l.reasons.forEach(r => allReasons.add(r)));
            const totalModels = members.reduce((s, t) => s + (t.model_count ?? 0), 0);

            groups.push({ winner, losers: losersWithReasons, reasons: Array.from(allReasons), totalModels });

            // If winner has a year suffix, schedule a rename to the year-free form
            if (/((?:19|20)\d{2})/.test(winner.name)) {
                const idealTo = winner.name.replace(/((?:19|20)\d{2})/g, '').replace(/\s+/g, ' ').trim().replace(/[-_\s]+$/, '').trim();
                if (idealTo && idealTo !== winner.name && idealTo.length > 0) {
                    renames.push({ id: winner.id, from: winner.name, to: idealTo, model_count: winner.model_count ?? 0 });
                }
            }
        }

        // Sort by most models affected first
        groups.sort((a, b) => b.totalModels - a.totalModels);
        renames.sort((a, b) => (b.model_count ?? 0) - (a.model_count ?? 0));
        res.json({ groups, renames });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: message });
    }
});

export default router;
