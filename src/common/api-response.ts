// Shared success envelope helper. The error envelope shape is produced by
// AllExceptionsFilter (see common/filters/all-exceptions.filter.ts) so every
// thrown error — HttpException or otherwise — ends up in the same shape.
export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  message?: string;
}

export function ok<T>(data: T, message?: string): ApiSuccessBody<T> {
  return message === undefined ? { success: true, data } : { success: true, data, message };
}
