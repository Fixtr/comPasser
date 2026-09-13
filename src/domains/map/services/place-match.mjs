const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');

// Presentation's cross-language mismatch suppression is NOT proof of identity.
export function matchesPlaceIdentity(expected, found) {
    const a = normalize(expected).replace(/점$/, '');
    const b = normalize(found).replace(/점$/, '');
    if (!a || !b) return false;
    return a === b;
}

export function schedulePlaceName(item) {
    // Boundary and anchor titles describe an action, not necessarily a venue.
    if (['departure', 'arrival', 'AnchorSchedule'].includes(item.type)) return '';
    const title = String(item.title || '').trim();
    // Generic activity titles cannot establish identity; retain the explicit
    // location lookup for these and for user-authored anchor descriptions.
    if (/(근처|주변|맛집|식사|산책|관람|탐방|이동|휴식|nearby|near |lunch|dinner|breakfast|walk)/i.test(title)) return '';
    return title;
}
