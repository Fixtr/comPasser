const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');

// Presentation's cross-language mismatch suppression is NOT proof of identity.
export function matchesPlaceIdentity(expected, found) {
    const a = normalize(expected).replace(/점$/, '');
    const b = normalize(found).replace(/점$/, '');
    if (!a || !b) return false;
    return a === b;
}

// Text search bias is not a restriction. A same-named shop in another district
// must not silently replace the requested venue, including name-only retries.
export function matchesPlaceArea(location, address) {
    const districts = String(location || '').match(/(?:^|\s)([가-힣]+(?:구|군))(?=\s|$)/g) || [];
    return districts.every(district => String(address || '').split(/\s+/).includes(district.trim()));
}

export function schedulePlaceName(item) {
    // Boundary and anchor titles describe an action, not necessarily a venue.
    if (['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) return '';
    // Strip only a trailing activity label, never discard the venue itself.
    // A generic recommendation has no verifiable identity: null means do not
    // geocode it, whereas '' is reserved for user-specified boundary/anchors.
    const title = String(item.title || '').trim()
        .replace(/^(?:(?:점심|저녁|아침)(?: 식사)?|lunch|dinner|breakfast)\s*[-:·–—]\s*/i, '')
        .replace(/\s*(?:\((?:산책|관람|탐방|방문|점심|저녁|아침|식사)\)|\s+(?:산책|관람|탐방|방문|점심 식사|저녁 식사|아침 식사|식사))\s*$/, '')
        .replace(/^(?:walk (?:in|around)|visit to|visit)\s+/i, '')
        .replace(/\s+(?:walk|visit)$/i, '').trim();
    if (!title || /^(점심|저녁|아침)$/.test(title) || /(근처|주변|맛집|식사|산책|관람|탐방|이동|휴식|nearby|near |lunch|dinner|breakfast|walk)/i.test(title)) return null;
    return title;
}
