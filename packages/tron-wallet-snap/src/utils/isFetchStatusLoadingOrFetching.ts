import { FetchStatus } from '../types/snap';

/**
 *
 * Since both FetchStatus.Loading and FetchStatus.Fetching represent
 * a time when a request is in-flight, this helper returns `true` if
 * the input status is in one of those two states
 *
 * @param status the status to check the state of
 * @returns whether the status is considered as fetching or loading
 */
export function isFetchStatusLoadingOrFetching(status: FetchStatus): boolean {
  return status === FetchStatus.Loading || status === FetchStatus.Fetching;
}
