export function parsePage(pageParam) {
  const page = parseInt(pageParam, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}
