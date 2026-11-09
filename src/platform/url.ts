export interface PageLocation { origin: string; pathname: string }

/**
 * The address to put in a shared result: the game page only, never the query string.
 * Preview flags such as ?devlv, ?devday, ?ads and ?adsblocked belong to this session, not to the receiver.
 */
export function cleanShareUrl(location: PageLocation): string {
  return location.origin + location.pathname;
}
