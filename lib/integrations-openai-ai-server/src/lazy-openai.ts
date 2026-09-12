import OpenAI from "openai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} must be set. Did you forget to provision the OpenAI AI integration?`,
    );
  }
  return value;
}

/**
 * An OpenAI client that is not constructed until something is read from it.
 *
 * **Why:** these clients used to be built at import time, which made merely
 * importing a module from this package require the integration's environment
 * variables. Anything that pulled in a transcription helper — including test
 * files that mock the network and never make a call — failed to load without
 * them. Deferring construction keeps the same export shape and the same error
 * message, raised at first use instead of at import.
 */
export function lazyOpenAI(): OpenAI {
  let instance: OpenAI | undefined;
  const resolve = (): OpenAI => {
    instance ??= new OpenAI({
      baseURL: requireEnv("AI_INTEGRATIONS_OPENAI_BASE_URL"),
      apiKey: requireEnv("AI_INTEGRATIONS_OPENAI_API_KEY"),
    });
    return instance;
  };

  return new Proxy({} as OpenAI, {
    get(_target, property) {
      const client = resolve();
      const value: unknown = Reflect.get(client, property);
      return typeof value === "function" ? value.bind(client) : value;
    },
    set(_target, property, value) {
      return Reflect.set(resolve(), property, value);
    },
    has(_target, property) {
      return property in resolve();
    },
    ownKeys(_target) {
      return Reflect.ownKeys(resolve());
    },
    getOwnPropertyDescriptor(_target, property) {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), property);
      // Proxy invariant: a descriptor reported for a property the target does
      // not have must be configurable.
      return descriptor && { ...descriptor, configurable: true };
    },
    getPrototypeOf(_target) {
      return Reflect.getPrototypeOf(resolve());
    },
  });
}
