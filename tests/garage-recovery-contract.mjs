import assert from 'node:assert/strict';
import { productionSource, productionReactComponent } from './helpers/production-source.mjs';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GarageGraphicsError,
  garageFailureFrom,
  createGarageRenderer,
} from '../src/lib/garage/startup.ts';

// Exercise the constructor guard that the actual explorer uses: exposed APIs can
// exist even while the browser refuses to create a WebGL context.
const explorer = productionSource(new URL('../src/lib/garage/explorer.ts', import.meta.url));
explorer.assertCall('mountExplorer', 'createGarageRenderer');
const initialize = (T) => createGarageRenderer(() => new T.WebGLRenderer());
const original = new Error('Error creating WebGL context.');
let failure;
try {
  initialize(
    {
      WebGLRenderer: class {
        constructor() {
          throw original;
        }
      },
    },
    GarageGraphicsError,
  );
} catch (error) {
  failure = error;
}
assert(failure instanceof GarageGraphicsError);
assert.equal(failure.cause, original);
assert.equal(garageFailureFrom(failure), 'graphics');
assert.equal(
  garageFailureFrom(new Error('Asset returned 404')),
  'load',
  'Asset failures must not blame browser settings',
);
assert.equal(garageFailureFrom(null), 'load');
const renderer = { ready: true };
assert.equal(
  initialize(
    {
      WebGLRenderer: class {
        constructor() {
          return renderer;
        }
      },
    },
    GarageGraphicsError,
  ),
  renderer,
);

const Recovery = productionReactComponent(
  new URL('../src/components/GarageRecovery.tsx', import.meta.url),
  createElement,
  Fragment,
);
const graphics = renderToStaticMarkup(
  createElement(Recovery, { failure: 'graphics', onRetry() {} }),
);
assert.match(graphics, /graphics acceleration may be off/i);
assert.match(graphics, /relaunch/i);
for (const browser of ['Brave', 'Chrome', 'Edge', 'Firefox']) assert(graphics.includes(browser));
assert(graphics.includes('brave://settings/system'));
for (const kind of ['load', 'context-lost']) {
  const html = renderToStaticMarkup(createElement(Recovery, { failure: kind, onRetry() {} }));
  assert(
    !html.includes('garage-recovery-steps'),
    'Unrelated failures must not give acceleration instructions',
  );
  assert(html.includes('Try again'));
}
let retries = 0;
const tree = Recovery({ failure: 'graphics', onRetry: () => retries++ });
const button = tree.props.children.find((child) => child?.type === 'button');
button.props.onClick();
assert.equal(retries, 1, 'Retry invokes the real supplied action');
console.log(
  'PASS: denied graphics context, original cause, successful renderer, asset-failure distinction, browser guidance, and retry action.',
);
