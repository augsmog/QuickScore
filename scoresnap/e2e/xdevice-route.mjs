const SAVED_CONTEST_PATH = /^\/contest\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSavedContestPath(pathname) {
  return SAVED_CONTEST_PATH.test(pathname);
}
