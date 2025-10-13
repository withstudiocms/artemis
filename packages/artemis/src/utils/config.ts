import { ConfigProvider } from 'effect';

/**
 * Creates a configuration provider that reads environment variables with a specific prefix,
 * applies nested configuration parsing, and converts keys to constant case.
 *
 * @param prefix - The prefix to use for environment variable keys.
 * @returns A configured `ConfigProvider` instance that processes environment variables
 *          with the given prefix, supports nested configuration, and uses constant case for keys.
 */
export const nestedConfigProvider = (prefix: string) =>
	ConfigProvider.fromEnv().pipe(ConfigProvider.nested(prefix), ConfigProvider.constantCase);
