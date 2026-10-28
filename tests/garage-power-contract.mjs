import assert from 'node:assert/strict';
import { createGaragePower } from '../src/lib/garage/power.ts';
const power = createGaragePower();
assert.deepEqual(
  power.toggleLights(),
  { lights: false, computers: { kazam: true, projects: true } },
  'Room lighting must leave both computers powered',
);
assert.deepEqual(
  power.toggleComputer('kazam').computers,
  { kazam: false, projects: true },
  'The work tower must not switch off the personal computer',
);
assert.deepEqual(
  power.toggleComputers(),
  { lights: false, computers: { kazam: false, projects: false } },
  'Shared switch turns remaining machines off without lighting the room',
);
assert.deepEqual(
  power.toggleComputers().computers,
  { kazam: true, projects: true },
  'Shared switch starts both computers again',
);
power.toggleComputer('projects');
assert.equal(power.snapshot().computers.kazam, true);
const leaked = power.snapshot();
leaked.computers.kazam = false;
assert.equal(power.snapshot().computers.kazam, true, 'UI snapshots cannot mutate live circuits');
assert.deepEqual(power.toggleLights(), {
  lights: true,
  computers: { kazam: true, projects: false },
});
console.log('PASS: independent lights, each tower, shared computer switch, snapshot isolation.');
