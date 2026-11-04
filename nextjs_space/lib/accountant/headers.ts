/**
 * Request headers the middleware stamps on every request it lets through, so
 * `requireUserCompany` can apply the read-only rule without each route
 * passing its Request in.
 *
 * The middleware always overwrites them from the real request, so a client
 * cannot send its own value. When they are missing (no middleware ran), the
 * read-only check fails closed. Edge-safe: no Node imports here.
 */
export const REQUEST_METHOD_HEADER = 'x-cc-request-method';
export const REQUEST_PATH_HEADER = 'x-cc-request-path';
