import { describe, it, expect } from 'vitest';
import {
    detectPlatform,
    extractDesignerFromFilename,
    classifyLinks,
    parseLicenseFromUrl,
    parseDescription,
} from '../utils/pdfMetadata.js';

describe('detectPlatform', () => {
    it('detects MakerWorld from filename', () => {
        expect(detectPlatform('Spice Rack by Infest MakerWorld: Download Free 3D Models.pdf')).toBe('makerworld');
    });

    it('detects Printables from filename', () => {
        expect(detectPlatform('Egg separator by Vitrkruty | Download free STL model | Printables.com.pdf')).toBe('printables');
    });

    it('detects Thangs from filename', () => {
        expect(detectPlatform('Kitchen rail - 3D model by CharlesRegaud on Thangs.pdf')).toBe('thangs');
    });

    it('returns null for unknown platform', () => {
        expect(detectPlatform('random-model.pdf')).toBeNull();
    });

    it('is case-insensitive', () => {
        expect(detectPlatform('Model MAKERWORLD.pdf')).toBe('makerworld');
        expect(detectPlatform('Model printables.pdf')).toBe('printables');
    });
});

describe('extractDesignerFromFilename', () => {
    it('extracts designer from MakerWorld filename', () => {
        expect(extractDesignerFromFilename(
            'Spice Rack by Infest MakerWorld: Download Free 3D Models.pdf',
            'makerworld'
        )).toBe('Infest');
    });

    it('extracts designer from "Remixed by" MakerWorld filename', () => {
        expect(extractDesignerFromFilename(
            'Spice Rack Remixed by Infest MakerWorld: Download Free.pdf',
            'makerworld'
        )).toBe('Infest');
    });

    it('extracts designer from Printables filename', () => {
        expect(extractDesignerFromFilename(
            'Egg separator by Vitrkruty | Download free STL model | Printables.com.pdf',
            'printables'
        )).toBe('Vitrkruty');
    });

    it('extracts designer from Thangs filename', () => {
        expect(extractDesignerFromFilename(
            'Kitchen rail - 3D model by CharlesRegaud on Thangs.pdf',
            'thangs'
        )).toBe('CharlesRegaud');
    });

    it('returns null when no designer pattern matches', () => {
        expect(extractDesignerFromFilename('random-model.pdf', null)).toBeNull();
    });
});

describe('classifyLinks - MakerWorld', () => {
    const links = [
        'https://makerworld.com/en/models/1286076-spice-rack-remix',
        'https://makerworld.com/en/@Infest',
        'https://makerworld.com/en/models/search?keyword=tag:%20kitchen',
        'https://makerworld.com/en/models/search?keyword=tag:%20spice',
        'https://makerworld.com/en/models/search?keyword=tag:%20rack',
        'https://creativecommons.org/licenses/by-nc/4.0/',
    ];

    it('extracts source URL', () => {
        const result = classifyLinks(links, 'makerworld');
        expect(result.source_url).toBe('https://makerworld.com/en/models/1286076-spice-rack-remix');
    });

    it('extracts designer from profile URL', () => {
        const result = classifyLinks(links, 'makerworld');
        expect(result.designer).toBe('Infest');
        expect(result.designer_url).toBe('https://makerworld.com/en/@Infest');
    });

    it('extracts tags from search URLs', () => {
        const result = classifyLinks(links, 'makerworld');
        expect(result.tags).toEqual(['kitchen', 'spice', 'rack']);
    });

    it('extracts license from CC URL', () => {
        const result = classifyLinks(links, 'makerworld');
        expect(result.license).toBe('CC-BY-NC-4.0');
        expect(result.license_url).toBe('https://creativecommons.org/licenses/by-nc/4.0/');
    });

    it('deduplicates tags', () => {
        const dupeLinks = [
            'https://makerworld.com/en/models/search?keyword=tag:%20kitchen',
            'https://makerworld.com/en/models/search?keyword=tag:%20kitchen',
        ];
        const result = classifyLinks(dupeLinks, 'makerworld');
        expect(result.tags).toEqual(['kitchen']);
    });
});

