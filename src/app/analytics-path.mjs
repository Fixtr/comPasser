/**
 * The page address analytics may see (스펙 9): a route shape from the shell's table, never the address itself.
 * Ids become ':id', query strings and hashes are dropped, and an address outside the table is '/not-found'.
 * @param {string} pathname
 * @param {string[]} routes route patterns; a pattern may end in '/:id'
 */
export function analyticsPagePath(pathname, routes) {
  const path = String(pathname ?? '').split(/[?#]/)[0].replace(/(.)\/+$/, '$1');
  if (routes.includes(path)) return path;
  const masked = path.replace(/\/[^/]+$/, '/:id');
  return routes.includes(masked) ? masked : '/not-found';
}
