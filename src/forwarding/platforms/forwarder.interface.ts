export interface ForwarderResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: unknown;
  errorMessage?: string;
}