describe('classifyLinks - Printables', () => {
    const links = [
        'https://www.printables.com/model/1529626-egg-separator',
        'https://www.printables.com/@Vitrkruty_3932013',
        'https://creativecommons.org/share-your-work/public-domain/cc0/',
    ];

    it('extracts source URL', () => {
        const result = classifyLinks(links, 'printables');
        expect(result.source_url).toBe('https://www.printables.com/model/1529626-egg-separator');
    });

    it('extracts designer and strips numeric suffix', () => {
        const result = classifyLinks(links, 'printables');
        expect(result.designer).toBe('Vitrkruty');
        expect(result.designer_url).toBe('https://www.printables.com/@Vitrkruty_3932013');
    });

    it('does not match model subpath URLs as source', () => {
        const subpathLinks = [
            'https://www.printables.com/model/1529626-egg-separator/files',
            'https://www.printables.com/model/1529626-egg-separator/comments',
        ];
        const result = classifyLinks(subpathLinks, 'printables');
        expect(result.source_url).toBeNull();
    });

    it('extracts public domain license', () => {
        const result = classifyLinks(links, 'printables');
        expect(result.license).toBe('CC-PD');
    });
});

describe('classifyLinks - Thangs', () => {
    const links = [
        'https://thangs.com/designer/CharlesRegaud/3d-model/RAMA-Kitchen-rail-1352295',
        'https://thangs.com/designer/CharlesRegaud',
        'https://thangs.com/tag/kitchen%20rail',
        'https://thangs.com/tag/kitchen',
        'https://thangs.com/tag/rail',
    ];

    it('extracts source URL', () => {
        const result = classifyLinks(links, 'thangs');
        expect(result.source_url).toBe('https://thangs.com/designer/CharlesRegaud/3d-model/RAMA-Kitchen-rail-1352295');
    });

    it('strips /memberships from source URL', () => {
        const memberLinks = [
            'https://thangs.com/designer/Foo/3d-model/Bar-123/memberships',
        ];
        const result = classifyLinks(memberLinks, 'thangs');
        expect(result.source_url).toBe('https://thangs.com/designer/Foo/3d-model/Bar-123');
    });

    it('extracts designer from profile URL', () => {
        const result = classifyLinks(links, 'thangs');
        expect(result.designer).toBe('CharlesRegaud');
        expect(result.designer_url).toBe('https://thangs.com/designer/CharlesRegaud');
    });

    it('extracts tags from tag URLs', () => {
        const result = classifyLinks(links, 'thangs');
        expect(result.tags).toContain('kitchen rail');
        expect(result.tags).toContain('kitchen');
        expect(result.tags).toContain('rail');
    });
});

describe('parseLicenseFromUrl', () => {
    it('parses CC-BY-NC-4.0', () => {
        expect(parseLicenseFromUrl('https://creativecommons.org/licenses/by-nc/4.0/')).toBe('CC-BY-NC-4.0');
    });

    it('parses CC-BY-SA-4.0', () => {
        expect(parseLicenseFromUrl('https://creativecommons.org/licenses/by-sa/4.0/')).toBe('CC-BY-SA-4.0');
    });

    it('parses public domain', () => {
        expect(parseLicenseFromUrl('https://creativecommons.org/share-your-work/public-domain/cc0/')).toBe('CC-PD');
    });
});

describe('parseDescription', () => {
    it('extracts text after Description header', () => {
        const text = `Some nav text\nDescription\nThis is a cool model that does things.\nMore details here.\n\nNext Section`;
        expect(parseDescription(text)).toBe('This is a cool model that does things. More details here.');
    });

    it('extracts text after Summary header', () => {
        const text = `Navigation\nSummary\nA useful kitchen tool for everyday use.\n\nFiles`;
        expect(parseDescription(text)).toBe('A useful kitchen tool for everyday use.');
    });

    it('returns null when no description section found', () => {
        const text = `Just random text without any section headers`;
        expect(parseDescription(text)).toBeNull();
    });

    it('limits description to 500 chars', () => {
        const longDesc = 'A'.repeat(600);
        const text = `Description\n${longDesc}\n\nEnd`;
        const result = parseDescription(text);
        expect(result!.length).toBeLessThanOrEqual(500);
    });
});
