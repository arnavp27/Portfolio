export type GarageFailure = 'graphics' | 'load' | 'context-lost';

/** A browser can deny a graphics context even when it exposes the WebGL API. */
export class GarageGraphicsError extends Error {
  constructor(cause: unknown) {
    super('The browser could not start the garage’s 3D graphics.', { cause });
    this.name = 'GarageGraphicsError';
  }
}

export function garageFailureFrom(error: unknown): GarageFailure {
  return error instanceof GarageGraphicsError ? 'graphics' : 'load';
}

/** Keep a denied WebGL context distinct from an asset-loading failure. */
export function createGarageRenderer<T>(create: () => T): T {
  try {
    return create();
  } catch (error) {
    throw new GarageGraphicsError(error);
  }
}
