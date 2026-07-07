import { Injectable, LogLevel, LoggerService } from '@nestjs/common';

@Injectable()
export class JsonLoggerService implements LoggerService {
  log(message: unknown, ...optionalParams: unknown[]) {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]) {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]) {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]) {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]) {
    this.write('verbose', message, optionalParams);
  }

  /** One structured JSON line per HTTP request — used by LoggingInterceptor. */
  logStructured(entry: Record<string, unknown>): void {
    this.emit({ timestamp: new Date().toISOString(), ...entry });
  }

  private write(level: LogLevel, message: unknown, optionalParams: unknown[]) {
    const context =
      optionalParams.length > 0 &&
      typeof optionalParams[optionalParams.length - 1] === 'string'
        ? (optionalParams[optionalParams.length - 1] as string)
        : undefined;
    this.emit({
      timestamp: new Date().toISOString(),
      level,
      message: typeof message === 'string' ? message : JSON.stringify(message),
      context,
    });
  }

  private emit(entry: Record<string, unknown>) {
    const clean = Object.fromEntries(
      Object.entries(entry).filter(([, value]) => value !== undefined),
    );
    process.stdout.write(JSON.stringify(clean) + '\n');
  }
}
